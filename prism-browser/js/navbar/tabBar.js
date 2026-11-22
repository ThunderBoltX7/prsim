const EventEmitter = require('events')

const webviews = require('webviews.js')
const focusMode = require('focusMode.js')
const readerView = require('readerView.js')
const tabAudio = require('tabAudio.js')
const dragula = require('dragula')
const settings = require('util/settings/settings.js')
const urlParser = require('util/urlParser.js')

const tabEditor = require('navbar/tabEditor.js')
const progressBar = require('navbar/progressBar.js')
const permissionRequests = require('navbar/permissionRequests.js')

var lastTabDeletion = 0 // TODO get rid of this

function getFaviconHTML (tabData) {
  if (tabData && tabData.loading) {
    return '<span class="spin"></span>'
  }
  const url = (tabData && tabData.url) || ''
  if (url === 'about:downloads' || url.startsWith('min://downloads')) {
    return '<span class="fav" style="background:var(--fill-3);color:var(--text)"><svg class="i"><use href="#i-download"/></svg></span>'
  }
  if (tabData && tabData.favicon && tabData.favicon.url) {
    return `<span class="fav" style="background:transparent;"><img src="${tabData.favicon.url}" class="fav-img" alt="" onerror="this.style.display='none';"></span>`
  }
  let host = ''
  try {
    if (url && !url.startsWith('about:') && !url.startsWith('min:')) {
      host = new URL(url).hostname.replace('www.', '')
    }
  } catch (e) {}
  if (!host) {
    return '<span class="fav" style="background:var(--fill-3);color:var(--text)"><svg class="i"><use href="#i-sparkle"/></svg></span>'
  }
  const hue = [...host].reduce((a, c) => a + c.charCodeAt(0), 0) * 7 % 360
  return `<span class="fav" style="background:hsl(${hue} 60% 70%)">${host[0].toUpperCase()}</span>`
}

const tabBar = {
  navBar: document.getElementById('navbar'),
  container: document.getElementById('tabs'),
  containerInner: document.getElementById('tabs-inner'),
  tabElementMap: {}, // tabId: tab element
  events: new EventEmitter(),
  dragulaInstance: null,
  getTab: function (tabId) {
    return tabBar.tabElementMap[tabId]
  },
  getTabInput: function (tabId) {
    return tabBar.getTab(tabId)?.querySelector('.tab-input')
  },
  setActiveTab: function (tabId) {
    var activeTab = document.querySelector('.tab-item.active, .tab.active')

    if (activeTab) {
      activeTab.classList.remove('active')
      activeTab.removeAttribute('aria-selected')
    }

    var el = tabBar.getTab(tabId)
    if (el) {
      el.classList.add('active')
      el.setAttribute('aria-selected', 'true')

      requestAnimationFrame(function () {
        el.scrollIntoView({ block: 'nearest' })
      })
    }
  },
  createTab: function (data) {
    var tabEl = document.createElement('div')
    tabEl.className = 'tab tab-item'
    tabEl.setAttribute('data-tab', data.id)
    tabEl.setAttribute('role', 'tab')
    tabEl.tabIndex = 0

    const favContainer = document.createElement('span')
    favContainer.className = 'tab-fav-container'
    favContainer.innerHTML = getFaviconHTML(data)
    tabEl.appendChild(favContainer)

    var title = document.createElement('span')
    title.className = 'tab-title title'
    tabEl.appendChild(title)

    var urlElement = document.createElement('span')
    urlElement.className = 'url-element'
    urlElement.style.display = 'none'
    tabEl.appendChild(urlElement)

    var closeTabButton = document.createElement('button')
    closeTabButton.className = 'tab-x tab-close-button'
    closeTabButton.setAttribute('aria-label', 'Close tab')
    closeTabButton.innerHTML = '<svg class="i"><use href="#i-x"/></svg>'

    closeTabButton.addEventListener('click', function (e) {
      tabBar.events.emit('tab-closed', data.id)
      e.stopPropagation()
    })

    tabEl.appendChild(closeTabButton)

    // click to switch to tab
    tabEl.addEventListener('click', function (e) {
      if (tabs.getSelected() !== data.id) {
        tabBar.events.emit('tab-selected', data.id)
      } else {
        const omnibox = document.getElementById('omnibox')
        if (omnibox) {
          omnibox.focus()
          omnibox.select()
        }
      }
    })

    tabEl.addEventListener('auxclick', function (e) {
      if (e.which === 2) {
        tabBar.events.emit('tab-closed', data.id)
      }
    })

    tabBar.updateTab(data.id, tabEl)

    return tabEl
  },
  updateTab: function (tabId, tabEl = tabBar.getTab(tabId)) {
    if (!tabEl) return
    var tabData = tabs.get(tabId)
    if (!tabData) return

    var tabTitle
    const isNewTab = tabData.url === '' || tabData.url === urlParser.parse('min://newtab')
    if (isNewTab) {
      tabTitle = 'New tab'
    } else if (tabData.title) {
      tabTitle = tabData.title
    } else if (tabData.loaded) {
      tabTitle = tabData.url
    }

    tabTitle = (tabTitle || 'New tab').substring(0, 500)

    var titleEl = tabEl.querySelector('.title')
    if (titleEl) {
      titleEl.textContent = tabTitle
    }
    tabEl.title = tabTitle

    const favContainer = tabEl.querySelector('.tab-fav-container')
    if (favContainer) {
      favContainer.innerHTML = getFaviconHTML(tabData)
    }

    if (tabs.getSelected() === tabId) {
      tabEl.classList.add('active')
      tabEl.setAttribute('aria-selected', 'true')
    } else {
      tabEl.classList.remove('active')
      tabEl.removeAttribute('aria-selected')
    }
  },
  updateAll: function () {
    empty(tabBar.containerInner)
    tabBar.tabElementMap = {}

    tabs.get().forEach(function (tab) {
      var el = tabBar.createTab(tab)
      tabBar.containerInner.appendChild(el)
      tabBar.tabElementMap[tab.id] = el
    })

    if (tabs.getSelected()) {
      tabBar.setActiveTab(tabs.getSelected())
    }
    tabBar.handleSizeChange()
  },
  addTab: function (tabId) {
    var tab = tabs.get(tabId)
    var index = tabs.getIndex(tabId)

    var tabEl = tabBar.createTab(tab)
    tabBar.containerInner.insertBefore(tabEl, tabBar.containerInner.childNodes[index])
    tabBar.tabElementMap[tabId] = tabEl
    tabBar.handleSizeChange()
  },
  removeTab: function (tabId) {
    var tabEl = tabBar.getTab(tabId)
    if (tabEl) {
      // The tab does not have a corresponding .tab-item element.
      // This happens when destroying tabs from other task where this .tab-item is not present
      tabBar.containerInner.removeChild(tabEl)
      delete tabBar.tabElementMap[tabId]
      tabBar.handleSizeChange()
    }
  },
  handleDividerPreference: function (dividerPreference) {
    if (dividerPreference === true) {
      tabBar.navBar.classList.add('show-dividers')
    } else {
      tabBar.navBar.classList.remove('show-dividers')
    }
  },
  initializeTabDragging: function () {
    const tabsInner = document.getElementById('tabs-inner')
    if (tabsInner) {
      tabBar.dragulaInstance = dragula([tabsInner], {
        direction: 'vertical'
      })

      tabBar.dragulaInstance.on('drop', function (el, target, source, sibling) {
        var tabId = el.getAttribute('data-tab')
        if (sibling) {
          var adjacentTabId = sibling.getAttribute('data-tab')
        }

        var oldTab = tabs.splice(tabs.getIndex(tabId), 1)[0]

        var newIdx
        if (adjacentTabId) {
          newIdx = tabs.getIndex(adjacentTabId)
        } else {
          // tab was inserted at end
          newIdx = tabs.count()
        }

        tabs.splice(newIdx, 0, oldTab)
      })
    }
  },
  handleSizeChange: function () {
  }
}

window.addEventListener('resize', tabBar.handleSizeChange)

settings.listen('showDividerBetweenTabs', function (dividerPreference) {
  tabBar.handleDividerPreference(dividerPreference)
})

/* tab loading and progress bar status */
webviews.bindEvent('did-start-loading', function (tabId) {
  const bar = document.getElementById('bar')
  if (bar && tabId === tabs.getSelected()) {
    bar.classList.remove('run')
    void bar.offsetWidth
    bar.classList.add('run')
  }
  tabs.update(tabId, { loaded: false, loading: true })
  tabBar.updateTab(tabId)
})

webviews.bindEvent('did-stop-loading', function (tabId) {
  tabs.update(tabId, { loaded: true, loading: false })
  tabBar.updateTab(tabId)
})

webviews.bindEvent('page-favicon-updated', function (tabId) {
  tabBar.updateTab(tabId)
})

tasks.on('tab-updated', function (id, key) {
  var updateKeys = ['title', 'secure', 'url', 'muted', 'hasAudio', 'favicon']
  if (updateKeys.includes(key)) {
    tabBar.updateTab(id)
  }
})

permissionRequests.onChange(function (tabId) {
  if (tabs.get(tabId)) {
    tabBar.updateTab(tabId)
  }
})

tabBar.initializeTabDragging()

tabBar.container.addEventListener('dragover', e => e.preventDefault())

tabBar.container.addEventListener('drop', e => {
  e.preventDefault()
  var data = e.dataTransfer
  var path = data.files[0] ? 'file://' + electron.webUtils.getPathForFile(data.files[0]) : data.getData('text')
  if (!path) {
    return
  }
  if (tabEditor.isShown || tabs.isEmpty()) {
    webviews.update(tabs.getSelected(), path)
    tabEditor.hide()
  } else {
    require('browserUI.js').addTab(tabs.add({
      url: path,
      private: tabs.get(tabs.getSelected()).private
    }), { enterEditMode: false, openInBackground: !settings.get('openTabsInForeground') })
  }
})

module.exports = tabBar
