/**
 * Userscript JS Bridge
 * Specification #3: Protocol v1 typed messaging between Content Script, Background Worker, and Native Extension
 */
(function() {
  'use strict';

  var PROTOCOL_VERSION = 1;
  var pendingRequests = Object.create(null);
  var eventListeners = Object.create(null);
  var DEFAULT_TIMEOUT_MS = 15000;

  function generateUUID() {
    return 'req_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
  }

  function serialize(data) {
    try {
      return JSON.stringify(data);
    } catch (e) {
      return String(data);
    }
  }

  function deserialize(raw) {
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  }

  function isValidMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    return typeof msg.type === 'string' && typeof msg.action === 'string' && typeof msg.requestId === 'string';
  }

  function createRequest(action, payload) {
    return {
      version: PROTOCOL_VERSION,
      type: 'GM_REQUEST',
      action: action,
      requestId: generateUUID(),
      payload: payload || {}
    };
  }

  function createResponse(requestId, success, payload, error) {
    return {
      version: PROTOCOL_VERSION,
      type: 'GM_RESPONSE',
      requestId: requestId,
      success: !!success,
      payload: payload || {},
      error: error || null
    };
  }

  var JSBridge = {
    protocolVersion: PROTOCOL_VERSION,
    serialize: serialize,
    deserialize: deserialize,
    isValidMessage: isValidMessage,
    createRequest: createRequest,
    createResponse: createResponse,

    /**
     * Fire-and-forget message
     */
    send: function(action, payload) {
      var msg = createRequest(action, payload);
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(msg);
        }
      } catch (err) {
        console.warn('[Userscript Bridge] send failed:', err);
      }
      return msg;
    },

    /**
     * Typed request with UUID, timeout & error handling
     */
    request: function(action, payload, timeoutMs) {
      timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
      var msg = createRequest(action, payload);
      var requestId = msg.requestId;

      return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
          if (pendingRequests[requestId]) {
            delete pendingRequests[requestId];
            reject(new Error('[Userscript Bridge] Request timed out for action: ' + action));
          }
        }, timeoutMs);

        pendingRequests[requestId] = {
          resolve: resolve,
          reject: reject,
          timer: timer
        };

        try {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(msg, function(response) {
              var lastError = chrome.runtime.lastError;
              if (lastError) {
                if (pendingRequests[requestId]) {
                  clearTimeout(pendingRequests[requestId].timer);
                  delete pendingRequests[requestId];
                }
                reject(new Error('[Userscript Bridge] IPC Error: ' + lastError.message));
                return;
              }

              if (response && response.requestId === requestId) {
                if (pendingRequests[requestId]) {
                  clearTimeout(pendingRequests[requestId].timer);
                  delete pendingRequests[requestId];
                }
                if (response.success) {
                  resolve(response.payload);
                } else {
                  reject(new Error(response.error || 'Unknown bridge error'));
                }
              }
            });
          } else {
            // Mock or offline fallback
            setTimeout(function() {
              if (pendingRequests[requestId]) {
                clearTimeout(pendingRequests[requestId].timer);
                delete pendingRequests[requestId];
                resolve({ mock: true });
              }
            }, 10);
          }
        } catch (err) {
          if (pendingRequests[requestId]) {
            clearTimeout(pendingRequests[requestId].timer);
            delete pendingRequests[requestId];
          }
          reject(err);
        }
      });
    },

    /**
     * Handles incoming response messages
     */
    handleIncomingResponse: function(response) {
      if (!response || response.type !== 'GM_RESPONSE' || !response.requestId) return;
      var handler = pendingRequests[response.requestId];
      if (!handler) return;

      clearTimeout(handler.timer);
      delete pendingRequests[response.requestId];

      if (response.success) {
        handler.resolve(response.payload);
      } else {
        handler.reject(new Error(response.error || 'Bridge call failed'));
      }
    },

    /**
     * Event subscription
     */
    subscribe: function(event, callback) {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(callback);
    },

    unsubscribe: function(event, callback) {
      if (!eventListeners[event]) return;
      eventListeners[event] = eventListeners[event].filter(function(cb) { return cb !== callback; });
    },

    emit: function(event, data) {
      if (!eventListeners[event]) return;
      eventListeners[event].forEach(function(cb) {
        try { cb(data); } catch (e) { console.error('[Bridge Event Error]', e); }
      });
    }
  };

  window.__US_Bridge = JSBridge;

  // Register listener for async push responses
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(msg) {
      if (msg && msg.type === 'GM_RESPONSE') {
        JSBridge.handleIncomingResponse(msg);
      } else if (msg && msg.type === 'GM_EVENT') {
        JSBridge.emit(msg.event, msg.payload);
      }
    });
  }
})();
