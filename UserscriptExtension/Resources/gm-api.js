/**
 * Userscript Runtime & Compatibility Engine 3.0
 * GM API Suite 3.0: Full Greasemonkey, Tampermonkey & Violentmonkey Compatibility
 * Includes: Value Change Listeners, @connect Network Engine, DOM Disposal Tracking, Clipboard Fallback, Modern GM.* API
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var menuCommandCounter = 0;
  var registeredMenuCommands = Object.create(null);
  var valueChangeListeners = Object.create(null); // listenerId -> { key, callback, scriptId }
  var valueChangeListenerCounter = 0;

  // Global Network Inspector Log (capped at 100 entries, no sensitive data)
  globalScope.__US_NetworkLogs = globalScope.__US_NetworkLogs || [];

  // Global DOM Inspector / Resource Tracker
  globalScope.__US_DOMInspect = globalScope.__US_DOMInspect || {
    injectedStyles: [],
    injectedElements: [],
    activeTimers: 0
  };

  /**
   * Helper: Matches target host against @connect rules
   * Supported:
   *  - "*" (any domain)
   *  - "example.com" (exact domain)
   *  - "*.example.com" or ".example.com" (subdomains)
   *  - "localhost" or IP addresses
   *  - "self" (same domain as page)
   */
  function isConnectPermitted(targetUrl, connectRules) {
    if (!connectRules || !Array.isArray(connectRules) || connectRules.length === 0) {
      // Default: if no @connect specified, allow for backwards compatibility with legacy userscripts
      return true;
    }

    var targetHost = '';
    try {
      var parsed = new URL(targetUrl, typeof window !== 'undefined' ? window.location.href : 'https://localhost');
      targetHost = parsed.hostname.toLowerCase();
    } catch (e) {
      targetHost = targetUrl.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
    }

    var currentHost = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname.toLowerCase() : '';

    for (var i = 0; i < connectRules.length; i++) {
      var rule = String(connectRules[i]).trim().toLowerCase();
      if (!rule) continue;

      if (rule === '*' || rule === '<all_urls>') {
        return true;
      }
      if (rule === 'self' && currentHost && targetHost === currentHost) {
        return true;
      }
      if (rule === targetHost) {
        return true;
      }
      if (rule.indexOf('*.') === 0) {
        var baseDomain = rule.slice(2);
        if (targetHost === baseDomain || targetHost.endsWith('.' + baseDomain)) {
          return true;
        }
      }
      if (rule.indexOf('.') === 0) {
        var subDomain = rule.slice(1);
        if (targetHost === subDomain || targetHost.endsWith('.' + subDomain)) {
          return true;
        }
      }
      if (targetHost.endsWith('.' + rule)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Creates an isolated, sandboxed runtime context for an individual userscript.
   */
  globalScope.__US_CreateRuntimeContext = function(script) {
    var scriptId = script.id || script.name || 'anonymous_script';
    var prefix = 'us_store_' + scriptId + '_';
    var bridge = globalScope.__US_Bridge;

    // Track resources created by this script for safe disposal
    var scriptDisposables = {
      styles: [],
      elements: [],
      valueListeners: [],
      timers: [],
      intervals: [],
      observers: []
    };

    function getStorageKey(key, scope) {
      if (scope === 'global') return 'us_store_global_' + key;
      if (scope === 'domain') {
        var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'domain';
        return 'us_store_domain_' + host + '_' + key;
      }
      return prefix + key;
    }

    // --- 1. Storage API ---
    function gm_getValue(key, defaultValue, scope) {
      try {
        var k = getStorageKey(key, scope);
        var raw = localStorage.getItem(k);
        if (raw === null || raw === undefined) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    }

    function gm_setValue(key, value, scope) {
      try {
        var k = getStorageKey(key, scope);
        var oldValue = gm_getValue(key, undefined, scope);
        localStorage.setItem(k, JSON.stringify(value));

        // Notify local change listeners
        notifyValueChange(key, oldValue, value, false);

        if (bridge && typeof bridge.request === 'function') {
          bridge.request('saveStorage', { key: k, value: value }, 5000).catch(function() {});
        }
      } catch (e) {
        console.error('[Userscript] GM_setValue error:', e);
      }
    }

    function gm_deleteValue(key, scope) {
      try {
        var k = getStorageKey(key, scope);
        var oldValue = gm_getValue(key, undefined, scope);
        localStorage.removeItem(k);
        notifyValueChange(key, oldValue, undefined, false);
      } catch (e) {}
    }

    function gm_listValues(scope) {
      var keys = [];
      var filterPrefix = scope === 'global' ? 'us_store_global_' :
                         scope === 'domain' ? ('us_store_domain_' + (window.location.hostname || 'domain') + '_') : prefix;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var itemKey = localStorage.key(i);
          if (itemKey && itemKey.indexOf(filterPrefix) === 0) {
            keys.push(itemKey.slice(filterPrefix.length));
          }
        }
      } catch (e) {}
      return keys;
    }

    // --- 2. Value Change Listeners (GM_addValueChangeListener) ---
    function notifyValueChange(key, oldValue, newValue, remote) {
      for (var lId in valueChangeListeners) {
        var listener = valueChangeListeners[lId];
        if (listener && listener.scriptId === scriptId && listener.key === key) {
          try {
            listener.callback(key, oldValue, newValue, !!remote);
          } catch (err) {
            console.error('[Userscript] Error in value change listener:', err);
          }
        }
      }
    }

    function gm_addValueChangeListener(key, callback) {
      if (typeof callback !== 'function') return null;
      valueChangeListenerCounter++;
      var listenerId = 'vcl_' + scriptId + '_' + valueChangeListenerCounter;
      valueChangeListeners[listenerId] = {
        id: listenerId,
        scriptId: scriptId,
        key: key,
        callback: callback
      };
      scriptDisposables.valueListeners.push(listenerId);
      return listenerId;
    }

    function gm_removeValueChangeListener(listenerId) {
      if (valueChangeListeners[listenerId]) {
        delete valueChangeListeners[listenerId];
        var idx = scriptDisposables.valueListeners.indexOf(listenerId);
        if (idx !== -1) scriptDisposables.valueListeners.splice(idx, 1);
      }
    }

    // --- 3. DOM Injection API (With Disposal Tracking) ---
    function gm_addStyle(css) {
      var target = (typeof document !== 'undefined' && (document.head || document.documentElement));
      if (!target) return null;
      var style = document.createElement('style');
      style.type = 'text/css';
      style.textContent = css;
      style.setAttribute('data-userscript', script.name || 'custom-style');
      target.appendChild(style);

      scriptDisposables.styles.push(style);
      globalScope.__US_DOMInspect.injectedStyles.push({
        scriptName: script.name,
        cssLength: css ? css.length : 0,
        element: style
      });

      return style;
    }

    function gm_addElement(parentOrTag, tagOrAttrs, maybeAttrs) {
      var parent = (typeof document !== 'undefined' && (document.body || document.documentElement));
      var tag = 'div';
      var attrs = {};

      if (typeof parentOrTag === 'string') {
        tag = parentOrTag;
        attrs = tagOrAttrs || {};
      } else {
        parent = parentOrTag || parent;
        tag = tagOrAttrs || 'div';
        attrs = maybeAttrs || {};
      }

      if (!document || !parent) return null;

      var el = document.createElement(tag);
      for (var k in attrs) {
        if (k === 'textContent') {
          el.textContent = attrs[k];
        } else if (k === 'innerHTML') {
          el.innerHTML = attrs[k];
        } else {
          el.setAttribute(k, attrs[k]);
        }
      }
      parent.appendChild(el);

      scriptDisposables.elements.push(el);
      globalScope.__US_DOMInspect.injectedElements.push({
        scriptName: script.name,
        tagName: tag,
        element: el
      });

      return el;
    }

    // --- 4. Clipboard API with Robust Fallback ---
    function gm_setClipboard(data, info) {
      var text = String(data);
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function() {
          fallbackClipboard(text);
        });
      } else {
        fallbackClipboard(text);
      }
    }

    function fallbackClipboard(text) {
      try {
        if (typeof document === 'undefined') return;
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (e) {
        console.warn('[Userscript] Clipboard copy failed:', e);
      }
    }

    // --- 5. Tabs API ---
    function gm_openInTab(url, options) {
      var active = options && options.active !== undefined ? options.active : true;
      if (bridge && typeof bridge.request === 'function') {
        bridge.request('openTab', { url: url, active: active }, 5000).catch(function() {
          if (typeof window !== 'undefined') window.open(url, '_blank');
        });
      } else if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
    }

    // --- 6. Notifications API ---
    function gm_notification(textOrDetails, titleOrOnDone, maybeImage) {
      var text = typeof textOrDetails === 'string' ? textOrDetails : (textOrDetails.text || '');
      var title = typeof titleOrOnDone === 'string' ? titleOrOnDone : (textOrDetails.title || script.name);

      console.log('[Userscript Notification] ' + title + ': ' + text);
      if (bridge && typeof bridge.request === 'function') {
        bridge.request('showNotification', { title: title, message: text }, 5000).catch(function() {});
      }
    }

    // --- 7. Menu Commands API ---
    function gm_registerMenuCommand(caption, onClick, accessKey) {
      menuCommandCounter++;
      var cmdId = 'menu_' + scriptId + '_' + menuCommandCounter;
      registeredMenuCommands[cmdId] = {
        id: cmdId,
        scriptId: scriptId,
        caption: caption,
        onClick: onClick
      };
      return cmdId;
    }

    function gm_unregisterMenuCommand(cmdId) {
      delete registeredMenuCommands[cmdId];
    }

    // --- 8. Resource API ---
    function gm_getResourceText(resourceName) {
      if (!script.resources) return null;
      if (Array.isArray(script.resources)) {
        for (var i = 0; i < script.resources.length; i++) {
          if (script.resources[i].name === resourceName) {
            return script.resources[i].content || null;
          }
        }
      } else if (typeof script.resources === 'object') {
        return script.resources[resourceName] || null;
      }
      return null;
    }

    function gm_getResourceURL(resourceName) {
      if (!script.resources) return null;
      if (Array.isArray(script.resources)) {
        for (var i = 0; i < script.resources.length; i++) {
          if (script.resources[i].name === resourceName) {
            return script.resources[i].url || null;
          }
        }
      } else if (typeof script.resources === 'object') {
        return script.resources[resourceName] || null;
      }
      return null;
    }

    // --- 9. Network Engine (GM_xmlhttpRequest) with @connect Verification ---
    function gm_xmlhttpRequest(details) {
      if (!details || !details.url) {
        if (details && details.onerror) details.onerror({ error: 'Missing URL parameter' });
        return { abort: function() {} };
      }

      // Check @connect allowlist
      var connects = script.connects || [];
      if (!isConnectPermitted(details.url, connects)) {
        var errMsg = "Destination host '" + details.url + "' blocked by script @connect policy.";
        console.warn('[Userscript Security Policy]', errMsg);
        if (details.onerror) {
          details.onerror({ error: 'blocked-by-policy', message: errMsg });
        }
        return { abort: function() {} };
      }

      var startTime = Date.now();
      var aborted = false;
      var abortHandle = {
        abort: function() {
          aborted = true;
          if (details.onabort) details.onabort({ error: 'Request aborted by user' });
        }
      };

      if (!bridge || typeof bridge.request !== 'function') {
        // Fallback to fetch if bridge is not ready
        if (typeof fetch === 'function') {
          var method = (details.method || 'GET').toUpperCase();
          var fetchOpts = {
            method: method,
            headers: details.headers || {}
          };
          if (details.data && method !== 'GET' && method !== 'HEAD') {
            fetchOpts.body = details.data;
          }

          fetch(details.url, fetchOpts)
            .then(function(res) {
              if (aborted) return;
              return res.text().then(function(txt) {
                if (details.onload) {
                  details.onload({
                    readyState: 4,
                    status: res.status,
                    statusText: res.statusText,
                    responseHeaders: '',
                    responseText: txt,
                    response: txt,
                    finalUrl: res.url
                  });
                }
              });
            })
            .catch(function(err) {
              if (aborted) return;
              if (details.onerror) details.onerror({ error: err.message });
            });
          return abortHandle;
        }

        if (details.onerror) details.onerror({ error: 'Network transport unavailable' });
        return abortHandle;
      }

      var payload = {
        method: (details.method || 'GET').toUpperCase(),
        url: details.url,
        headers: details.headers || {},
        data: details.data || null,
        timeout: details.timeout || 30000,
        responseType: details.responseType || 'text'
      };

      bridge.request('xmlHttpRequest', payload, payload.timeout + 2000)
        .then(function(res) {
          if (aborted) return;
          var duration = Date.now() - startTime;
          var responseText = res.responseText || '';

          // Log to Network Inspector
          globalScope.__US_NetworkLogs.unshift({
            id: 'net_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            scriptName: script.name,
            method: payload.method,
            url: payload.url,
            status: res.status || 200,
            durationMs: duration,
            responseType: payload.responseType,
            responseBytes: responseText.length,
            timestamp: new Date().toISOString()
          });
          if (globalScope.__US_NetworkLogs.length > 100) {
            globalScope.__US_NetworkLogs.pop();
          }

          if (details.onload) {
            details.onload({
              readyState: 4,
              status: res.status || 200,
              statusText: res.statusText || 'OK',
              responseHeaders: res.responseHeaders || '',
              responseText: responseText,
              response: res.response || responseText,
              finalUrl: res.finalUrl || payload.url
            });
          }
        })
        .catch(function(err) {
          if (aborted) return;
          var duration = Date.now() - startTime;
          globalScope.__US_NetworkLogs.unshift({
            id: 'net_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            scriptName: script.name,
            method: payload.method,
            url: payload.url,
            status: 0,
            durationMs: duration,
            error: err.message || 'Network Failed',
            timestamp: new Date().toISOString()
          });

          if (details.onerror) {
            details.onerror({ error: err.message || 'Network request failed' });
          }
        });

      return abortHandle;
    }

    // --- 10. Script Metadata Object (GM_info) ---
    var scriptInfo = {
      script: {
        name: script.name,
        namespace: script.namespace || '',
        description: script.description || '',
        version: script.version || '1.0.0',
        author: script.author || '',
        matches: script.matches || [],
        includes: script.includes || [],
        excludes: script.excludes || [],
        runAt: script.runAt || 'document-end',
        resources: script.resources || {},
        connects: script.connects || []
      },
      scriptMetaStr: '',
      scriptHandler: 'Userscript',
      version: '3.0.0'
    };

    // --- 11. Modern GM.* Promise API Suite ---
    var GM = {
      info: scriptInfo,
      getValue: function(k, d, s) { return Promise.resolve(gm_getValue(k, d, s)); },
      setValue: function(k, v, s) { gm_setValue(k, v, s); return Promise.resolve(); },
      deleteValue: function(k, s) { gm_deleteValue(k, s); return Promise.resolve(); },
      listValues: function(s) { return Promise.resolve(gm_listValues(s)); },
      addStyle: function(css) { return Promise.resolve(gm_addStyle(css)); },
      addElement: function(p, t, a) { return Promise.resolve(gm_addElement(p, t, a)); },
      setClipboard: function(data, info) { gm_setClipboard(data, info); return Promise.resolve(); },
      notification: function(t, ti, i) { gm_notification(t, ti, i); return Promise.resolve(); },
      openInTab: function(u, o) { gm_openInTab(u, o); return Promise.resolve(); },
      registerMenuCommand: function(c, o, a) { return Promise.resolve(gm_registerMenuCommand(c, o, a)); },
      unregisterMenuCommand: function(id) { gm_unregisterMenuCommand(id); return Promise.resolve(); },
      xmlHttpRequest: function(d) { return gm_xmlhttpRequest(d); },
      getResourceText: function(r) { return Promise.resolve(gm_getResourceText(r)); },
      getResourceUrl: function(r) { return Promise.resolve(gm_getResourceURL(r)); }
    };

    // --- 12. Cleanup handler for SPA / Teardown ---
    function cleanup() {
      // Remove injected DOM styles
      for (var s = 0; s < scriptDisposables.styles.length; s++) {
        var el = scriptDisposables.styles[s];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      scriptDisposables.styles = [];

      // Remove injected DOM elements
      for (var e = 0; e < scriptDisposables.elements.length; e++) {
        var elem = scriptDisposables.elements[e];
        if (elem && elem.parentNode) elem.parentNode.removeChild(elem);
      }
      scriptDisposables.elements = [];

      // Remove registered value listeners
      for (var v = 0; v < scriptDisposables.valueListeners.length; v++) {
        delete valueChangeListeners[scriptDisposables.valueListeners[v]];
      }
      scriptDisposables.valueListeners = [];

      // Clear registered menu commands
      for (var cmd in registeredMenuCommands) {
        if (registeredMenuCommands[cmd] && registeredMenuCommands[cmd].scriptId === scriptId) {
          delete registeredMenuCommands[cmd];
        }
      }
    }

    return {
      GM: GM,
      GM_info: scriptInfo,
      GM_getValue: gm_getValue,
      GM_setValue: gm_setValue,
      GM_deleteValue: gm_deleteValue,
      GM_listValues: gm_listValues,
      GM_addValueChangeListener: gm_addValueChangeListener,
      GM_removeValueChangeListener: gm_removeValueChangeListener,
      GM_addStyle: gm_addStyle,
      GM_addElement: gm_addElement,
      GM_setClipboard: gm_setClipboard,
      GM_notification: gm_notification,
      GM_openInTab: gm_openInTab,
      GM_registerMenuCommand: gm_registerMenuCommand,
      GM_unregisterMenuCommand: gm_unregisterMenuCommand,
      GM_getResourceText: gm_getResourceText,
      GM_getResourceURL: gm_getResourceURL,
      GM_xmlhttpRequest: gm_xmlhttpRequest,
      __cleanup: cleanup
    };
  };

  globalScope.__US_IsConnectPermitted = isConnectPermitted;
})();
