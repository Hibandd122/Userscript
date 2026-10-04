/**
 * Background Service Worker for Userscript Safari Extension
 */

var cachedScripts = [];

function fetchScriptsFromNative() {
  return new Promise(function(resolve) {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendNativeMessage) {
      browser.runtime.sendNativeMessage("application.id", { action: "getScripts" }, function(response) {
        if (response && response.scripts) {
          cachedScripts = response.scripts;
        }
        resolve(cachedScripts);
      });
    } else {
      resolve(cachedScripts);
    }
  });
}

// Initial load
fetchScriptsFromNative();

// Listen to messages from content scripts and popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getMatchingScripts") {
    fetchScriptsFromNative().then(function(scripts) {
      var url = request.url;
      var matched = [];

      for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        if (script.enabled !== false) {
          // Check matching rules
          if (isScriptMatchingUrl(script, url)) {
            matched.push(script);
          }
        }
      }

      // Update badge
      if (sender.tab && sender.tab.id && matched.length > 0) {
        if (chrome.browserAction && chrome.browserAction.setBadgeText) {
          chrome.browserAction.setBadgeText({ text: String(matched.length), tabId: sender.tab.id });
          chrome.browserAction.setBadgeBackgroundColor({ color: "#007AFF", tabId: sender.tab.id });
        }
      }

      sendResponse({ scripts: matched });
    });
    return true; // Keep sendResponse open for async
  }

  if (request.action === "xmlHttpRequest") {
    handleXmlHttpRequest(request.details, sendResponse);
    return true;
  }

  if (request.action === "getAllScripts") {
    fetchScriptsFromNative().then(function(scripts) {
      sendResponse({ scripts: scripts });
    });
    return true;
  }
});

function isScriptMatchingUrl(script, url) {
  if (!url) return false;
  var matches = script.matches || ["*://*/*"];
  for (var i = 0; i < matches.length; i++) {
    if (matches[i] === "<all_urls>" || matches[i] === "*://*/*") return true;
    var pattern = matches[i].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    var re = new RegExp('^' + pattern + '$', 'i');
    if (re.test(url)) return true;
  }
  return false;
}

function handleXmlHttpRequest(details, sendResponse) {
  var xhr = new XMLHttpRequest();
  xhr.open(details.method || "GET", details.url, true);

  if (details.headers) {
    for (var h in details.headers) {
      try {
        xhr.setRequestHeader(h, details.headers[h]);
      } catch (e) {}
    }
  }

  xhr.onload = function() {
    sendResponse({
      status: xhr.status,
      statusText: xhr.statusText,
      responseHeaders: xhr.getAllResponseHeaders(),
      responseText: xhr.responseText,
      response: xhr.response
    });
  };

  xhr.onerror = function() {
    sendResponse({ error: "Network error during cross-origin request" });
  };

  xhr.ontimeout = function() {
    sendResponse({ error: "Request timeout" });
  };

  try {
    xhr.send(details.data || null);
  } catch (e) {
    sendResponse({ error: e.message });
  }
}
