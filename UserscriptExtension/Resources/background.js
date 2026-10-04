/**
 * Userscript Safari Web Extension Background Service Worker 2.0
 * Includes: Temporary Script Control (Phase 4), Domain Management (Phase 3), Emergency Disable (Phase 50), Website Script Panel IPC
 */

var cachedScripts = [];
var cachedDomainRules = [];
var cachedAppConfig = { emergencyDisableAll: false, performanceMode: 'Balanced' };
var temporaryOverrides = Object.create(null); // scriptId -> boolean
var overrideExpirations = Object.create(null); // scriptId -> timestamp

function sendNative(action, payload) {
  return new Promise(function(resolve, reject) {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendNativeMessage) {
      var msg = Object.assign({ action: action }, payload || {});
      browser.runtime.sendNativeMessage("application.id", msg, function(response) {
        var err = browser.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve(response);
        }
      });
    } else {
      resolve({ status: 'ok', scripts: cachedScripts, domainRules: cachedDomainRules, appConfig: cachedAppConfig });
    }
  });
}

function syncAll() {
  return sendNative('getScripts')
    .then(function(res) {
      if (res && res.scripts) {
        cachedScripts = res.scripts;
      }
      if (res && res.domainRules) {
        cachedDomainRules = res.domainRules;
      }
      if (res && res.appConfig) {
        cachedAppConfig = res.appConfig;
      }
      return { scripts: cachedScripts, domainRules: cachedDomainRules, appConfig: cachedAppConfig };
    })
    .catch(function() {
      return { scripts: cachedScripts, domainRules: cachedDomainRules, appConfig: cachedAppConfig };
    });
}

// Initial Sync
syncAll();

// Prune expired temporary overrides periodically
function pruneExpiredOverrides() {
  var now = Date.now();
  for (var key in overrideExpirations) {
    if (overrideExpirations[key] && overrideExpirations[key] < now) {
      delete temporaryOverrides[key];
      delete overrideExpirations[key];
    }
  }
}
setInterval(pruneExpiredOverrides, 30000);

// Global Message Handler
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (!request || !request.action) return false;

  var action = request.action;
  var requestId = request.requestId;

  function reply(success, payload, error) {
    var responseMsg = {
      type: 'GM_RESPONSE',
      requestId: requestId,
      success: success,
      payload: payload || {},
      error: error || null
    };
    sendResponse(responseMsg);
  }

  // 1. Get Matching Scripts (Taking into account Emergency Disable, Domain Rules & Temp Overrides)
  if (action === 'getMatchingScripts') {
    syncAll().then(function(state) {
      pruneExpiredOverrides();

      // Phase 50: Emergency Disable Check
      if (state.appConfig && state.appConfig.emergencyDisableAll) {
        if (sender && sender.tab && sender.tab.id && chrome.browserAction && chrome.browserAction.setBadgeText) {
          chrome.browserAction.setBadgeText({ text: 'OFF', tabId: sender.tab.id });
          chrome.browserAction.setBadgeBackgroundColor({ color: '#FF3B30', tabId: sender.tab.id });
        }
        reply(true, { scripts: [], domainRules: [], temporaryOverrides: {}, emergencyDisabled: true });
        return;
      }

      var url = (request.payload && request.payload.url) || request.url;
      var matcher = (typeof window !== 'undefined' && window.__US_Matcher) || 
                    (typeof self !== 'undefined' && self.__US_Matcher) || 
                    (typeof globalThis !== 'undefined' && globalThis.__US_Matcher);
      var matched = [];

      for (var i = 0; i < state.scripts.length; i++) {
        var s = state.scripts[i];
        if (s.enabled !== false) {
          if (!url || !matcher || matcher.test(url, s, state.domainRules, temporaryOverrides)) {
            matched.push(s);
          }
        }
      }

      // Update Tab Badge
      var tabId = (sender && sender.tab && sender.tab.id) || request.tabId;
      if (tabId && chrome.browserAction && chrome.browserAction.setBadgeText) {
        var count = matched.length > 0 ? String(matched.length) : '';
        chrome.browserAction.setBadgeText({ text: count, tabId: tabId });
        chrome.browserAction.setBadgeBackgroundColor({ color: '#007AFF', tabId: tabId });
      }

      reply(true, {
        scripts: matched,
        domainRules: state.domainRules,
        temporaryOverrides: temporaryOverrides,
        emergencyDisabled: false
      });
    }).catch(function(err) {
      reply(false, null, err.message);
    });
    return true;
  }

  // 2. Temporary Script Control (Phase 4)
  if (action === 'setTemporaryOverride') {
    var payload = request.payload || {};
    var scriptId = payload.scriptId;
    var enable = !!payload.enable;
    var durationMinutes = payload.durationMinutes; // 5, 60, 1440 (today), or 0 for session

    if (scriptId) {
      temporaryOverrides[scriptId] = enable;
      if (durationMinutes && durationMinutes > 0) {
        overrideExpirations[scriptId] = Date.now() + (durationMinutes * 60 * 1000);
      } else {
        delete overrideExpirations[scriptId];
      }
    }
    reply(true, { status: 'ok', temporaryOverrides: temporaryOverrides });
    return true;
  }

  // 3. Domain Rule Quick Toggle (Phase 2 & 3)
  if (action === 'toggleDomainRule') {
    var domain = (request.payload && request.payload.domain) || '';
    var ruleAction = (request.payload && request.payload.ruleAction) || 'Block';
    sendNative('addDomainRule', { domain: domain, action: ruleAction })
      .then(function(res) {
        return syncAll();
      })
      .then(function() {
        reply(true, { status: 'ok' });
      })
      .catch(function(err) {
        reply(false, null, err.message);
      });
    return true;
  }

  // 4. Cross-Origin Network Engine (GM_xmlhttpRequest)
  if (action === 'xmlHttpRequest') {
    var details = request.payload || request.details || {};
    handleNetworkRequest(details, reply);
    return true;
  }

  // 5. Storage Save
  if (action === 'saveStorage') {
    sendNative('saveStorage', request.payload)
      .then(function(res) { reply(true, res); })
      .catch(function(err) { reply(false, null, err.message); });
    return true;
  }

  // 6. Reload Tab
  if (action === 'reloadTab') {
    if (chrome.tabs && chrome.tabs.reload) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    }
    reply(true, { status: 'reloading' });
    return true;
  }

  // 7. Emergency Disable Toggle
  if (action === 'toggleEmergencyDisable') {
    cachedAppConfig.emergencyDisableAll = !cachedAppConfig.emergencyDisableAll;
    sendNative('saveAppConfig', { emergencyDisableAll: cachedAppConfig.emergencyDisableAll })
      .then(function() {
        reply(true, { emergencyDisableAll: cachedAppConfig.emergencyDisableAll });
      })
      .catch(function(err) {
        reply(true, { emergencyDisableAll: cachedAppConfig.emergencyDisableAll });
      });
    return true;
  }

  return false;
});

function handleNetworkRequest(details, reply) {
  var url = details.url;
  var method = (details.method || 'GET').toUpperCase();
  var headers = details.headers || {};
  var data = details.data || null;

  var fetchOpts = {
    method: method,
    headers: headers,
    mode: 'cors'
  };

  if (method !== 'GET' && method !== 'HEAD' && data) {
    fetchOpts.body = data;
  }

  fetch(url, fetchOpts)
    .then(function(response) {
      var headerObj = {};
      response.headers.forEach(function(val, key) {
        headerObj[key] = val;
      });

      return response.text().then(function(text) {
        reply(true, {
          status: response.status,
          statusText: response.statusText,
          responseHeaders: JSON.stringify(headerObj),
          responseText: text,
          finalUrl: response.url
        });
      });
    })
    .catch(function(err) {
      reply(false, null, err.message || 'Fetch failed');
    });
}
