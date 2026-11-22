function isNightTime () {
  var hours = new Date().getHours()
  return (hours > 21 || hours < 6)
}

var themeInterval = null

function themeSettingsChanged (value) {
  /*
        value is the value of the darkMode pref
        0 - automatic dark mode
        -1: never
        0: at night
        1: always
        2: follow system (default)
        true / false: legacy pref values, translate to always/system
        */
  clearInterval(themeInterval)

  // 1 or true: dark mode is always enabled
  if (value === 1 || value === true) {
    nativeTheme.themeSource = 'dark'
    return
  }

  // 2: follow system, undefined or false: default to light
  if (value === 2) {
    nativeTheme.themeSource = 'system'
  } else if (value === undefined || value === -1 || value === false) {
    nativeTheme.themeSource = 'light'
  } else if (value === 0) {
    // 0: automatic dark mode at night
    if (isNightTime()) {
      nativeTheme.themeSource = 'dark'
    } else {
      nativeTheme.themeSource = 'light'
    }

    themeInterval = setInterval(function () {
      if (isNightTime()) {
        nativeTheme.themeSource = 'dark'
      } else {
        nativeTheme.themeSource = 'light'
      }
    }, 10000)
  } else if (value === -1) {
    // -1: never enable
    nativeTheme.themeSource = 'light'
  }
}

app.on('ready', function () {
  settings.listen('darkMode', themeSettingsChanged)

  if (settings.get('darkMode') === undefined) {
    settings.set('darkMode', -1)
    nativeTheme.themeSource = 'light'
    settings.set('darkThemeIsActive', false)
  } else if (settings.get('darkThemeIsActive') !== nativeTheme.shouldUseDarkColors) {
    settings.set('darkThemeIsActive', nativeTheme.shouldUseDarkColors)
  }

  nativeTheme.on('updated', function () {
    if (settings.get('darkMode') === 1 || settings.get('darkMode') === true) {
      settings.set('darkThemeIsActive', true)
    } else if (settings.get('darkMode') === 2) {
      settings.set('darkThemeIsActive', nativeTheme.shouldUseDarkColors)
    } else {
      settings.set('darkThemeIsActive', false)
    }
  })
})
