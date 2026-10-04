/**
 * Userscript Runtime & Compatibility Engine 3.0
 * Content Script: SPA Navigation Engine, Frame Awareness & Lifecycle Manager
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var currentUrl = window.location.href;
  var bridge = globalScope.__US_Bridge;
  var matcher = globalScope.__US_Matcher;
  var injector = globalScope.__US_Injector;

  if (!bridge || !matcher || !injector) {
    console.error('[Userscript Content] Critical subsystems failed to initialize.');
    return;
  }

  var isTopFrame = (function() {
    try {
      return window.self === window.top;
    } catch (e) {
      return false;
    }
  })();

  var executedUrlMap = Object.create(null); // url -> Set of script IDs
  var loadedScriptsCache = [];
  var domainRulesCache = [];
  var tempOverridesCache = Object.create(null);
  var activeScriptIdsOnPage = Object.create(null);

  /**
   * Evaluates all available scripts for the current document & URL.
   */
  function evaluateAndInject(triggerType) {
    var url = window.location.href;
    console.log('[Userscript Content] Evaluating scripts (' + triggerType + ') on:', url, isTopFrame ? '[Top Frame]' : '[Subframe]');

    bridge.request('getMatchingScripts', { url: url }, 10000)
      .then(function(response) {
        if (!response || !response.scripts || !Array.isArray(response.scripts)) {
          return;
        }

        loadedScriptsCache = response.scripts;
        domainRulesCache = response.domainRules || [];
        tempOverridesCache = response.temporaryOverrides || Object.create(null);

        var matchedScripts = [];
        var newActiveScriptIds = Object.create(null);

        for (var i = 0; i < loadedScriptsCache.length; i++) {
          var s = loadedScriptsCache[i];
          var scriptId = s.id || s.name;

          // Full evaluation via MatcherEngine 2.0 with Frame & Exclude Rules
          var matchResult = matcher.evaluate(url, s, {
            domainRules: domainRulesCache,
            temporaryOverrides: tempOverridesCache,
            isTopFrame: isTopFrame
          });

          if (matchResult.matched) {
            newActiveScriptIds[scriptId] = true;
            var spaMode = (s.spaMode || 'once-per-document').toLowerCase().replace(/\s+/g, '-');

            if (triggerType === 'initial') {
              matchedScripts.push(s);
              if (!executedUrlMap[url]) executedUrlMap[url] = Object.create(null);
              executedUrlMap[url][scriptId] = true;
            } else if (triggerType === 'spa_navigation') {
              if (spaMode === 'every-navigation' || spaMode === 'always') {
                // Cleanup previous instance before re-executing
                injector.cleanupScript(scriptId);
                matchedScripts.push(s);
              } else if (spaMode === 'once-per-url' || spaMode === 'url') {
                if (!executedUrlMap[url] || !executedUrlMap[url][scriptId]) {
                  matchedScripts.push(s);
                  if (!executedUrlMap[url]) executedUrlMap[url] = Object.create(null);
                  executedUrlMap[url][scriptId] = true;
                }
              }
              // 'once-per-document' remains active without re-injecting
            }
          } else {
            // If script matched previous URL but not current URL, clean it up!
            if (activeScriptIdsOnPage[scriptId] && triggerType === 'spa_navigation') {
              console.log('[Userscript SPA] Cleaning up script no longer matching new URL:', s.name);
              injector.cleanupScript(scriptId);
            }
          }
        }

        activeScriptIdsOnPage = newActiveScriptIds;

        // Sort deterministically: Priority descending -> @run-at -> name
        matchedScripts.sort(function(a, b) {
          var pA = a.priority !== undefined ? a.priority : 100;
          var pB = b.priority !== undefined ? b.priority : 100;
          if (pB !== pA) return pB - pA;
          return (a.name || '').localeCompare(b.name || '');
        });

        console.log('[Userscript Content] Matched ' + matchedScripts.length + ' script(s) on ' + triggerType);

        // Schedule injection
        for (var j = 0; j < matchedScripts.length; j++) {
          injector.schedule(matchedScripts[j]);
        }
      })
      .catch(function(err) {
        console.warn('[Userscript Content] Could not fetch matching scripts:', err.message);
      });
  }

  // --- Initial Page Load Execution ---
  evaluateAndInject('initial');

  // --- Single-Page Application (SPA) Engine ---
  function handleUrlChange() {
    var newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      evaluateAndInject('spa_navigation');
    }
  }

  // Hook history.pushState & history.replaceState
  try {
    var originalPushState = history.pushState;
    if (originalPushState) {
      history.pushState = function() {
        var ret = originalPushState.apply(this, arguments);
        handleUrlChange();
        return ret;
      };
    }

    var originalReplaceState = history.replaceState;
    if (originalReplaceState) {
      history.replaceState = function() {
        var ret = originalReplaceState.apply(this, arguments);
        handleUrlChange();
        return ret;
      };
    }

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
  } catch (e) {
    console.warn('[Userscript Content] Failed to hook SPA history navigation:', e);
  }

  // Listen for Tab-level Script Reload commands from popup
  if (bridge && typeof bridge.on === 'function') {
    bridge.on('reloadScriptsOnTab', function() {
      console.log('[Userscript Content] Received tab reload command, re-executing active scripts...');
      injector.cleanupAll();
      evaluateAndInject('initial');
    });
  }
})();
