/* global fetch localStorage Audio */

let initialized = false
let audioElement = null
let currentSource = 'trending' // trending, search, radio, favorites, queue
let queue = [] // Array of { id, title, artist, artwork, streamUrl, source }
let currentTrackIndex = -1
let isPlaying = false
let isShuffle = false
let isRepeat = false // false, true (repeat queue), 'one' (repeat single)
let volume = 0.8
let favorites = [] // Array of track objects

// Audius API discovery cache
let audiusHost = 'https://audius-discovery-1.cultur3stake.com'
let audiusHostCheckedAt = 0

// Radio Browser API endpoint
const RADIO_API_BASE = 'https://de1.api.radio-browser.info'

// In-memory cache for API results
const apiCache = new Map() // key -> { timestamp, data }

// Seek bar throttling
let lastSeekUpdate = 0
let rafId = null

function toast (msg) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._timer)
  t._timer = setTimeout(() => t.classList.remove('show'), 2600)
}

function formatDuration (secs) {
  if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

async function getAudiusHost () {
  const now = Date.now()
  if (audiusHost && now - audiusHostCheckedAt < 3600000) {
    return audiusHost
  }
  try {
    const res = await fetch('https://api.audius.co', { cache: 'no-cache' })
    const json = await res.json()
    if (json && json.data && json.data.length > 0) {
      audiusHost = json.data[Math.floor(Math.random() * json.data.length)]
      audiusHostCheckedAt = now
      return audiusHost
    }
  } catch (e) {
    console.warn('Could not discover Audius host, using fallback:', e)
  }
  return audiusHost
}

const musicPlayer = {
  initialize: function () {
    if (initialized) return
    initialized = true

    // Load persisted state
    try {
      const savedFavs = localStorage.getItem('prism_music_favorites')
      if (savedFavs) favorites = JSON.parse(savedFavs)
    } catch (e) {}

    try {
      const savedVol = localStorage.getItem('prism_music_volume')
      if (savedVol !== null) volume = parseFloat(savedVol) || 0.8
    } catch (e) {}

    try {
      const savedSource = localStorage.getItem('prism_music_source')
      if (savedSource) currentSource = savedSource
    } catch (e) {}

    try {
      const savedQueue = localStorage.getItem('prism_music_queue')
      if (savedQueue) queue = JSON.parse(savedQueue).slice(0, 200)
    } catch (e) {}

    // Mount single <audio> element in renderer document
    audioElement = document.createElement('audio')
    audioElement.id = 'prismMainAudio'
    audioElement.volume = volume
    audioElement.preload = 'none'
    document.body.appendChild(audioElement)

    musicPlayer.bindAudioEvents()
    musicPlayer.bindDomEvents()
    musicPlayer.bindMediaSession()

    // Sync volume slider and mini player UI
    const volSlider = document.getElementById('musicVolSlider')
    if (volSlider) volSlider.value = volume

    musicPlayer.updateMiniPlayerUI()
  },

  bindAudioEvents: function () {
    if (!audioElement) return

    audioElement.addEventListener('play', () => {
      isPlaying = true
      musicPlayer.updatePlayPauseIcons(true)
      musicPlayer.startSeekTicker()
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    })

    audioElement.addEventListener('pause', () => {
      isPlaying = false
      musicPlayer.updatePlayPauseIcons(false)
      musicPlayer.stopSeekTicker()
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    })

    audioElement.addEventListener('ended', () => {
      if (isRepeat === 'one') {
        audioElement.currentTime = 0
        audioElement.play().catch(() => {})
      } else {
        musicPlayer.next()
      }
    })

    audioElement.addEventListener('error', (e) => {
      console.warn('Audio stream error or network timeout:', e)
      toast('Stream connection error, skipping...')
      musicPlayer.next()
    })

    audioElement.addEventListener('timeupdate', () => {
      const now = performance.now()
      // Throttle seek bar DOM writes to at most once per second
      if (now - lastSeekUpdate > 1000) {
        lastSeekUpdate = now
        musicPlayer.updateSeekBar()
      }
    })

    audioElement.addEventListener('durationchange', () => {
      const totalTimeEl = document.getElementById('musicTotalTime')
      if (totalTimeEl) totalTimeEl.textContent = formatDuration(audioElement.duration)
    })
  },

  bindMediaSession: function () {
    if (!('mediaSession' in navigator)) return

    try {
      navigator.mediaSession.setActionHandler('play', () => musicPlayer.play())
      navigator.mediaSession.setActionHandler('pause', () => musicPlayer.pause())
      navigator.mediaSession.setActionHandler('previoustrack', () => musicPlayer.prev())
      navigator.mediaSession.setActionHandler('nexttrack', () => musicPlayer.next())
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime && audioElement && !isNaN(audioElement.duration)) {
          audioElement.currentTime = details.seekTime
          musicPlayer.updateSeekBar()
        }
      })
    } catch (e) {
      console.warn('Error setting up navigator.mediaSession:', e)
    }
  },

  updateMediaSessionMetadata: function (track) {
    if (!('mediaSession' in navigator) || !track) return
    try {
      const artwork = track.artwork ? [{ src: track.artwork, sizes: '150x150', type: 'image/jpeg' }] : []
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.source === 'radio' ? 'Radio Station' : 'Audius Stream',
        artwork: artwork
      })
    } catch (e) {}
  },

  bindDomEvents: function () {
    // Mini-player buttons
    const miniPlayer = document.getElementById('miniPlayer')
    const miniOpen = document.getElementById('miniPlayerOpenBtn')
    const miniArt = document.getElementById('miniPlayerArt')
    const miniPlay = document.getElementById('miniPlayerPlay')
    const miniPrev = document.getElementById('miniPlayerPrev')
    const miniNext = document.getElementById('miniPlayerNext')

    if (miniOpen) miniOpen.onclick = () => musicPlayer.toggle(true)
    if (miniArt) miniArt.onclick = () => musicPlayer.toggle(true)
    if (miniPlay) {
      miniPlay.onclick = (e) => {
        e.stopPropagation()
        musicPlayer.togglePlayPause()
      }
    }
    if (miniPrev) {
      miniPrev.onclick = (e) => {
        e.stopPropagation()
        musicPlayer.prev()
      }
    }
    if (miniNext) {
      miniNext.onclick = (e) => {
        e.stopPropagation()
        musicPlayer.next()
      }
    }

    // Music Panel Controls
    const closeMusicBtn = document.getElementById('closeMusicPanel')
    if (closeMusicBtn) closeMusicBtn.onclick = () => musicPlayer.toggle(false)

    // Source Tabs
    const tabsContainer = document.getElementById('musicSourceTabs')
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.sp-tab')
        if (tabBtn && tabBtn.dataset.source) {
          musicPlayer.switchSource(tabBtn.dataset.source)
        }
      })
    }

    // Search bar inside music panel
    const searchInput = document.getElementById('musicSearchInput')
    const clearSearchBtn = document.getElementById('clearMusicSearch')
    let searchDebounce = null

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim()
        if (clearSearchBtn) clearSearchBtn.hidden = !val
        if (searchDebounce) clearTimeout(searchDebounce)
        searchDebounce = setTimeout(() => {
          musicPlayer.executeSearch(val)
        }, 300)
      })

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (searchDebounce) clearTimeout(searchDebounce)
          musicPlayer.executeSearch(searchInput.value.trim())
        }
      })
    }

    if (clearSearchBtn) {
      clearSearchBtn.onclick = () => {
        if (searchInput) {
          searchInput.value = ''
          searchInput.focus()
        }
        clearSearchBtn.hidden = true
        musicPlayer.executeSearch('')
      }
    }

    // Dock Player controls
    const playBtn = document.getElementById('musicPlayBtn')
    const prevBtn = document.getElementById('musicPrevBtn')
    const nextBtn = document.getElementById('musicNextBtn')
    const shuffleBtn = document.getElementById('musicShuffleBtn')
    const repeatBtn = document.getElementById('musicRepeatBtn')
    const seekBar = document.getElementById('musicSeekBar')
    const volSlider = document.getElementById('musicVolSlider')
    const muteBtn = document.getElementById('musicMuteBtn')

    if (playBtn) playBtn.onclick = () => musicPlayer.togglePlayPause()
    if (prevBtn) prevBtn.onclick = () => musicPlayer.prev()
    if (nextBtn) nextBtn.onclick = () => musicPlayer.next()

    if (shuffleBtn) {
      shuffleBtn.onclick = () => {
        isShuffle = !isShuffle
        shuffleBtn.classList.toggle('active', isShuffle)
        toast(isShuffle ? 'Shuffle on' : 'Shuffle off')
      }
    }

    if (repeatBtn) {
      repeatBtn.onclick = () => {
        if (!isRepeat) {
          isRepeat = true
          repeatBtn.classList.add('active')
          toast('Repeat queue')
        } else if (isRepeat === true) {
          isRepeat = 'one'
          repeatBtn.classList.add('active')
          toast('Repeat track')
        } else {
          isRepeat = false
          repeatBtn.classList.remove('active')
          toast('Repeat off')
        }
      }
    }

    if (seekBar) {
      seekBar.addEventListener('input', () => {
        if (audioElement && audioElement.duration) {
          const seekTo = (seekBar.value / 100) * audioElement.duration
          audioElement.currentTime = seekTo
          const curTimeEl = document.getElementById('musicCurrentTime')
          if (curTimeEl) curTimeEl.textContent = formatDuration(seekTo)
        }
      })
    }

    if (volSlider) {
      volSlider.addEventListener('input', () => {
        volume = parseFloat(volSlider.value)
        if (audioElement) audioElement.volume = volume
        try { localStorage.setItem('prism_music_volume', volume) } catch (e) {}
      })
    }

    if (muteBtn) {
      let prevVol = 0.8
      muteBtn.onclick = () => {
        if (audioElement.volume > 0) {
          prevVol = audioElement.volume
          audioElement.volume = 0
          if (volSlider) volSlider.value = 0
        } else {
          audioElement.volume = prevVol || 0.8
          if (volSlider) volSlider.value = audioElement.volume
        }
      }
    }

    // Track list click delegation
    const listContainer = document.getElementById('musicListContainer')
    if (listContainer) {
      listContainer.addEventListener('click', (e) => {
        const favBtn = e.target.closest('.music-btn-fav')
        if (favBtn) {
          e.stopPropagation()
          const trackData = favBtn.closest('.music-item-row')._trackData
          if (trackData) musicPlayer.toggleFavorite(trackData)
          return
        }

        const removeBtn = e.target.closest('.music-btn-remove')
        if (removeBtn) {
          e.stopPropagation()
          const index = parseInt(removeBtn.dataset.queueIndex, 10)
          if (!isNaN(index)) musicPlayer.removeFromQueue(index)
          return
        }

        const row = e.target.closest('.music-item-row')
        if (row && row._trackData) {
          musicPlayer.playTrackFromList(row._trackData)
        }
      })
    }

    // Pause timers when window minimized or hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        musicPlayer.stopSeekTicker()
      } else if (isPlaying) {
        musicPlayer.startSeekTicker()
      }
    })
  },

  toggle: function (force) {
    musicPlayer.initialize()
    const panel = document.getElementById('musicPanel')
    if (!panel) return

    const willOpen = typeof force === 'boolean' ? force : panel.classList.contains('closed')

    if (willOpen) {
      panel.classList.remove('closed')
      panel.removeAttribute('inert')
      musicPlayer.switchSource(currentSource)
    } else {
      panel.classList.add('closed')
      panel.setAttribute('inert', '')
    }
  },

  switchSource: function (source) {
    currentSource = source
    try { localStorage.setItem('prism_music_source', source) } catch (e) {}

    // Update tab indicators
    document.querySelectorAll('.sp-tab').forEach(tab => {
      const isSel = tab.dataset.source === source
      tab.setAttribute('aria-selected', isSel ? 'true' : 'false')
    })

    const searchBar = document.getElementById('musicSearchBar')
    const searchInput = document.getElementById('musicSearchInput')

    if (source === 'search' || source === 'radio') {
      if (searchBar) searchBar.hidden = false
      if (searchInput) {
        searchInput.placeholder = source === 'radio' ? 'Search radio stations by genre or country...' : 'Search Audius tracks or artists...'
        setTimeout(() => searchInput.focus(), 50)
      }
    } else {
      if (searchBar) searchBar.hidden = true
    }

    musicPlayer.loadCurrentSource()
  },

  loadCurrentSource: async function () {
    const listContent = document.getElementById('musicListContent')
    const emptyEl = document.getElementById('musicEmpty')
    const loaderEl = document.getElementById('musicLoader')
    if (!listContent) return

    if (currentSource === 'favorites') {
      if (loaderEl) loaderEl.hidden = true
      musicPlayer.renderTrackList(favorites)
      return
    }

    if (currentSource === 'queue') {
      if (loaderEl) loaderEl.hidden = true
      musicPlayer.renderTrackList(queue, true)
      return
    }

    if (currentSource === 'trending') {
      const cacheKey = 'audius_trending'
      const cached = apiCache.get(cacheKey)
      const now = Date.now()
      if (cached && now - cached.timestamp < 300000) { // 5-minute TTL
        musicPlayer.renderTrackList(cached.data)
        return
      }

      if (loaderEl) loaderEl.hidden = false
      if (emptyEl) emptyEl.hidden = true
      listContent.innerHTML = ''

      try {
        const host = await getAudiusHost()
        const res = await fetch(`${host}/v1/tracks/trending?app_name=PrismBrowser`)
        const json = await res.json()
        const tracks = (json && json.data ? json.data : []).map(t => ({
          id: t.id,
          title: t.title,
          artist: t.user ? t.user.name : 'Unknown Artist',
          artwork: t.artwork ? (t.artwork['150x150'] || t.artwork['480x480']) : null,
          streamUrl: `${host}/v1/tracks/${t.id}/stream?app_name=PrismBrowser`,
          duration: t.duration || 0,
          source: 'audius'
        }))

        apiCache.set(cacheKey, { timestamp: now, data: tracks })
        if (loaderEl) loaderEl.hidden = true
        musicPlayer.renderTrackList(tracks)
      } catch (e) {
        console.warn('Error loading trending tracks:', e)
        if (loaderEl) loaderEl.hidden = true
        if (emptyEl) {
          emptyEl.textContent = 'Failed to load trending tracks.'
          emptyEl.hidden = false
        }
      }
    }
  },

  executeSearch: async function (query) {
    if (!query) {
      musicPlayer.renderTrackList([])
      return
    }

    const listContent = document.getElementById('musicListContent')
    const emptyEl = document.getElementById('musicEmpty')
    const loaderEl = document.getElementById('musicLoader')

    const cacheKey = `${currentSource}_${query.toLowerCase()}`
    const cached = apiCache.get(cacheKey)
    const now = Date.now()
    if (cached && now - cached.timestamp < 60000) { // 1-minute TTL
      musicPlayer.renderTrackList(cached.data)
      return
    }

    if (loaderEl) loaderEl.hidden = false
    if (emptyEl) emptyEl.hidden = true
    if (listContent) listContent.innerHTML = ''

    if (currentSource === 'search') {
      try {
        const host = await getAudiusHost()
        const res = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=PrismBrowser`)
        const json = await res.json()
        const tracks = (json && json.data ? json.data : []).slice(0, 50).map(t => ({
          id: t.id,
          title: t.title,
          artist: t.user ? t.user.name : 'Unknown Artist',
          artwork: t.artwork ? (t.artwork['150x150'] || t.artwork['480x480']) : null,
          streamUrl: `${host}/v1/tracks/${t.id}/stream?app_name=PrismBrowser`,
          duration: t.duration || 0,
          source: 'audius'
        }))

        apiCache.set(cacheKey, { timestamp: now, data: tracks })
        if (loaderEl) loaderEl.hidden = true
        musicPlayer.renderTrackList(tracks)
      } catch (e) {
        if (loaderEl) loaderEl.hidden = true
        if (emptyEl) {
          emptyEl.textContent = 'Search failed.'
          emptyEl.hidden = false
        }
      }
    } else if (currentSource === 'radio') {
      try {
        const res = await fetch(`${RADIO_API_BASE}/json/stations/byname/${encodeURIComponent(query)}?limit=40`)
        const stations = await res.json()
        const tracks = (stations || []).map(s => ({
          id: s.stationuuid,
          title: s.name,
          artist: `${s.country || 'Global'} • ${s.tags ? s.tags.split(',').slice(0, 2).join(', ') : 'Radio'}`,
          artwork: s.favicon || null,
          streamUrl: s.url_resolved || s.url,
          duration: 0,
          source: 'radio'
        }))

        apiCache.set(cacheKey, { timestamp: now, data: tracks })
        if (loaderEl) loaderEl.hidden = true
        musicPlayer.renderTrackList(tracks)
      } catch (e) {
        if (loaderEl) loaderEl.hidden = true
        if (emptyEl) {
          emptyEl.textContent = 'Radio search failed.'
          emptyEl.hidden = false
        }
      }
    }
  },

  renderTrackList: function (tracks, isQueueView) {
    const listContent = document.getElementById('musicListContent')
    const emptyEl = document.getElementById('musicEmpty')
    if (!listContent) return

    if (!tracks || tracks.length === 0) {
      listContent.innerHTML = ''
      if (emptyEl) {
        emptyEl.textContent = isQueueView ? 'Queue is empty.' : 'No tracks found.'
        emptyEl.hidden = false
      }
      return
    }

    if (emptyEl) emptyEl.hidden = true

    const currentPlayingId = queue[currentTrackIndex] ? queue[currentTrackIndex].id : null

    listContent.innerHTML = tracks.map((track, idx) => {
      const isFav = favorites.some(f => f.id === track.id)
      const isActive = track.id === currentPlayingId

      return `<div class="music-item-row ${isActive ? 'active' : ''}" data-index="${idx}">
        <div class="music-item-art">
          ${track.artwork
            ? `<img src="${escapeHtml(track.artwork)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" /><svg class="i" style="display:none;width:16px;height:16px;stroke:var(--muted);"><use href="#i-music"/></svg>`
            : `<svg class="i" style="width:16px;height:16px;stroke:var(--muted);"><use href="#i-music"/></svg>`}
        </div>
        <div class="music-item-details">
          <div class="music-item-title" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</div>
          <div class="music-item-subtitle" title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</div>
        </div>
        <div class="music-item-actions">
          <button class="icon-btn-tiny music-btn-fav ${isFav ? 'active' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" aria-label="Favorite">
            <svg class="i"><use href="#i-heart"/></svg>
          </button>
          ${isQueueView
            ? `<button class="icon-btn-tiny music-btn-remove" data-queue-index="${idx}" title="Remove from queue" aria-label="Remove">
                <svg class="i"><use href="#i-x"/></svg>
              </button>`
            : ''}
        </div>
      </div>`
    }).join('')

    // Attach track data references to DOM nodes for fast retrieval
    const rowEls = listContent.querySelectorAll('.music-item-row')
    rowEls.forEach((row, i) => {
      row._trackData = tracks[i]
    })
  },

  playTrackFromList: function (track) {
    if (!track) return

    // If queue doesn't contain this track, insert it after current track or append
    let foundIndex = queue.findIndex(t => t.id === track.id)
    if (foundIndex === -1) {
      if (queue.length >= 200) queue.shift()
      queue.push(track)
      foundIndex = queue.length - 1
      musicPlayer.persistQueue()
    }

    musicPlayer.playTrackAtIndex(foundIndex)
  },

  playTrackAtIndex: function (index) {
    if (index < 0 || index >= queue.length) return
    currentTrackIndex = index
    const track = queue[index]

    if (!audioElement) return

    audioElement.src = track.streamUrl
    audioElement.play().then(() => {
      isPlaying = true
      musicPlayer.updatePlayPauseIcons(true)
    }).catch(err => {
      console.warn('Playback error:', err)
      toast('Playback failed, skipping...')
      musicPlayer.next()
    })

    musicPlayer.updateMediaSessionMetadata(track)
    musicPlayer.updateMiniPlayerUI()
    musicPlayer.updateDockPlayerUI()

    // Preload next track metadata only (never the stream data)
    const nextIdx = (index + 1) % queue.length
    if (queue[nextIdx] && queue[nextIdx].artwork) {
      const img = new Image()
      img.src = queue[nextIdx].artwork
    }
  },

  play: function () {
    if (!audioElement) return
    if (!audioElement.src && queue.length > 0) {
      musicPlayer.playTrackAtIndex(currentTrackIndex >= 0 ? currentTrackIndex : 0)
    } else {
      audioElement.play().catch(() => {})
    }
  },

  pause: function () {
    if (audioElement) audioElement.pause()
  },

  togglePlayPause: function () {
    if (isPlaying) {
      musicPlayer.pause()
    } else {
      musicPlayer.play()
    }
  },

  prev: function () {
    if (audioElement && audioElement.currentTime > 3) {
      audioElement.currentTime = 0
      return
    }
    if (queue.length === 0) return

    let prevIdx = currentTrackIndex - 1
    if (prevIdx < 0) prevIdx = queue.length - 1
    musicPlayer.playTrackAtIndex(prevIdx)
  },

  next: function () {
    if (queue.length === 0) return

    let nextIdx
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length)
    } else {
      nextIdx = currentTrackIndex + 1
      if (nextIdx >= queue.length) {
        if (isRepeat) nextIdx = 0
        else return // stop at end of queue
      }
    }
    musicPlayer.playTrackAtIndex(nextIdx)
  },

  toggleFavorite: function (track) {
    const idx = favorites.findIndex(f => f.id === track.id)
    if (idx >= 0) {
      favorites.splice(idx, 1)
      toast('Removed from favorites')
    } else {
      favorites.unshift(track)
      toast('Added to favorites')
    }
    try { localStorage.setItem('prism_music_favorites', JSON.stringify(favorites)) } catch (e) {}

    if (currentSource === 'favorites') {
      musicPlayer.renderTrackList(favorites)
    } else {
      // Update favorite icon in active list
      document.querySelectorAll('.music-item-row').forEach(row => {
        if (row._trackData && row._trackData.id === track.id) {
          const btn = row.querySelector('.music-btn-fav')
          if (btn) btn.classList.toggle('active', idx < 0)
        }
      })
    }
  },

  removeFromQueue: function (index) {
    if (index >= 0 && index < queue.length) {
      queue.splice(index, 1)
      if (currentTrackIndex === index) {
        if (queue.length > 0) {
          musicPlayer.playTrackAtIndex(index % queue.length)
        } else {
          audioElement.src = ''
          isPlaying = false
          musicPlayer.updatePlayPauseIcons(false)
        }
      } else if (currentTrackIndex > index) {
        currentTrackIndex--
      }
      musicPlayer.persistQueue()
      musicPlayer.renderTrackList(queue, true)
    }
  },

  persistQueue: function () {
    try {
      localStorage.setItem('prism_music_queue', JSON.stringify(queue.slice(0, 200)))
    } catch (e) {}
  },

  updatePlayPauseIcons: function (playing) {
    const miniIcon = document.getElementById('miniPlayerPlayIcon')
    const dockIcon = document.getElementById('musicPlayIcon')

    const href = playing ? '#i-pause' : '#i-play'
    if (miniIcon) {
      const use = miniIcon.querySelector('use')
      if (use) use.setAttribute('href', href)
    }
    if (dockIcon) {
      const use = dockIcon.querySelector('use')
      if (use) use.setAttribute('href', href)
    }
  },

  updateMiniPlayerUI: function () {
    const track = queue[currentTrackIndex]
    const miniTitle = document.getElementById('miniPlayerTitle')
    const miniArtist = document.getElementById('miniPlayerArtist')
    const miniImg = document.getElementById('miniPlayerImg')
    const miniArt = document.getElementById('miniPlayerArt')

    if (!track) {
      if (miniTitle) miniTitle.textContent = 'Music Player'
      if (miniArtist) miniArtist.textContent = 'Alt+M to expand'
      if (miniImg) miniImg.hidden = true
      return
    }

    if (miniTitle) miniTitle.textContent = track.title
    if (miniArtist) miniArtist.textContent = track.artist

    if (miniImg) {
      if (track.artwork) {
        miniImg.src = track.artwork
        miniImg.hidden = false
      } else {
        miniImg.hidden = true
      }
    }
  },

  updateDockPlayerUI: function () {
    const track = queue[currentTrackIndex]
    const titleEl = document.getElementById('musicDockTitle')
    const artistEl = document.getElementById('musicDockArtist')
    const imgEl = document.getElementById('musicDockImg')

    if (!track) {
      if (titleEl) titleEl.textContent = 'No track playing'
      if (artistEl) artistEl.textContent = 'Choose music above'
      if (imgEl) imgEl.hidden = true
      return
    }

    if (titleEl) titleEl.textContent = track.title
    if (artistEl) artistEl.textContent = track.artist

    if (imgEl) {
      if (track.artwork) {
        imgEl.src = track.artwork
        imgEl.hidden = false
      } else {
        imgEl.hidden = true
      }
    }
  },

  updateSeekBar: function () {
    const seekBar = document.getElementById('musicSeekBar')
    const curTimeEl = document.getElementById('musicCurrentTime')
    if (!audioElement || !seekBar) return

    const duration = audioElement.duration
    const currentTime = audioElement.currentTime

    if (duration && !isNaN(duration) && isFinite(duration)) {
      seekBar.value = Math.floor((currentTime / duration) * 100)
      if (curTimeEl) curTimeEl.textContent = formatDuration(currentTime)
    }
  },

  startSeekTicker: function () {
    if (rafId) cancelAnimationFrame(rafId)
    const tick = () => {
      const panel = document.getElementById('musicPanel')
      // Only execute updates if panel is open and not minimized
      if (isPlaying && panel && !panel.classList.contains('closed') && !document.hidden) {
        musicPlayer.updateSeekBar()
      }
      if (isPlaying) {
        rafId = requestAnimationFrame(tick)
      }
    }
    rafId = requestAnimationFrame(tick)
  },

  stopSeekTicker: function () {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}

function escapeHtml (str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

module.exports = musicPlayer
