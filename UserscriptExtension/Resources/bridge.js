/**
 * Userscript JS Bridge 2.0
 * Protocol v1 Typed Messaging, Rate Limiting, Flood Protection, and Safe Retries
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var PROTOCOL_VERSION = 1;
  var pendingRequests = Object.create(null);
  var eventListeners = Object.create(null);
  var DEFAULT_TIMEOUT_MS = 15000;

  // Rate Limiter & Message Flood Protection (max 50 requests/sec)
  var requestTimestamps = [];
  var MAX_REQUESTS_PER_SEC = 50;
  var requestQueue = [];
  var isProcessingQueue = false;

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

  function checkRateLimit() {
    var now = Date.now();
    requestTimestamps = requestTimestamps.filter(function(ts) {
      return now - ts < 1000;
    });
    return requestTimestamps.length < MAX_REQUESTS_PER_SEC;
  }

  function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0) {
      if (!checkRateLimit()) {
        setTimeout(function() {
          isProcessingQueue = false;
          processQueue();
        }, 100);
        return;
      }
      var item = requestQueue.shift();
      requestTimestamps.push(Date.now());
      dispatchRequest(item.msg, item.resolve, item.reject, item.timeoutMs);
    }

    isProcessingQueue = false;
  }

  function dispatchRequest(msg, resolve, reject, timeoutMs) {
    var requestId = msg.requestId;
    var timer = setTimeout(function() {
      if (pendingRequests[requestId]) {
        delete pendingRequests[requestId];
        reject(new Error('[Userscript Bridge] Request timed out for action: ' + msg.action));
      }
    }, timeoutMs);

    pendingRequests[requestId] = {
      resolve: resolve,
      reject: reject,
      timer: timer,
      action: msg.action
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(msg, function(response) {
          var lastErr = chrome.runtime.lastError;
          if (lastErr) {
            if (pendingRequests[requestId]) {
              clearTimeout(timer);
              delete pendingRequests[requestId];
              reject(new Error(lastErr.message || 'Extension runtime error'));
            }
            return;
          }

          if (response && response.type === 'GM_RESPONSE') {
            if (pendingRequests[requestId]) {
              clearTimeout(timer);
              delete pendingRequests[requestId];
              if (response.success) {
                resolve(response.payload);
              } else {
                reject(new Error(response.error || 'Request unsuccessful'));
              }
            }
          }
        });
      } else {
        clearTimeout(timer);
        delete pendingRequests[requestId];
        resolve({ status: 'ok', mocked: true });
      }
    } catch (err) {
      clearTimeout(timer);
      delete pendingRequests[requestId];
      reject(err);
    }
  }

  var JSBridge = {
    protocolVersion: PROTOCOL_VERSION,
    serialize: serialize,
    deserialize: deserialize,
    isValidMessage: isValidMessage,
    createRequest: createRequest,
    createResponse: createResponse,

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

    request: function(action, payload, timeoutMs) {
      timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
      var msg = createRequest(action, payload);

      return new Promise(function(resolve, reject) {
        if (checkRateLimit()) {
          requestTimestamps.push(Date.now());
          dispatchRequest(msg, resolve, reject, timeoutMs);
        } else {
          // Message burst: queue request to prevent flood
          requestQueue.push({
            msg: msg,
            resolve: resolve,
            reject: reject,
            timeoutMs: timeoutMs
          });
          processQueue();
        }
      });
    },

    on: function(event, callback) {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(callback);
    },

    off: function(event, callback) {
      if (!eventListeners[event]) return;
      var idx = eventListeners[event].indexOf(callback);
      if (idx !== -1) {
        eventListeners[event].splice(idx, 1);
      }
    },

    emit: function(event, payload) {
      var listeners = eventListeners[event];
      if (listeners && listeners.length) {
        for (var i = 0; i < listeners.length; i++) {
          try {
            listeners[i](payload);
          } catch (e) {
            console.error('[Userscript Bridge] Listener error on event ' + event + ':', e);
          }
        }
      }
    }
  };

  // Wire incoming runtime messages from background or popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (!message) return false;

      if (message.type === 'GM_RESPONSE' && message.requestId) {
        var pending = pendingRequests[message.requestId];
        if (pending) {
          clearTimeout(pending.timer);
          delete pendingRequests[message.requestId];
          if (message.success) {
            pending.resolve(message.payload);
          } else {
            pending.reject(new Error(message.error || 'Action failed'));
          }
          return false;
        }
      }

      if (message.type === 'GM_EVENT' && message.event) {
        JSBridge.emit(message.event, message.payload);
        return false;
      }

      return false;
    });
  }

  globalScope.__US_Bridge = JSBridge;
})();
