var regedit = require('regedit')

var installPath = process.execPath

var keysToCreate = [
  'HKCU\\Software\\Classes\\Prism',
  'HKCU\\Software\\Classes\\Prism\\Application',
  'HKCU\\Software\\Classes\\Prism\\DefaulIcon',
  'HKCU\\Software\\Classes\\Prism\\shell\\open\\command',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\Capabilities\\FileAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\Capabilities\\StartMenu',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\Capabilities\\URLAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\DefaultIcon',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\InstallInfo',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\shell\\open\\command'
]

var registryConfig = {
  'HKCU\\Software\\RegisteredApplications': {
    Prism: {
      value: 'Software\\Clients\\StartMenuInternet\\Prism\\Capabilities',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Prism': {
    default: {
      value: 'Prism Browser Document',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\Prism\\Application': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    },
    ApplicationName: {
      value: 'Prism',
      type: 'REG_SZ'
    },
    AppUserModelId: {
      value: 'Prism',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Prism\\DefaulIcon': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Prism\\shell\\open\\command': {
    default: {
      value: '"' + installPath + '" "%1"',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\.htm\\OpenWithProgIds': {
    Prism: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\.html\\OpenWithProgIds': {
    Prism: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\Capabilities\\FileAssociations': {
    '.htm': {
      value: 'Prism',
      type: 'REG_SZ'
    },
    '.html': {
      value: 'Prism',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\Capabilities\\StartMenu': {
    StartMenuInternet: {
      value: 'Prism',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\Capabilities\\URLAssociations': {
    http: {
      value: 'Prism',
      type: 'REG_SZ'
    },
    https: {
      value: 'Prism',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\DefaultIcon': {
    default: {
      value: installPath + ',0',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Prism\\InstallInfo': {
    IconsVisible: {
      value: 1,
      type: 'REG_DWORD'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Min\\shell\\open\\command': {
    default: {
      value: installPath,
      type: 'REG_DEFAULT'
    }
  }
}

var registryInstaller = {
  install: function () {
    return new Promise(function (resolve, reject) {
      regedit.createKey(keysToCreate, function (err) {
        regedit.putValue(registryConfig, function (err) {
          if (err) {
            reject()
          } else {
            resolve()
          }
        })
      })
    })
  },
  uninstall: function () {
    return new Promise(function (resolve, reject) {
      regedit.deleteKey(keysToCreate, function (err) {
        if (err) {
          reject()
        } else {
          resolve()
        }
      })
    })
  }
}
