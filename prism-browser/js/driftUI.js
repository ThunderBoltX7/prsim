const webviews = require('webviews.js')
const browserUI = require('browserUI.js')
const searchbar = require('searchbar/searchbar.js')
const searchEngine = require('util/searchEngine.js')
const urlParser = require('util/urlParser.js')
const settings = require('util/settings/settings.js')
const { parseMarkdown, escapeHtml } = require('util/markdown.js')

const driftSettings = {
  theme: 'light',
  accent: '#9fa8ff',
  blur: 20,
  collapsed: false,
  readout: false,
  calm: false,
  engine: 'DuckDuckGo',
  startSearch: true,
  saveTo: 'Downloads',
  dlPopup: true,
  openAi: false,
  context: true,
  length: 'concise',
  model: 'gpt-4o-mini',
  userName: '',
  aiEnabled: true,
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini'
}

const AI_PRESETS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini'
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3'
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant'
  }
}

const DEFAULT_SHORTCUTS = [
  { id: 'sc_1', title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { id: 'sc_2', title: 'GitHub', url: 'https://github.com' },
  { id: 'sc_3', title: 'Hacker News', url: 'https://news.ycombinator.com' },
  { id: 'sc_4', title: 'Wikipedia', url: 'https://en.wikipedia.org' },
  { id: 'sc_5', title: 'YouTube', url: 'https://youtube.com' },
  { id: 'sc_6', title: 'Reddit', url: 'https://reddit.com' }
]

let shortcutsList = []

function loadShortcuts () {
  try {
    const saved = settings.get('drift-shortcuts')
    if (Array.isArray(saved)) {
      shortcutsList = saved
    } else if (typeof saved === 'string' && saved.trim()) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        shortcutsList = parsed
      } else {
        shortcutsList = [...DEFAULT_SHORTCUTS]
      }
    } else {
      shortcutsList = [...DEFAULT_SHORTCUTS]
    }
  } catch (e) {
    shortcutsList = [...DEFAULT_SHORTCUTS]
  }
}

function saveShortcuts () {
  try {
    settings.set('drift-shortcuts', shortcutsList)
  } catch (e) {}
}

// Immediately load shortcuts into memory
loadShortcuts()

try {
  const saved = settings.get('drift-settings')
  if (saved && typeof saved === 'object') {
    Object.assign(driftSettings, saved)
  } else if (typeof saved === 'string' && saved.trim()) {
    Object.assign(driftSettings, JSON.parse(saved))
  }
} catch (e) {}

const hexA = (h, a) => {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

const saveDriftSettings = () => {
  try {
    settings.set('drift-settings', driftSettings)
  } catch (e) {}
}

let mode = 'web'
let toastTimer = 0
let dlItemsList = []
let activeAiAbortController = null

function toast (msg) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400)
}

// -------------------------------------------------------------
// Claude-Style Time-Aware Greetings
// -------------------------------------------------------------
function getClaudeGreeting (name) {
  const now = new Date()
  const hour = now.getHours()
  const cleanName = (name || '').trim()

  const withName = (patternWithComma, patternWithoutComma) => {
    if (cleanName) {
      return patternWithComma.replace('{name}', cleanName)
    }
    return patternWithoutComma
  }

  // Early Morning (5:00 AM – 8:59 AM)
  if (hour >= 5 && hour < 9) {
    return withName('Rise and shine, {name}', 'Rise and shine')
  }
  // Morning (9:00 AM – 11:59 AM)
  if (hour >= 9 && hour < 12) {
    return withName('Good morning, {name}', 'Good morning')
  }
  // Midday (12:00 PM – 1:59 PM)
  if (hour >= 12 && hour < 14) {
    return withName('Good afternoon, {name}', 'Good afternoon')
  }
  // Afternoon / Coffee Break (2:00 PM – 4:59 PM)
  if (hour >= 14 && hour < 17) {
    return withName('Coffee time, {name}?', 'Coffee time?')
  }
  // Evening (5:00 PM – 8:59 PM)
  if (hour >= 17 && hour < 21) {
    return withName('Good evening, {name}', 'Good evening')
  }
  // Night / Late Hours (9:00 PM – 4:59 AM)
  return withName('Working late, {name}?', 'Working late?')
}

function updateHomeGreeting () {
  const heading = document.getElementById('home-greeting')
  if (heading) {
    heading.textContent = getClaudeGreeting(driftSettings.userName)
  }
}

// -------------------------------------------------------------
// Chrome-Style Shortcuts Management
// -------------------------------------------------------------
function getDomainFromUrl (u) {
  if (!u) return 'site'
  try {
    const parsed = new URL(u.startsWith('http') ? u : 'https://' + u)
    return parsed.hostname.replace(/^www\./, '')
  } catch (e) {
    return u.replace(/^https?:\/\//, '').split('/')[0] || 'site'
  }
}

function renderShortcutsGrid () {
  const grid = document.getElementById('shortcutsGrid')
  if (!grid) return

  if (!shortcutsList || shortcutsList.length === 0) {
    loadShortcuts()
  }

  const itemsHtml = shortcutsList.map(sc => {
    const domain = getDomainFromUrl(sc.url)
    const initial = (sc.title || domain || 'D')[0].toUpperCase()
    const hue = [...domain].reduce((acc, c) => acc + c.charCodeAt(0), 0) * 17 % 360
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`

    return `
      <div class="shortcut-tile" data-id="${sc.id}" data-url="${escapeHtml(sc.url)}" role="button" tabindex="0">
        <button type="button" class="sc-menu-btn" data-edit-id="${sc.id}" title="Edit shortcut" aria-label="Edit shortcut">
          <svg class="i"><use href="#i-dots"/></svg>
        </button>
        <div class="sc-icon-wrapper">
          <img class="sc-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='grid';" />
          <span class="sc-fallback-icon" style="display:none; background:hsl(${hue}, 55%, 48%)">${initial}</span>
        </div>
        <span class="sc-title" title="${escapeHtml(sc.title)}">${escapeHtml(sc.title)}</span>
      </div>
    `
  }).join('')

  const addTileHtml = `
    <div class="shortcut-tile add-shortcut-tile" id="addShortcutBtn" role="button" tabindex="0" title="Add shortcut">
      <div class="sc-icon-wrapper sc-add-icon">
        <svg class="i"><use href="#i-plus"/></svg>
      </div>
      <span class="sc-title">Add shortcut</span>
    </div>
  `

  grid.innerHTML = itemsHtml + addTileHtml

  // Wire click to navigate and contextmenu to edit
  grid.querySelectorAll('.shortcut-tile:not(.add-shortcut-tile)').forEach(tile => {
    tile.onclick = (e) => {
      if (e.target.closest('.sc-menu-btn')) return
      const url = tile.dataset.url
      if (url) {
        searchbar.openURL(url)
      }
    }
    tile.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      openShortcutModal(tile.dataset.id)
    }
  })

  // Wire edit buttons
  grid.querySelectorAll('.sc-menu-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      openShortcutModal(btn.dataset.editId)
    }
  })

  // Wire add shortcut button
  const addBtn = document.getElementById('addShortcutBtn')
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      openShortcutModal(null)
    }
  }
}

let editingShortcutId = null

function openShortcutModal (shortcutId = null) {
  editingShortcutId = shortcutId
  const scrim = document.getElementById('shortcutScrim')
  const title = document.getElementById('shortcutModalTitle')
  const nameInput = document.getElementById('scNameInput')
  const urlInput = document.getElementById('scUrlInput')
  const deleteBtn = document.getElementById('scDeleteBtn')
  const errorMsg = document.getElementById('scErrorMsg')

  if (!scrim) return

  if (errorMsg) {
    errorMsg.hidden = true
    errorMsg.style.display = 'none'
    errorMsg.textContent = ''
  }

  if (shortcutId) {
    const sc = shortcutsList.find(s => String(s.id) === String(shortcutId))
    if (title) title.textContent = 'Edit shortcut'
    if (nameInput) nameInput.value = sc ? sc.title : ''
    if (urlInput) urlInput.value = sc ? sc.url : ''
    if (deleteBtn) {
      deleteBtn.hidden = false
      deleteBtn.style.display = 'inline-flex'
    }
  } else {
    if (title) title.textContent = 'Add shortcut'
    if (nameInput) nameInput.value = ''
    if (urlInput) urlInput.value = ''
    if (deleteBtn) {
      deleteBtn.hidden = true
      deleteBtn.style.display = 'none'
    }
  }

  scrim.hidden = false
  scrim.style.display = 'flex'
  setTimeout(() => {
    if (nameInput) {
      nameInput.focus()
      nameInput.select()
    }
  }, 60)
}

function closeShortcutModal () {
  const scrim = document.getElementById('shortcutScrim')
  if (scrim) {
    scrim.hidden = true
    scrim.style.display = 'none'
  }
  editingShortcutId = null
}

function saveShortcutFromModal () {
  const nameInput = document.getElementById('scNameInput')
  const urlInput = document.getElementById('scUrlInput')
  const errorMsg = document.getElementById('scErrorMsg')

  let rawUrl = (urlInput ? urlInput.value : '').trim()
  if (!rawUrl) {
    if (errorMsg) {
      errorMsg.textContent = 'Please enter a valid URL'
      errorMsg.hidden = false
      errorMsg.style.display = 'block'
    }
    if (urlInput) urlInput.focus()
    return
  }

  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl
  }

  let rawName = (nameInput ? nameInput.value : '').trim()
  if (!rawName) {
    const dom = getDomainFromUrl(rawUrl)
    rawName = dom.charAt(0).toUpperCase() + dom.slice(1)
  }

  const isEditing = !!editingShortcutId
  if (editingShortcutId) {
    const idx = shortcutsList.findIndex(s => String(s.id) === String(editingShortcutId))
    if (idx >= 0) {
      shortcutsList[idx].title = rawName
      shortcutsList[idx].url = rawUrl
    }
  } else {
    shortcutsList.push({
      id: 'sc_' + Date.now(),
      title: rawName,
      url: rawUrl
    })
  }

  saveShortcuts()
  renderShortcutsGrid()
  closeShortcutModal()
  toast(isEditing ? 'Shortcut updated' : 'Shortcut added')
}

function deleteCurrentShortcut () {
  if (editingShortcutId) {
    shortcutsList = shortcutsList.filter(s => String(s.id) !== String(editingShortcutId))
    saveShortcuts()
    renderShortcutsGrid()
    closeShortcutModal()
    toast('Shortcut removed')
  }
}

// -------------------------------------------------------------
// Modal & Drawer State
// -------------------------------------------------------------
function setSettingsModal (open) {
  const scrim = document.getElementById('scrim')
  const app = document.getElementById('app')
  if (!scrim) return

  scrim.classList.toggle('open', open)
  scrim.inert = !open
  if (app) app.inert = open

  if (open) {
    webviews.requestPlaceholder('settings')
    const closeBtn = document.getElementById('closeSettings')
    if (closeBtn) closeBtn.focus()
  } else {
    webviews.hidePlaceholder('settings')
    const openBtn = document.getElementById('openSettings')
    if (openBtn) openBtn.focus()
  }
}

function setDownloadsPopover (open) {
  const dlPop = document.getElementById('dlPop')
  const toggleDl = document.getElementById('toggleDl')
  if (!dlPop) return

  dlPop.classList.toggle('open', open)
  dlPop.inert = !open
  if (toggleDl) {
    toggleDl.setAttribute('aria-pressed', open ? 'true' : 'false')
  }

  if (open) {
    webviews.requestPlaceholder('downloads')
  } else {
    webviews.hidePlaceholder('downloads')
  }
}

function setCopilotDrawer (open) {
  const copilot = document.getElementById('copilot')
  const toggleAi = document.getElementById('toggleAi')
  const input = document.getElementById('input')
  if (!copilot) return

  copilot.classList.toggle('closed', !open)
  copilot.inert = !open
  if (toggleAi) {
    toggleAi.setAttribute('aria-pressed', open ? 'true' : 'false')
  }

  webviews.trackAnimation()

  if (open && input) {
    setTimeout(() => input.focus({ preventScroll: true }), 280)
  }
}

// -------------------------------------------------------------
// Settings Management
// -------------------------------------------------------------
function applySettings () {
  const dark = driftSettings.theme === 'dark'

  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.body.classList.toggle('dark-theme', dark)
  document.body.classList.toggle('dark-mode', dark)

  const toggleThemeUse = document.querySelector('#toggleTheme use')
  if (toggleThemeUse) {
    toggleThemeUse.setAttribute('href', dark ? '#i-sun' : '#i-moon')
  }
  const toggleTheme = document.getElementById('toggleTheme')
  if (toggleTheme) {
    toggleTheme.title = dark ? 'Switch to light theme' : 'Switch to dark theme'
  }

  const root = document.documentElement.style
  root.setProperty('--accent', driftSettings.accent)
  root.setProperty('--accent-soft', hexA(driftSettings.accent, dark ? 0.14 : 0.24))
  root.setProperty('--blur', driftSettings.blur + 'px')

  document.body.classList.toggle('calm', driftSettings.calm)

  const readout = document.getElementById('readout')
  if (readout) readout.hidden = !driftSettings.readout

  const modelName = document.getElementById('modelName')
  if (modelName) modelName.textContent = driftSettings.aiModel || driftSettings.model || 'gpt-4o-mini'

  // Update Claude-style home greeting
  updateHomeGreeting()

  // Sync inputs inside settings dialog
  document.querySelectorAll('#scrim [data-set]').forEach(el => {
    const v = driftSettings[el.dataset.set]
    if (el.classList.contains('sw')) {
      el.setAttribute('aria-checked', v ? 'true' : 'false')
    } else if (el.classList.contains('swatch')) {
      el.setAttribute('aria-checked', driftSettings.accent === (el.dataset.color || el.dataset.value) ? 'true' : 'false')
    } else if (v !== undefined) {
      el.value = v
    }
  })

  // Sync active preset pill
  const currentBaseUrl = (driftSettings.aiBaseUrl || '').trim()
  document.querySelectorAll('.preset-pill').forEach(pill => {
    const preset = AI_PRESETS[pill.dataset.preset]
    if (preset && preset.baseUrl === currentBaseUrl) {
      pill.classList.add('active')
    } else {
      pill.classList.remove('active')
    }
  })
}

function changeSetting (key, value) {
  driftSettings[key] = value
  saveDriftSettings()
  applySettings()

  if (key === 'theme') {
    const isDark = value === 'dark'
    settings.set('darkThemeIsActive', isDark)
  }

  if (key === 'engine') {
    settings.set('searchEngine', { name: value })
  }

  if (key === 'userName') {
    updateHomeGreeting()
  }

  if (key === 'aiModel') {
    const modelName = document.getElementById('modelName')
    if (modelName) modelName.textContent = value || 'gpt-4o-mini'
  }

  if (key === 'collapsed') {
    const app = document.getElementById('app')
    if (app) app.classList.toggle('tabs-collapsed', value)
    webviews.trackAnimation()
  }

  if (key === 'context' || key === 'length') {
    renderContext()
  }
}

// -------------------------------------------------------------
// Test Connection Functionality
// -------------------------------------------------------------
async function testAiConnection () {
  const statusEl = document.getElementById('aiTestStatus')
  const testBtn = document.getElementById('btnTestAiConnection')
  if (!statusEl) return

  statusEl.hidden = false
  statusEl.className = 'status-badge testing'
  statusEl.textContent = 'Testing connection...'
  if (testBtn) testBtn.disabled = true

  const baseUrl = (driftSettings.aiBaseUrl || '').trim().replace(/\/+$/, '')
  const apiKey = (driftSettings.aiApiKey || '').trim()
  const model = (driftSettings.aiModel || 'gpt-4o-mini').trim()

  if (!baseUrl) {
    statusEl.className = 'status-badge error'
    statusEl.textContent = 'Missing Base URL'
    if (testBtn) testBtn.disabled = false
    return
  }

  try {
    const headers = {
      'Content-Type': 'application/json'
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)

    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2
      }),
      signal: controller.signal
    })
    clearTimeout(timer)

    if (res.ok) {
      statusEl.className = 'status-badge success'
      statusEl.textContent = 'Connected'
    } else {
      const errText = await res.text().catch(() => '')
      let errorMsg = `HTTP ${res.status}`
      try {
        const parsed = JSON.parse(errText)
        if (parsed.error && parsed.error.message) {
          errorMsg = parsed.error.message.substring(0, 45)
        }
      } catch (e) {}
      statusEl.className = 'status-badge error'
      statusEl.textContent = `Error: ${errorMsg}`
    }
  } catch (err) {
    statusEl.className = 'status-badge error'
    statusEl.textContent = err.name === 'AbortError' ? 'Timed out' : 'Unreachable'
  } finally {
    if (testBtn) testBtn.disabled = false
  }
}

// -------------------------------------------------------------
// Omnibox Mode
// -------------------------------------------------------------
function setOmniboxMode (m) {
  mode = m
  const omni = document.getElementById('omni')
  const omnibox = document.getElementById('omnibox')
  const modeWeb = document.getElementById('modeWeb')
  const modeAi = document.getElementById('modeAi')

  if (omni) omni.dataset.mode = m
  if (modeWeb) modeWeb.setAttribute('aria-pressed', m === 'web' ? 'true' : 'false')
  if (modeAi) modeAi.setAttribute('aria-pressed', m === 'ai' ? 'true' : 'false')

  if (omnibox) {
    if (m === 'web') {
      const curTab = (typeof tabs !== 'undefined' && tabs && tabs.getSelected()) ? tabs.get(tabs.getSelected()) : null
      const curUrl = curTab ? curTab.url : ''
      omnibox.value = (curUrl && curUrl !== 'min://newtab') ? curUrl : ''
      omnibox.placeholder = 'Search or enter address'
    } else {
      omnibox.value = ''
      omnibox.placeholder = 'Ask the AI anything about this tab'
    }
    omnibox.focus()
  }
}

function getHostOf (url) {
  if (!url || url.startsWith('about:') || url.startsWith('min:')) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

const tabChats = new Map()

function getActiveTabChat () {
  if (typeof tabs === 'undefined' || !tabs) return []
  const sel = tabs.getSelected()
  if (!sel) return []
  if (!tabChats.has(sel)) {
    tabChats.set(sel, [])
  }
  return tabChats.get(sel)
}

let lastRenderedTabId = null
let lastRenderedChatLen = -1

function renderFeed (force = false) {
  const feed = document.getElementById('feed')
  if (!feed) return
  if (typeof tabs === 'undefined' || !tabs) {
    feed.innerHTML = '<div class="empty">Ask about this page, or start with a quick action above.</div>'
    return
  }
  const curTabId = tabs.getSelected()
  const chat = getActiveTabChat()

  if (!force && curTabId === lastRenderedTabId && chat.length === lastRenderedChatLen) {
    return
  }
  lastRenderedTabId = curTabId
  lastRenderedChatLen = chat.length

  if (!chat.length) {
    feed.innerHTML = '<div class="empty">Ask about this page, or start with a quick action above.</div>'
  } else {
    feed.innerHTML = chat.map(m => {
      let contentHtml = ''
      if (m.text) {
        contentHtml = parseMarkdown(m.text)
      } else if (m.streaming) {
        contentHtml = '<span class="dots"><i></i><i></i><i></i></span>'
      } else {
        contentHtml = ''
      }

      if (m.showSettingsBtn) {
        contentHtml += `<div class="chat-banner"><button type="button" onclick="window.driftSetSettingsModal(true)">Configure AI Settings</button></div>`
      }

      return `<div class="msg ${m.role}">${contentHtml}</div>`
    }).join('')

    // Wire up Copy code buttons
    feed.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.onclick = () => {
        const code = decodeURIComponent(btn.dataset.code || '')
        navigator.clipboard.writeText(code).then(() => {
          const span = btn.querySelector('span')
          const use = btn.querySelector('use')
          if (span) span.textContent = 'Copied!'
          if (use) use.setAttribute('href', '#i-check')
          setTimeout(() => {
            if (span) span.textContent = 'Copy'
            if (use) use.setAttribute('href', '#i-copy')
          }, 2000)
        })
      }
    })

    // Wire up AI chat links to open in browser tabs
    feed.querySelectorAll('.ai-chat-link').forEach(link => {
      link.onclick = (e) => {
        e.preventDefault()
        const url = link.dataset.url || link.href
        if (url) {
          if (typeof tabs !== 'undefined' && tabs) {
            browserUI.addTab(tabs.add({ url }), { openInBackground: false })
          }
        }
      }
    })
  }
  feed.scrollTop = feed.scrollHeight
}

function renderContext () {
  const ctx = document.getElementById('ctx')
  if (!ctx) return
  if (typeof tabs === 'undefined' || !tabs) {
    ctx.innerHTML = ''
    return
  }
  const sel = tabs.getSelected()
  const curTab = sel ? tabs.get(sel) : null
  if (!curTab) {
    ctx.innerHTML = ''
    return
  }

  const url = curTab.url || ''
  const title = curTab.title || (url ? getHostOf(url) : 'New tab')
  const host = getHostOf(url) || (url ? 'Browser page' : 'Blank start page')

  const hue = [...(host || 'drift')].reduce((a, c) => a + c.charCodeAt(0), 0) * 7 % 360
  const favHtml = `<span class="fav" style="background:hsl(${hue} 60% 70%)">${(host[0] || 'D').toUpperCase()}</span>`

  const pillText = !driftSettings.context ? 'Off' : 'Active context'

  ctx.innerHTML = `${favHtml}<div class="ctx-text"><div class="ctx-title">${title}</div>
    <div class="ctx-sub">${host}</div></div>
    <span class="pill">${pillText}</span>`
}

// -------------------------------------------------------------
// Active Tab Content Extraction
// -------------------------------------------------------------
function getActivePageContent (callback) {
  if (typeof tabs === 'undefined' || !tabs) {
    callback('', '', '')
    return
  }
  const sel = tabs.getSelected()
  if (!sel) {
    callback('', '', '')
    return
  }
  const curTab = tabs.get(sel)
  if (!curTab || !curTab.url || curTab.url === 'min://newtab' || curTab.url.startsWith('about:') || curTab.url.startsWith('min:')) {
    callback(curTab ? curTab.title : '', curTab ? curTab.url : '', '')
    return
  }

  const extractScript = `(() => {
    try {
      const clone = document.body.cloneNode(true);
      const toRemove = ['script', 'style', 'noscript', 'svg', 'iframe', 'canvas', 'nav', 'header', 'footer'];
      toRemove.forEach(s => clone.querySelectorAll(s).forEach(e => e.remove()));
      return (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 10000);
    } catch(e) {
      return '';
    }
  })()`

  webviews.callAsync(sel, 'executeJavaScript', [extractScript], (err, text) => {
    if (err) {
      callback(curTab.title || '', curTab.url || '', '')
    } else {
      callback(curTab.title || '', curTab.url || '', typeof text === 'string' ? text : '')
    }
  })
}

// -------------------------------------------------------------
// OpenAI-Compatible Streaming Assistant
// -------------------------------------------------------------
async function streamAiCompletion (messages, onChunk, onDone, onError) {
  if (activeAiAbortController) {
    activeAiAbortController.abort()
  }
  activeAiAbortController = new AbortController()
  const signal = activeAiAbortController.signal

  const baseUrl = (driftSettings.aiBaseUrl || '').trim().replace(/\/+$/, '')
  const apiKey = (driftSettings.aiApiKey || '').trim()
  const model = (driftSettings.aiModel || 'gpt-4o-mini').trim()

  if (!baseUrl) {
    onError(new Error('AI Base URL is not configured. Please set it in Settings.'))
    return
  }

  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`

  const headers = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true
      }),
      signal
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      let msg = `HTTP ${res.status}`
      try {
        const j = JSON.parse(errText)
        if (j.error?.message) msg = j.error.message
      } catch (e) {}
      throw new Error(msg)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') {
          onDone()
          return
        }
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim()
          try {
            const parsed = JSON.parse(jsonStr)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              onChunk(delta)
            }
          } catch (e) {}
        }
      }
    }
    onDone()
  } catch (err) {
    if (err.name === 'AbortError') return
    onError(err)
  } finally {
    activeAiAbortController = null
  }
}

function askAi (query) {
  setCopilotDrawer(true)

  if (!driftSettings.aiEnabled) {
    const chat = getActiveTabChat()
    chat.push({ role: 'user', text: query })
    chat.push({
      role: 'ai',
      text: '**AI features are currently disabled.**\n\nYou can enable them anytime in Settings (Alt+,) > AI & Models.',
      isBanner: true
    })
    renderFeed(true)
    return
  }

  const baseUrl = (driftSettings.aiBaseUrl || '').trim()
  if (!baseUrl) {
    const chat = getActiveTabChat()
    chat.push({ role: 'user', text: query })
    chat.push({
      role: 'ai',
      text: '**AI is not configured.**\n\nPlease configure your API Base URL and API Key in Settings to start chatting.',
      showSettingsBtn: true
    })
    renderFeed(true)
    return
  }

  getActivePageContent((pageTitle, pageUrl, pageText) => {
    const chat = getActiveTabChat()
    const userMsg = { role: 'user', text: query }
    const aiMsg = { role: 'ai', text: '', streaming: true }
    chat.push(userMsg, aiMsg)
    renderFeed(true)

    const messages = []
    let systemPrompt = 'You are Drift Co-pilot, a fast, sleek, intelligent browser AI assistant. Answer user questions clearly, helpfully, and concisely with clean markdown formatting (including headings, bullet points, and tables where appropriate).'

    if (pageText && driftSettings.context) {
      systemPrompt += `\n\nThe user is currently viewing this web page:
Page Title: "${pageTitle}"
URL: ${pageUrl}
Visible Page Extract:
"""
${pageText}
"""
Use this page context to give precise, helpful, and concise answers when the question relates to the page.`
    }
    messages.push({ role: 'system', content: systemPrompt })

    // Provide conversation history
    const recent = chat.slice(0, -1).filter(m => !m.isBanner && !m.showSettingsBtn).slice(-8)
    for (const m of recent) {
      messages.push({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text
      })
    }

    streamAiCompletion(
      messages,
      chunk => {
        aiMsg.text += chunk
        renderFeed(true)
      },
      () => {
        aiMsg.streaming = false
        renderFeed(true)
      },
      err => {
        aiMsg.streaming = false
        aiMsg.text = aiMsg.text
          ? aiMsg.text + `\n\n*(Error during response: ${err.message})*`
          : `**Error connecting to AI endpoint:**\n${err.message}\n\nPlease verify your API URL, key, and model in Settings.`
        renderFeed(true)
      }
    )
  })
}

function sendCopilotMessage () {
  const input = document.getElementById('input')
  const sendBtn = document.getElementById('send')
  if (!input) return
  const v = input.value.trim()
  if (!v) return
  input.value = ''
  input.style.height = 'auto'
  if (sendBtn) sendBtn.disabled = true
  askAi(v)
}

// -------------------------------------------------------------
// Downloads Manager UI
// -------------------------------------------------------------
function renderDownloads () {
  const toggleDl = document.getElementById('toggleDl')
  const dlPopList = document.getElementById('dlPopList')
  if (!dlPopList) return

  const hasProgress = dlItemsList.some(d => d.status === 'progressing')
  if (toggleDl) {
    toggleDl.dataset.busy = hasProgress ? 'true' : 'false'
  }

  if (!dlItemsList.length) {
    dlPopList.innerHTML = '<div class="dl-empty">No downloads yet.</div>'
    return
  }

  dlPopList.innerHTML = dlItemsList.slice(0, 10).map(d => {
    const ext = (d.name || d.path || '').split('.').pop() || 'file'
    const total = (d.size && d.size.total) || 1
    const received = (d.size && d.size.received) || 0
    const pct = Math.min(100, Math.round((received / total) * 100))
    const isProgress = d.status === 'progressing'

    let meta = ''
    if (isProgress) {
      meta = `${Math.round(received / 1024)} KB of ${Math.round(total / 1024)} KB`
    } else if (d.status === 'completed') {
      meta = 'Completed'
    } else if (d.status === 'interrupted' || d.status === 'failed') {
      meta = 'Failed'
    } else {
      meta = d.status || 'Finished'
    }

    return `<div class="dl-item" data-path="${d.path || ''}">
      <span class="dl-ext">${ext}</span>
      <div class="dl-main">
        <div class="dl-name" title="${d.name}">${d.name}</div>
        <div class="dl-meta">${meta}</div>
        ${isProgress ? `<div class="dl-bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <div class="dl-actions">
        ${isProgress ? `<button class="dl-btn" data-dl-cancel="${d.path}">Cancel</button>` : `<button class="dl-btn" data-dl-open="${d.path}">Open</button><button class="dl-btn" data-dl-folder="${d.path}">Folder</button>`}
      </div>
    </div>`
  }).join('')
}

// -------------------------------------------------------------
// Chrome State Synchronization (Back/Fwd, NTP, Tabs)
// -------------------------------------------------------------
function updateChromeState () {
  if (typeof tabs === 'undefined' || !tabs) {
    return
  }
  const sel = tabs.getSelected()
  const curTab = sel ? tabs.get(sel) : null
  const curUrl = (curTab && curTab.url) || ''

  const backBtn = document.getElementById('back')
  const fwdBtn = document.getElementById('fwd')
  const reloadBtn = document.getElementById('reload')
  const omnibox = document.getElementById('omnibox')
  const ntpContent = document.getElementById('ntp-content')

  if (sel) {
    webviews.callAsync(sel, 'canGoBack', (err, canGoBack) => {
      if (!err && backBtn) {
        // Can go back if webview has history OR if current tab has a URL (can go back to start page)
        const hasUrl = curUrl && curUrl !== 'min://newtab'
        backBtn.disabled = !canGoBack && !hasUrl
      }
    })
    webviews.callAsync(sel, 'canGoForward', (err, canGoForward) => {
      if (!err && fwdBtn) fwdBtn.disabled = !canGoForward
    })
    webviews.callAsync(sel, 'isLoading', (err, isLoading) => {
      if (!err && reloadBtn) {
        reloadBtn.classList.toggle('loading', !!isLoading)
      }
    })
  } else {
    if (backBtn) backBtn.disabled = true
    if (fwdBtn) fwdBtn.disabled = true
    if (reloadBtn) reloadBtn.classList.remove('loading')
  }

  if (omnibox && document.activeElement !== omnibox && mode === 'web') {
    omnibox.value = (curUrl && curUrl !== 'min://newtab') ? curUrl : ''
  }

  // Toggle Start Page / New Tab page in viewport
  if (ntpContent) {
    if (!curUrl || curUrl === 'min://newtab') {
      ntpContent.style.display = 'block'
      updateHomeGreeting()
      renderShortcutsGrid()
    } else {
      ntpContent.style.display = 'none'
    }
  }

  renderContext()
  renderFeed()
}

// -------------------------------------------------------------
// Initialize Drift UI
// -------------------------------------------------------------
function initializeDriftUI () {
  applySettings()

  const app = document.getElementById('app')
  if (app && driftSettings.collapsed) {
    app.classList.add('tabs-collapsed')
  }

  if (driftSettings.openAi) {
    setCopilotDrawer(true)
  }

  // Update Claude-style home greeting & start 60s interval
  updateHomeGreeting()
  setInterval(updateHomeGreeting, 60000)

  // Load and render Chrome-style shortcuts
  loadShortcuts()
  renderShortcutsGrid()

  // Wire Shortcut Modal controls
  const closeShortcutModalBtn = document.getElementById('closeShortcutModal')
  if (closeShortcutModalBtn) {
    closeShortcutModalBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeShortcutModal()
    }
  }

  const scCancelBtn = document.getElementById('scCancelBtn')
  if (scCancelBtn) {
    scCancelBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeShortcutModal()
    }
  }

  const scSaveBtn = document.getElementById('scSaveBtn')
  if (scSaveBtn) {
    scSaveBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      saveShortcutFromModal()
    }
  }

  const scDeleteBtn = document.getElementById('scDeleteBtn')
  if (scDeleteBtn) {
    scDeleteBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      deleteCurrentShortcut()
    }
  }

  const shortcutScrim = document.getElementById('shortcutScrim')
  if (shortcutScrim) {
    shortcutScrim.addEventListener('mousedown', e => {
      if (e.target.id === 'shortcutScrim') {
        closeShortcutModal()
      }
    })
  }

  const scNameInput = document.getElementById('scNameInput')
  const scUrlInput = document.getElementById('scUrlInput')

  ;[scNameInput, scUrlInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveShortcutFromModal()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          closeShortcutModal()
        }
      })
    }
  })

  // Wire Tab Sidebar
  const toggleTabs = document.getElementById('toggleTabs')
  if (toggleTabs) {
    toggleTabs.onclick = () => {
      if (app) {
        app.classList.toggle('tabs-collapsed')
        webviews.trackAnimation()
      }
    }
  }

  const newTabBtn = document.getElementById('newTab')
  if (newTabBtn) {
    newTabBtn.onclick = () => browserUI.addTab()
  }

  const openDownloadsBtn = document.getElementById('openDownloads')
  if (openDownloadsBtn) {
    openDownloadsBtn.onclick = () => setDownloadsPopover(true)
  }

  const openSettingsBtn = document.getElementById('openSettings')
  if (openSettingsBtn) {
    openSettingsBtn.onclick = () => setSettingsModal(true)
  }

  // Wire Navigation Buttons
  const back = document.getElementById('back')
  if (back) {
    back.onclick = () => {
      if (typeof tabs !== 'undefined' && tabs && tabs.getSelected()) {
        const sel = tabs.getSelected()
        const curTab = tabs.get(sel)
        webviews.callAsync(sel, 'canGoBack', (err, canGoBack) => {
          if (!err && canGoBack) {
            webviews.goBackIgnoringRedirects(sel)
          } else if (curTab && curTab.url && curTab.url !== 'min://newtab') {
            // Return to start page
            tabs.update(sel, { url: '', title: 'New Tab' })
            webviews.callAsync(sel, 'loadURL', 'about:blank')
            scheduleUpdateChromeState()
          }
        })
        scheduleUpdateChromeState()
        setTimeout(scheduleUpdateChromeState, 150)
      }
    }
  }

  const fwd = document.getElementById('fwd')
  if (fwd) {
    fwd.onclick = () => {
      if (typeof tabs !== 'undefined' && tabs && tabs.getSelected()) {
        webviews.callAsync(tabs.getSelected(), 'goForward')
        scheduleUpdateChromeState()
        setTimeout(scheduleUpdateChromeState, 150)
      }
    }
  }

  const reload = document.getElementById('reload')
  if (reload) {
    reload.onclick = () => {
      if (typeof tabs !== 'undefined' && tabs && tabs.getSelected()) {
        webviews.callAsync(tabs.getSelected(), 'reload')
        scheduleUpdateChromeState()
        setTimeout(scheduleUpdateChromeState, 150)
      }
    }
  }

  // Wire Omnibox & Mode
  const modeWeb = document.getElementById('modeWeb')
  const modeAi = document.getElementById('modeAi')
  const omnibox = document.getElementById('omnibox')

  if (modeWeb) modeWeb.onclick = () => setOmniboxMode('web')
  if (modeAi) modeAi.onclick = () => setOmniboxMode('ai')

  if (omnibox) {
    omnibox.addEventListener('focus', () => {
      if (mode === 'web') omnibox.select()
    })

    omnibox.addEventListener('input', () => {
      const val = omnibox.value
      const m = val.match(/^(\?|\/ai|@ai)\s/i)
      if (m && mode === 'web') {
        setOmniboxMode('ai')
        omnibox.value = ''
        return
      }
      if (mode === 'web') {
        searchbar.show(omnibox)
        searchbar.showResults(val, {})
      }
    })

    omnibox.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        setOmniboxMode('web')
        searchbar.hide()
        omnibox.blur()
        return
      }
      if (e.key === 'Enter') {
        const v = omnibox.value.trim()
        if (!v) return

        searchbar.hide()
        if (mode === 'ai' || /^(@ai|\?|\/ai)\s+/i.test(v)) {
          const cleanQ = v.replace(/^(@ai|\?|\/ai)\s+/i, '').trim()
          setCopilotDrawer(true)
          if (cleanQ) askAi(cleanQ)
          setOmniboxMode('web')
          omnibox.blur()
        } else {
          searchbar.openURL(v, e)
          omnibox.blur()
        }
      }
    })
  }

  // Wire Toolbar Downloads, Theme, Co-pilot toggles
  const toggleDl = document.getElementById('toggleDl')
  if (toggleDl) {
    toggleDl.onclick = () => {
      const dlPop = document.getElementById('dlPop')
      const isOpen = dlPop && dlPop.classList.contains('open')
      setDownloadsPopover(!isOpen)
    }
  }

  const toggleTheme = document.getElementById('toggleTheme')
  if (toggleTheme) {
    toggleTheme.onclick = () => {
      const isDark = document.documentElement.dataset.theme === 'dark'
      changeSetting('theme', isDark ? 'light' : 'dark')
    }
  }

  const toggleAi = document.getElementById('toggleAi')
  if (toggleAi) {
    toggleAi.onclick = () => {
      const copilot = document.getElementById('copilot')
      const isOpen = copilot && !copilot.classList.contains('closed')
      setCopilotDrawer(!isOpen)
    }
  }

  // Wire Co-pilot Drawer controls
  const closeAi = document.getElementById('closeAi')
  if (closeAi) {
    closeAi.onclick = () => setCopilotDrawer(false)
  }

  const clearChat = document.getElementById('clearChat')
  if (clearChat) {
    clearChat.onclick = () => {
      const chat = getActiveTabChat()
      chat.length = 0
      renderFeed(true)
    }
  }

  const composerInput = document.getElementById('input')
  const sendBtn = document.getElementById('send')

  if (composerInput) {
    composerInput.addEventListener('input', () => {
      composerInput.style.height = 'auto'
      composerInput.style.height = Math.min(composerInput.scrollHeight, 110) + 'px'
      if (sendBtn) {
        sendBtn.disabled = !composerInput.value.trim()
      }
    })

    composerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendCopilotMessage()
      }
    })
  }

  if (sendBtn) {
    sendBtn.onclick = sendCopilotMessage
  }

  // Co-pilot action chips
  document.querySelectorAll('.chip[data-q]').forEach(chip => {
    chip.onclick = () => {
      setCopilotDrawer(true)
      askAi(chip.dataset.q)
    }
  })

  // Start Page search & action buttons
  const startSearch = document.getElementById('startSearch')
  if (startSearch) {
    startSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = startSearch.value.trim()
        if (v) {
          searchbar.openURL(v, e)
        }
      }
    })
  }

  const ntpContent = document.getElementById('ntp-content')
  if (ntpContent) {
    ntpContent.addEventListener('click', e => {
      const actBtn = e.target.closest('[data-act]')
      if (actBtn && startSearch) {
        const v = startSearch.value.trim()
        if (actBtn.dataset.act === 'ask') {
          setCopilotDrawer(true)
          if (v) {
            askAi(v)
            startSearch.value = ''
          }
        } else {
          if (!v) {
            startSearch.focus()
            return
          }
          searchbar.openURL(v)
        }
      }
    })
  }

  // Downloads popover events
  const dlPop = document.getElementById('dlPop')
  if (dlPop) {
    dlPop.addEventListener('click', e => {
      const openBtn = e.target.closest('[data-dl-open]')
      if (openBtn) {
        electron.shell.openPath(openBtn.dataset.dlOpen)
        return
      }
      const folderBtn = e.target.closest('[data-dl-folder]')
      if (folderBtn) {
        electron.shell.showItemInFolder(folderBtn.dataset.dlFolder)
        return
      }
      const cancelBtn = e.target.closest('[data-dl-cancel]')
      if (cancelBtn) {
        ipc.send('cancelDownload', cancelBtn.dataset.dlCancel)
        return
      }
      const clearBtn = e.target.closest('[data-dl-clear]')
      if (clearBtn) {
        dlItemsList = dlItemsList.filter(x => x.status === 'progressing')
        renderDownloads()
        return
      }
      const allBtn = e.target.closest('[data-dl-all]')
      if (allBtn) {
        setDownloadsPopover(false)
        if (typeof tabs !== 'undefined' && tabs) {
          browserUI.addTab(tabs.add({ url: 'about:downloads' }))
        } else {
          browserUI.addTab()
        }
      }
    })
  }

  document.addEventListener('mousedown', e => {
    if (dlPop && dlPop.classList.contains('open')) {
      if (!e.target.closest('#dlPop, #toggleDl')) {
        setDownloadsPopover(false)
      }
    }
  })

  // Settings Dialog events
  const closeSettings = document.getElementById('closeSettings')
  if (closeSettings) {
    closeSettings.onclick = () => setSettingsModal(false)
  }

  const scrim = document.getElementById('scrim')
  if (scrim) {
    scrim.addEventListener('mousedown', e => {
      if (e.target.id === 'scrim') setSettingsModal(false)
    })
  }

  const stNav = document.getElementById('stNav')
  if (stNav) {
    stNav.addEventListener('click', e => {
      const btn = e.target.closest('[data-pane]')
      if (!btn) return
      stNav.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b === btn ? 'true' : 'false'))
      document.querySelectorAll('.pane').forEach(p => {
        p.hidden = p.dataset.pane !== btn.dataset.pane
      })
    })
  }

  const stBody = document.querySelector('.st-body')
  if (stBody) {
    stBody.addEventListener('click', e => {
      const el = e.target.closest('[data-set]')
      if (!el) return
      if (el.classList.contains('sw')) {
        changeSetting(el.dataset.set, !driftSettings[el.dataset.set])
      }
      if (el.classList.contains('swatch')) {
        changeSetting('accent', el.dataset.color || el.dataset.value)
      }
    })

    stBody.addEventListener('change', e => {
      const el = e.target.closest('[data-set]')
      if (!el) return
      if (el.tagName === 'SELECT' || el.type === 'range') {
        const v = el.type === 'range' ? parseInt(el.value, 10) : el.value
        changeSetting(el.dataset.set, v)
      }
    })

    stBody.addEventListener('input', e => {
      const el = e.target.closest('[data-set]')
      if (!el) return
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password')) {
        changeSetting(el.dataset.set, el.value)
      }
    })
  }

  // Preset pills
  document.querySelectorAll('.preset-pill').forEach(pill => {
    pill.onclick = () => {
      const preset = AI_PRESETS[pill.dataset.preset]
      if (preset) {
        changeSetting('aiBaseUrl', preset.baseUrl)
        changeSetting('aiModel', preset.model)
        const urlInput = document.getElementById('aiBaseUrlInput')
        const modelInput = document.getElementById('aiModelInput')
        if (urlInput) urlInput.value = preset.baseUrl
        if (modelInput) modelInput.value = preset.model
        document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'))
        pill.classList.add('active')
      }
    }
  })

  // Show/Hide API Key password toggle
  const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility')
  const apiKeyInput = document.getElementById('aiApiKeyInput')
  if (toggleApiKeyVisibility && apiKeyInput) {
    toggleApiKeyVisibility.onclick = () => {
      const isPass = apiKeyInput.type === 'password'
      apiKeyInput.type = isPass ? 'text' : 'password'
      const eyeUse = toggleApiKeyVisibility.querySelector('use')
      if (eyeUse) {
        eyeUse.setAttribute('href', isPass ? '#i-eye-off' : '#i-eye')
      }
    }
  }

  // Test Connection button
  const testConnBtn = document.getElementById('btnTestAiConnection')
  if (testConnBtn) {
    testConnBtn.onclick = testAiConnection
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        if (app) {
          app.classList.toggle('tabs-collapsed')
          webviews.trackAnimation()
        }
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        const copilot = document.getElementById('copilot')
        const isOpen = copilot && !copilot.classList.contains('closed')
        setCopilotDrawer(!isOpen)
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        const dlPop = document.getElementById('dlPop')
        const isOpen = dlPop && dlPop.classList.contains('open')
        setDownloadsPopover(!isOpen)
      }
      if (e.key === ',' || e.key === '<') {
        e.preventDefault()
        const scrim = document.getElementById('scrim')
        const isOpen = scrim && scrim.classList.contains('open')
        setSettingsModal(!isOpen)
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        if (omnibox) {
          omnibox.focus()
          omnibox.select()
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        try {
          const musicPlayer = require('musicPlayer.js')
          musicPlayer.toggle()
        } catch (err) {
          console.warn('Could not toggle music player:', err)
        }
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        browserUI.addTab()
      }
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        if (typeof tabs !== 'undefined' && tabs && tabs.getSelected()) {
          browserUI.closeTab(tabs.getSelected())
        }
      }
    }
  })

  // Listen to Download IPC Events
  ipc.on('download-info', (e, info) => {
    if (!info || !info.path) return

    const existingIdx = dlItemsList.findIndex(d => d.path === info.path)
    if (existingIdx >= 0) {
      Object.assign(dlItemsList[existingIdx], info)
    } else {
      dlItemsList.unshift(info)
      if (driftSettings.dlPopup) {
        setDownloadsPopover(true)
      } else {
        toast(`Downloading ${info.name || 'file'}`)
      }
    }

    if (info.status === 'completed') {
      toast(`${info.name || 'File'} downloaded`)
    }

    renderDownloads()
  })

  // Hook into Min Tab / Navigation Events with RAF debouncing for fast response
  let updateChromeScheduled = false
  function scheduleUpdateChromeState () {
    if (updateChromeScheduled) return
    updateChromeScheduled = true
    requestAnimationFrame(() => {
      updateChromeScheduled = false
      updateChromeState()
    })
  }

  tasks.on('task-selected', scheduleUpdateChromeState)
  tasks.on('tab-selected', scheduleUpdateChromeState)
  tasks.on('tab-updated', scheduleUpdateChromeState)
  webviews.bindEvent('did-start-navigation', scheduleUpdateChromeState)
  webviews.bindEvent('did-navigate', scheduleUpdateChromeState)
  webviews.bindEvent('did-navigate-in-page', scheduleUpdateChromeState)
  webviews.bindEvent('did-start-loading', scheduleUpdateChromeState)
  webviews.bindEvent('did-stop-loading', scheduleUpdateChromeState)
  webviews.bindEvent('did-finish-load', scheduleUpdateChromeState)
  webviews.bindEvent('page-title-updated', scheduleUpdateChromeState)
  webviews.bindEvent('page-favicon-updated', scheduleUpdateChromeState)

  renderDownloads()
  updateChromeState()
}

// Global hooks
window.driftSetSettingsModal = setSettingsModal
window.renderShortcutsGrid = renderShortcutsGrid
window.driftRenderFeed = renderFeed
window.getActiveTabChat = getActiveTabChat
window.driftShortcuts = {
  getList: () => shortcutsList,
  add: (title, url) => {
    shortcutsList.push({ id: 'sc_' + Date.now(), title, url })
    saveShortcuts()
    renderShortcutsGrid()
  },
  remove: (id) => {
    shortcutsList = shortcutsList.filter(s => s.id !== id)
    saveShortcuts()
    renderShortcutsGrid()
  },
  render: renderShortcutsGrid
}

module.exports = {
  initialize: initializeDriftUI,
  setSettingsModal,
  setDownloadsPopover,
  setCopilotDrawer,
  toast,
  askAi,
  openShortcutModal,
  closeShortcutModal,
  saveShortcutFromModal
}
