/**
 * Userscript Full Greasemonkey & Tampermonkey API Suite 2.0
 * Includes: Scoped Storage (Phase 5), Network Inspector Logging (Phase 20), Resource Manager (Phase 11), DOM Debugger (Phase 22)
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var menuCommandCounter = 0;
  var registeredMenuCommands = Object.create(null);

  // Network Inspector Audit Log (Phase 20: capped at 100 entries, no sensitive headers/body)
  globalScope.__US_NetworkLogs = globalScope.__US_NetworkLogs || [];

  // DOM Debugger tracking (Phase 22)
  globalScope.__US_DOMInspect = globalScope.__US_DOMInspect || {
    injectedStyles: [],
    injectedElements: [],
    activeTimers: 0
  };

  globalScope.__US_CreateRuntimeContext = function(script) {
    var prefix = 'us_store_' + (script.id || script.name) + '_';
    var bridge = globalScope.__US_Bridge;

    function getStorageKey(key, scope) {
      if (scope === 'global') return 'us_store_global_' + key;
      if (scope === 'domain') {
        var host = (typeof window !== 'undefined' && window.location && window.location.hostname) || 'domain';
        return 'us_store_domain_' + host + '_' + key;
      }
      return prefix + key;
    }

    // --- 1. Storage API with Scope Support (Phase 5: global, script, domain) ---
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
        localStorage.setItem(k, JSON.stringify(value));
        if (bridge) {
          bridge.request('saveStorage', { key: k, value: value }, 5000).catch(function() {});
        }
      } catch (e) {
        console.error('[Userscript] GM_setValue error:', e);
      }
    }

    function gm_deleteValue(key, scope) {
      try {
        var k = getStorageKey(key, scope);
        localStorage.removeItem(k);
      } catch (e) {}
    }

    function gm_listValues(scope) {
      var keys = [];
      var filterPrefix = scope === 'global' ? 'us_store_global_' :
                         scope === 'domain' ? ('us_store_domain_' + window.location.hostname + '_') : prefix;
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

    // --- 2. DOM Injection API (Phase 22: Tracked for DOM Debugger) ---
    function gm_addStyle(css) {
      var target = (typeof document !== 'undefined' && (document.head || document.documentElement));
      if (!target) return null;
      var style = document.createElement('style');
      style.type = 'text/css';
      style.textContent = css;
      style.setAttribute('data-userscript', script.name || 'custom-style');
      target.appendChild(style);

      globalScope.__US_DOMInspect.injectedStyles.push({
        scriptName: script.name,
        cssLength: css.length,
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
      for (var key in attrs) {
        if (key === 'textContent') {
          el.textContent = attrs[key];
        } else if (key === 'innerHTML') {
          el.innerHTML = attrs[key];
        } else {
          el.setAttribute(key, attrs[key]);
        }
      }
      parent.appendChild(el);

      globalScope.__US_DOMInspect.injectedElements.push({
        scriptName: script.name,
        tagName: tag,
        element: el
      });

      return el;
    }

    // --- 3. Clipboard API ---
    function gm_setClipboard(data, info) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(data)).catch(function(err) {
          console.warn('[Userscript] Clipboard write failed:', err);
        });
      }
    }

    // --- 4. Tabs API ---
    function gm_openInTab(url, options) {
      var active = options && options.active !== undefined ? options.active : true;
      if (bridge) {
        bridge.request('openTab', { url: url, active: active }).catch(function() {
          if (typeof window !== 'undefined') window.open(url, '_blank');
        });
      } else if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
    }

    // --- 5. Notifications API ---
    function gm_notification(textOrDetails, titleOrOnDone, maybeImage) {
      var text = typeof textOrDetails === 'string' ? textOrDetails : (textOrDetails.text || '');
      var title = typeof titleOrOnDone === 'string' ? titleOrOnDone : (textOrDetails.title || script.name);
      
      console.log('[Userscript Notification] ' + title + ': ' + text);
      if (bridge) {
        bridge.request('showNotification', { title: title, message: text }).catch(function() {});
      }
    }

    // --- 6. Menu Commands API ---
    function gm_registerMenuCommand(caption, onClick, accessKey) {
      menuCommandCounter++;
      var cmdId = 'menu_' + menuCommandCounter;
      registeredMenuCommands[cmdId] = {
        id: cmdId,
        scriptId: script.id,
        caption: caption,
        onClick: onClick
      };
      return cmdId;
    }

    function gm_unregisterMenuCommand(cmdId) {
      delete registeredMenuCommands[cmdId];
    }

    // --- 7. Resource API (Phase 11) ---
    function gm_getResourceText(resourceName) {
      if (!script.resources || !Array.isArray(script.resources)) return null;
      for (var i = 0; i < script.resources.length; i++) {
        if (script.resources[i].name === resourceName) {
          return script.resources[i].content || null;
        }
      }
      return null;
    }

    function gm_getResourceURL(resourceName) {
      if (!script.resources || !Array.isArray(script.resources)) return null;
      for (var i = 0; i < script.resources.length; i++) {
        if (script.resources[i].name === resourceName) {
          return script.resources[i].url || null;
        }
      }
      return null;
    }

    // --- 8. Network Engine (GM_xmlhttpRequest) & Network Inspector (Phase 20) ---
    function gm_xmlhttpRequest(details) {
      if (!details || !details.url) {
        if (details && details.onerror) details.onerror({ error: 'Missing URL parameter' });
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

      if (!bridge) {
        if (details.onerror) details.onerror({ error: 'Bridge not available' });
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
          
          // Log to Network Inspector (Phase 20)
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
              response: res.response || responseText
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

    // --- 9. Script Metadata Object ---
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
        resources: script.resources || []
      },
      scriptMetaStr: '',
      scriptHandler: 'Userscript',
      version: '2.0.0'
    };

    // --- 10. Modern GM.* Promise API ---
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
      xmlHttpRequest: function(d) { return gm_xmlhttpRequest(d); },
      getResourceText: function(r) { return Promise.resolve(gm_getResourceText(r)); },
      getResourceUrl: function(r) { return Promise.resolve(gm_getResourceURL(r)); }
    };

    return {
      GM: GM,
      GM_info: scriptInfo,
      GM_getValue: gm_getValue,
      GM_setValue: gm_setValue,
      GM_deleteValue: gm_deleteValue,
      GM_listValues: gm_listValues,
      GM_addStyle: gm_addStyle,
      GM_addElement: gm_addElement,
      GM_setClipboard: gm_setClipboard,
      GM_notification: gm_notification,
      GM_openInTab: gm_openInTab,
      GM_registerMenuCommand: gm_registerMenuCommand,
      GM_unregisterMenuCommand: gm_unregisterMenuCommand,
      GM_getResourceText: gm_getResourceText,
      GM_getResourceURL: gm_getResourceURL,
      GM_xmlhttpRequest: gm_xmlhttpRequest
    };
  };
})();
