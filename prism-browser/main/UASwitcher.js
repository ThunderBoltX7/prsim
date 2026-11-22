/* Consolidate User Agent and Client Hints handling to behave like standard Chrome
   and Firefox for Google Accounts to ensure high compatibility and pass bot/login checks. */

let hasCustomUserAgent = false
let customUASetting = settings.get('customUserAgent')
if (customUASetting) {
  hasCustomUserAgent = true
}

const chromeVersion = process.versions.chrome || '130.0.0.0'
const chromeMajorVersion = chromeVersion.split('.')[0]

function getPlatformString () {
  if (process.platform === 'win32') {
    return 'Windows NT 10.0; Win64; x64'
  } else if (process.platform === 'darwin') {
    return 'Macintosh; Intel Mac OS X 10_15_7'
  } else {
    return 'X11; Linux x86_64'
  }
}

function getPlatformClientHint () {
  if (process.platform === 'win32') {
    return '"Windows"'
  } else if (process.platform === 'darwin') {
    return '"macOS"'
  } else {
    return '"Linux"'
  }
}

function getStandardChromeUA () {
  if (hasCustomUserAgent && customUASetting) {
    return customUASetting
  }
  return `Mozilla/5.0 (${getPlatformString()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
}

function getFirefoxUA () {
  const rootUAs = {
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:FXVERSION.0) Gecko/20100101 Firefox/FXVERSION.0',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:FXVERSION.0) Gecko/20100101 Firefox/FXVERSION.0',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:FXVERSION.0) Gecko/20100101 Firefox/FXVERSION.0'
  }

  let rootUA
  if (process.platform === 'win32') {
    rootUA = rootUAs.windows
  } else if (process.platform === 'darwin') {
    rootUA = rootUAs.mac
  } else {
    rootUA = rootUAs.linux
  }

  // Ensure modern Firefox version (140+)
  const calculatedFx = 140 + Math.max(0, Math.floor((Date.now() - 1735689600000) / (4.1 * 7 * 24 * 60 * 60 * 1000)))
  return rootUA.replace(/FXVERSION/g, calculatedFx)
}

const standardChromeUA = getStandardChromeUA()
app.userAgentFallback = standardChromeUA

function applySessionUserAgent (ses) {
  if (!ses) return
  try {
    ses.setUserAgent(standardChromeUA)
  } catch (e) {
    console.warn('Could not set user agent on session', e)
  }

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders || {}
    let isGoogleAuth = false

    try {
      const urlObj = new URL(details.url)
      if (urlObj.hostname === 'accounts.google.com') {
        isGoogleAuth = true
      }
    } catch (e) {
      if (details.url && details.url.includes('accounts.google.com')) {
        isGoogleAuth = true
      }
    }

    if (isGoogleAuth && !hasCustomUserAgent) {
      headers['User-Agent'] = getFirefoxUA()
      // Remove all sec-ch-ua headers for Firefox
      Object.keys(headers).forEach(header => {
        if (header.toLowerCase().startsWith('sec-ch-ua')) {
          delete headers[header]
        }
      })
    } else {
      headers['User-Agent'] = standardChromeUA
      headers['sec-ch-ua'] = `"Chromium";v="${chromeMajorVersion}", "Google Chrome";v="${chromeMajorVersion}", "Not.A/Brand";v="99"`
      headers['sec-ch-ua-mobile'] = '?0'
      headers['sec-ch-ua-platform'] = getPlatformClientHint()
    }

    callback({ cancel: false, requestHeaders: headers })
  })
}

app.once('ready', function () {
  applySessionUserAgent(session.defaultSession)
  try {
    const webcontentSession = session.fromPartition('persist:webcontent')
    applySessionUserAgent(webcontentSession)
  } catch (e) {
    console.warn('Could not initialize persist:webcontent session UA', e)
  }
})

app.on('session-created', applySessionUserAgent)
