/* Spoof Chrome environment in main world to pass anti-bot / Cloudflare / Google / OAuth checks */
(function () {
  try {
    const isAccountsGoogle = window.location.hostname === 'accounts.google.com'
    if (isAccountsGoogle) {
      // accounts.google.com uses the Firefox UA, so skip Chrome-specific spoofing
      return
    }

    const chromeVersion = process.versions.chrome || '130.0.0.0'
    const chromeMajorVersion = chromeVersion.split('.')[0]
    const platform = process.platform === 'win32' ? 'Windows' : (process.platform === 'darwin' ? 'macOS' : 'Linux')

    const spoofScript = `
      (function() {
        // 1. Spoof navigator.webdriver
        try {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
            configurable: true
          });
        } catch (e) {}

        // 2. Spoof window.chrome
        try {
          if (!window.chrome) {
            window.chrome = {};
          }
          if (!window.chrome.runtime) {
            window.chrome.runtime = {
              connect: function() {
                return {
                  onMessage: { addListener: function() {}, removeListener: function() {} },
                  postMessage: function() {},
                  disconnect: function() {}
                };
              },
              sendMessage: function() {},
              onMessage: { addListener: function() {}, removeListener: function() {} },
              id: undefined
            };
          }
          if (!window.chrome.loadTimes) {
            window.chrome.loadTimes = function() {
              return {
                requestTime: performance.now() / 1000,
                startLoadTime: performance.now() / 1000,
                commitLoadTime: performance.now() / 1000,
                finishDocumentLoadTime: performance.now() / 1000,
                finishLoadTime: performance.now() / 1000,
                firstPaintTime: performance.now() / 1000,
                firstPaintAfterLoadTime: 0,
                navigationType: 'Other',
                wasFetchedViaSpdy: true,
                wasNpnNegotiated: true,
                npnNegotiatedProtocol: 'h2',
                wasAlternateProtocolAvailable: false,
                connectionInfo: 'h2'
              };
            };
          }
          if (!window.chrome.csi) {
            window.chrome.csi = function() {
              return {
                startE: Date.now(),
                onloadT: Date.now(),
                pageT: performance.now(),
                tran: 15
              };
            };
          }
          if (!window.chrome.app) {
            window.chrome.app = {
              isInstalled: false,
              InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
              RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
            };
          }
        } catch (e) {}

        // 3. Spoof navigator.userAgentData
        try {
          const brandsList = [
            { brand: 'Chromium', version: '${chromeMajorVersion}' },
            { brand: 'Google Chrome', version: '${chromeMajorVersion}' },
            { brand: 'Not.A/Brand', version: '99' }
          ];

          const userAgentDataObj = {
            brands: brandsList,
            mobile: false,
            platform: '${platform}',
            getHighEntropyValues: function(hints) {
              return Promise.resolve({
                brands: brandsList,
                mobile: false,
                platform: '${platform}',
                platformVersion: '15.0.0',
                architecture: 'x86',
                bitness: '64',
                model: '',
                uaFullVersion: '${chromeVersion}',
                fullVersionList: brandsList
              });
            },
            toJSON: function() {
              return {
                brands: brandsList,
                mobile: false,
                platform: '${platform}'
              };
            }
          };

          Object.defineProperty(navigator, 'userAgentData', {
            get: () => userAgentDataObj,
            configurable: true
          });
        } catch (e) {}

        // 4. Ensure plugins and languages look authentic
        try {
          if (!navigator.plugins || navigator.plugins.length === 0) {
            // Emulate standard Chrome PDF Viewer plugins
            const makePlugin = function(name, filename, description) {
              const p = Object.create(Plugin.prototype);
              return p;
            };
            // Chrome normally provides PDF Viewer plugins
          }
        } catch (e) {}
      })();
    `

    electron.webFrame.executeJavaScriptInIsolatedWorld ?
      electron.webFrame.executeJavaScript(spoofScript) :
      electron.webFrame.executeJavaScript(spoofScript)
  } catch (err) {
    console.warn('Failed to inject chrome fingerprint spoof', err)
  }
})()
