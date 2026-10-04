/**
 * Greasemonkey / Tampermonkey API implementation for Safari
 */
(function() {
  window.__US_CreateGM = function(script) {
    var prefix = "us_" + (script.id || script.name) + "_";

    var gm_getValue = function(key, defaultValue) {
      try {
        var raw = localStorage.getItem(prefix + key);
        if (raw === null || raw === undefined) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    };

    var gm_setValue = function(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch (e) {
        console.error("[Userscript] GM_setValue error:", e);
      }
    };

    var gm_deleteValue = function(key) {
      try {
        localStorage.removeItem(prefix + key);
      } catch (e) {}
    };

    var gm_listValues = function() {
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
    };

    var gm_addStyle = function(css) {
      var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      var style = document.createElement('style');
      style.type = 'text/css';
      style.textContent = css;
      head.appendChild(style);
      return style;
    };

    var gm_addElement = function(parentOrTag, tagOrAttrs, attrs) {
      var parent = document.body || document.documentElement;
      var tag = "div";
      var attributes = {};

      if (typeof parentOrTag === 'string') {
        tag = parentOrTag;
        attributes = tagOrAttrs || {};
      } else {
        parent = parentOrTag || parent;
        tag = tagOrAttrs || "div";
        attributes = attrs || {};
      }

      var el = document.createElement(tag);
      for (var key in attributes) {
        if (key === 'textContent') {
          el.textContent = attributes[key];
        } else {
          el.setAttribute(key, attributes[key]);
        }
      }
      parent.appendChild(el);
      return el;
    };

    var gm_setClipboard = function(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    };

    var gm_openInTab = function(url) {
      window.open(url, '_blank');
    };

    var gm_notification = function(text, title) {
      console.log("[Userscript Notification]", title || script.name, ":", text);
    };

    var gm_registerMenuCommand = function(caption, onClick) {
      console.log("[Userscript Menu Command Registered]", caption);
    };

    var gm_xmlhttpRequest = function(details) {
      // Forward cross-origin request to background worker
      var reqId = "xhr_" + Math.random().toString(36).slice(2);
      chrome.runtime.sendMessage({
        action: "xmlHttpRequest",
        reqId: reqId,
        details: {
          method: details.method || "GET",
          url: details.url,
          headers: details.headers || {},
          data: details.data || null,
          responseType: details.responseType || "text"
        }
      }, function(response) {
        if (!response) {
          if (details.onerror) details.onerror({ error: "No response from background" });
          return;
        }

        if (response.error && details.onerror) {
          details.onerror(response);
        } else if (details.onload) {
          details.onload({
            status: response.status,
            statusText: response.statusText,
            responseHeaders: response.responseHeaders,
            responseText: response.responseText,
            response: response.response
          });
        }
      });
    };

    var modernGM = {
      getValue: function(key, defaultValue) {
        return Promise.resolve(gm_getValue(key, defaultValue));
      },
      setValue: function(key, value) {
        return Promise.resolve(gm_setValue(key, value));
      },
      deleteValue: function(key) {
        return Promise.resolve(gm_deleteValue(key));
      },
      listValues: function() {
        return Promise.resolve(gm_listValues());
      },
      addStyle: function(css) {
        return Promise.resolve(gm_addStyle(css));
      },
      addElement: function(parent, tag, attrs) {
        return Promise.resolve(gm_addElement(parent, tag, attrs));
      },
      xmlHttpRequest: gm_xmlhttpRequest,
      setClipboard: function(text) {
        return Promise.resolve(gm_setClipboard(text));
      },
      openInTab: function(url) {
        return Promise.resolve(gm_openInTab(url));
      },
      notification: function(text, title) {
        return Promise.resolve(gm_notification(text, title));
      },
      info: {
        script: {
          name: script.name,
          version: script.version,
          description: script.description,
          author: script.author
        }
      }
    };

    return {
      GM_getValue: gm_getValue,
      GM_setValue: gm_setValue,
      GM_deleteValue: gm_deleteValue,
      GM_listValues: gm_listValues,
      GM_addStyle: gm_addStyle,
      GM_addElement: gm_addElement,
      GM_xmlhttpRequest: gm_xmlhttpRequest,
      GM_setClipboard: gm_setClipboard,
      GM_openInTab: gm_openInTab,
      GM_notification: gm_notification,
      GM_registerMenuCommand: gm_registerMenuCommand,
      GM: modernGM
    };
  };
})();
