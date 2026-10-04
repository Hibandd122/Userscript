/**
 * Userscript Safari Web Extension Background Service Worker
 * Manages native IPC, cross-origin network requests, and script caching.
 */

var cachedScripts = [];
var nativeHandshakeDone = false;

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
      resolve({ status: 'ok', scripts: cachedScripts });
    }
  });
}

function initNativeConnection() {
  sendNative('handshake')
    .then(function(res) {
      nativeHandshakeDone = true;
      return syncScripts();
    })
    .catch(function(err) {
      console.warn('[Userscript Background] Native handshake delayed:', err.message);
      syncScripts();
    });
}

function syncScripts() {
  return sendNative('getScripts')
    .then(function(res) {
      if (res && res.scripts) {
        cachedScripts = res.scripts;
      }
      return cachedScripts;
    })
    .catch(function() {
      return cachedScripts;
    });
}

// Initial sync
initNativeConnection();

// Periodically refresh scripts or on tab activation
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(function() {
    syncScripts();
  });
}

// Global message handler
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

  // 1. Get Matching Scripts
  if (action === 'getMatchingScripts') {
    syncScripts().then(function(scripts) {
      var url = request.payload ? request.payload.url : request.url;
      var matched = [];

      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i];
        if (s.enabled !== false) {
          matched.push(s);
        }
      }

      // Update Tab Badge
      if (sender.tab && sender.tab.id) {
        if (chrome.browserAction && chrome.browserAction.setBadgeText) {
          var count = matched.length > 0 ? String(matched.length) : '';
          chrome.browserAction.setBadgeText({ text: count, tabId: sender.tab.id });
          chrome.browserAction.setBadgeBackgroundColor({ color: '#007AFF', tabId: sender.tab.id });
        }
      }

      reply(true, { scripts: matched });
    }).catch(function(err) {
      reply(false, null, err.message);
    });
    return true;
  }

  // 2. Cross-Origin Network Engine (GM_xmlhttpRequest)
  if (action === 'xmlHttpRequest') {
    var details = request.payload || request.details || {};
    handleNetworkRequest(details, reply);
    return true;
  }

  // 3. Storage Save
  if (action === 'saveStorage') {
    sendNative('saveStorage', request.payload)
      .then(function(res) { reply(true, res); })
      .catch(function(err) { reply(false, null, err.message); });
    return true;
  }

  // 4. Storage Get
  if (action === 'getStorage') {
    sendNative('getStorage', request.payload)
      .then(function(res) { reply(true, res); })
      .catch(function(err) { reply(false, null, err.message); });
    return true;
  }

  // 5. Open Tab
  if (action === 'openTab') {
    var tabUrl = request.payload ? request.payload.url : request.url;
    var tabActive = request.payload ? request.payload.active : true;
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: tabUrl, active: tabActive }, function(newTab) {
        reply(true, { tabId: newTab ? newTab.id : null });
      });
    } else {
      reply(false, null, 'Tabs API not accessible');
    }
    return true;
  }

  // 6. Script Status Reporting
  if (action === 'reportScriptStatus') {
    sendNative('reportExecution', request.payload).catch(function() {});
    reply(true);
    return true;
  }

  // 7. Get All Scripts (For Popup)
  if (action === 'getAllScripts') {
    syncScripts().then(function(scripts) {
      reply(true, { scripts: scripts });
    });
    return true;
  }

  return false;
});

function handleNetworkRequest(details, reply) {
  var method = (details.method || 'GET').toUpperCase();
  var url = details.url;
  var headers = details.headers || {};
  var data = details.data || null;

  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.timeout = details.timeout || 30000;

  for (var h in headers) {
    try {
      xhr.setRequestHeader(h, headers[h]);
    } catch (e) {}
  }

  xhr.onload = function() {
    reply(true, {
      status: xhr.status,
      statusText: xhr.statusText,
      responseHeaders: xhr.getAllResponseHeaders(),
      responseText: xhr.responseText,
      response: xhr.response
    });
  };

  xhr.onerror = function() {
    reply(false, null, 'Network request failed (CORS or host unreachable)');
  };

  xhr.ontimeout = function() {
    reply(false, null, 'Network request timed out');
  };

  try {
    xhr.send(data);
  } catch (err) {
    reply(false, null, err.message);
  }
}
