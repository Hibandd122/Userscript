/**
 * Userscript Full Greasemonkey & Tampermonkey API Suite
 */
(function() {
  'use strict';

  var menuCommandCounter = 0;
  var registeredMenuCommands = Object.create(null);

  window.__US_CreateRuntimeContext = function(script) {
    var prefix = 'us_store_' + (script.id || script.name) + '_';
    var bridge = window.__US_Bridge;

    // --- 1. Storage API ---
    function gm_getValue(key, defaultValue) {
      try {
        var raw = localStorage.getItem(prefix + key);
        if (raw === null || raw === undefined) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    }

    function gm_setValue(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
        // Asynchronously mirror to background for persistent multi-device sync
        if (bridge) {
          bridge.request('saveStorage', { key: prefix + key, value: value }, 5000).catch(function() {});
        }
      } catch (e) {
        console.error('[Userscript] GM_setValue write error:', e);
      }
    }

    function gm_deleteValue(key) {
      try {
        localStorage.removeItem(prefix + key);
      } catch (e) {}
    }

    function gm_listValues() {
      var keys = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) {
            keys.push(k.slice(prefix.length));
          }
        }
      } catch (e) {}
      return keys;
    }

    // --- 2. DOM Injection API ---
    function gm_addStyle(css) {
      var target = document.head || document.documentElement;
      var style = document.createElement('style');
      style.type = 'text/css';
      style.textContent = css;
      style.setAttribute('data-userscript', script.name || 'custom-style');
      target.appendChild(style);
      return style;
    }

    function gm_addElement(parentOrTag, tagOrAttrs, maybeAttrs) {
      var parent = document.body || document.documentElement;
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
      return el;
    }

    // --- 3. Clipboard API ---
    function gm_setClipboard(data, info) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
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
          window.open(url, '_blank');
        });
      } else {
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

    // --- 7. Resource API ---
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

    // --- 8. Network Engine (GM_xmlhttpRequest) ---
    function gm_xmlhttpRequest(details) {
      if (!details || !details.url) {
        if (details && details.onerror) details.onerror({ error: 'Missing URL parameter' });
        return { abort: function() {} };
      }

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
          if (details.onload) {
            details.onload({
              readyState: 4,
              status: res.status || 200,
              statusText: res.statusText || 'OK',
              responseHeaders: res.responseHeaders || '',
              responseText: res.responseText || '',
              response: res.response || res.responseText || ''
            });
          }
        })
        .catch(function(err) {
          if (aborted) return;
          if (details.onerror) {
            details.onerror({ error: err.message || 'Network request failed' });
          }
        });

      return abortHandle;
    }

    // --- 9. Script Metadata Object ---
    var scriptInfo = {
      script: {
        name: script.name || '',
        namespace: script.namespace || '',
        version: script.version || '1.0.0',
        description: script.description || '',
        author: script.author || '',
        runAt: script.runAt || 'document-end',
        resources: script.resources || []
      },
      scriptHandler: 'Userscript',
      version: '1.0.0'
    };

    // --- 10. Modern GM.* Promise API ---
    var modernGM = {
      getValue: function(key, def) { return Promise.resolve(gm_getValue(key, def)); },
      setValue: function(key, val) { return Promise.resolve(gm_setValue(key, val)); },
      deleteValue: function(key) { return Promise.resolve(gm_deleteValue(key)); },
      listValues: function() { return Promise.resolve(gm_listValues()); },
      addStyle: function(css) { return Promise.resolve(gm_addStyle(css)); },
      addElement: function(parent, tag, attrs) { return Promise.resolve(gm_addElement(parent, tag, attrs)); },
      setClipboard: function(data) { return Promise.resolve(gm_setClipboard(data)); },
      openInTab: function(url, opts) { return Promise.resolve(gm_openInTab(url, opts)); },
      notification: function(text, title) { return Promise.resolve(gm_notification(text, title)); },
      getResourceUrl: function(name) { return Promise.resolve(gm_getResourceURL(name)); },
      xmlHttpRequest: gm_xmlhttpRequest,
      info: scriptInfo
    };

    return {
      GM_getValue: gm_getValue,
      GM_setValue: gm_setValue,
      GM_deleteValue: gm_deleteValue,
      GM_listValues: gm_listValues,
      GM_addStyle: gm_addStyle,
      GM_addElement: gm_addElement,
      GM_setClipboard: gm_setClipboard,
      GM_openInTab: gm_openInTab,
      GM_notification: gm_notification,
      GM_registerMenuCommand: gm_registerMenuCommand,
      GM_unregisterMenuCommand: gm_unregisterMenuCommand,
      GM_getResourceText: gm_getResourceText,
      GM_getResourceURL: gm_getResourceURL,
      GM_xmlhttpRequest: gm_xmlhttpRequest,
      GM_info: scriptInfo,
      GM: modernGM
    };
  };
})();
