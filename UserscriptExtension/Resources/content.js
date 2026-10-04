/**
 * Userscript Content Script Engine 2.0
 * Includes: Single-Page Application (SPA) Support (Phase 25), Lifecycle Awareness (Phase 24), Domain Rules Integration (Phase 3)
 */
(function() {
  'use strict';

  var currentUrl = window.location.href;
  var bridge = window.__US_Bridge;
  var matcher = window.__US_Matcher;
  var injector = window.__US_Injector;

  if (!bridge || !matcher || !injector) {
    console.error('[Userscript Content] Subsystems failed to initialize properly.');
    return;
  }

  var executedUrlMap = Object.create(null); // url -> Set of script IDs
  var loadedScriptsCache = [];
  var domainRulesCache = [];
  var tempOverridesCache = Object.create(null);

  function evaluateAndInject(triggerType) {
    var url = window.location.href;
    console.log('[Userscript Content] Evaluating scripts (' + triggerType + ') for:', url);

    bridge.request('getMatchingScripts', { url: url }, 10000)
      .then(function(response) {
        if (!response || !response.scripts || !Array.isArray(response.scripts)) {
          return;
        }

        loadedScriptsCache = response.scripts;
        domainRulesCache = response.domainRules || [];
        tempOverridesCache = response.temporaryOverrides || Object.create(null);

        // 1. Filter enabled and strictly matched scripts taking domain rules & temp overrides into account
        var matchedScripts = [];
        for (var i = 0; i < loadedScriptsCache.length; i++) {
          var s = loadedScriptsCache[i];
          var scriptId = s.id || s.name;

          if (s.enabled !== false && matcher.test(url, s, domainRulesCache, tempOverridesCache)) {
            // Check SPA Navigation Mode (Phase 25)
            var spaMode = s.spaMode || 'Once Per Page';

            if (triggerType === 'initial') {
              matchedScripts.push(s);
              if (!executedUrlMap[url]) executedUrlMap[url] = Object.create(null);
              executedUrlMap[url][scriptId] = true;
            } else if (triggerType === 'spa_navigation') {
              if (spaMode === 'Every Navigation') {
                matchedScripts.push(s);
              } else if (spaMode === 'Once Per Unique URL') {
                if (!executedUrlMap[url] || !executedUrlMap[url][scriptId]) {
                  matchedScripts.push(s);
                  if (!executedUrlMap[url]) executedUrlMap[url] = Object.create(null);
                  executedUrlMap[url][scriptId] = true;
                }
              }
              // 'Once Per Page' is skipped on SPA soft navigation
            }
          }
        }

        // 2. Sort by priority descending (Phase 9 & 22)
        matchedScripts.sort(function(a, b) {
          var pA = a.priority !== undefined ? a.priority : 100;
          var pB = b.priority !== undefined ? b.priority : 100;
          return pB - pA;
        });

        console.log('[Userscript Content] Matched ' + matchedScripts.length + ' script(s) on ' + triggerType);

        // 3. Schedule injection
        for (var j = 0; j < matchedScripts.length; j++) {
          injector.schedule(matchedScripts[j]);
        }
      })
      .catch(function(err) {
        console.warn('[Userscript Content] Could not retrieve scripts:', err.message);
      });
  }

  // --- Initial Page Load Execution ---
  evaluateAndInject('initial');

  // --- Single-Page Application (SPA) History Hook (Phase 25) ---
  function handleUrlChange() {
    var newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      evaluateAndInject('spa_navigation');
    }
  }

  // Wrap history.pushState & replaceState
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
  } catch (e) {
    console.warn('[Userscript Content] Could not patch history API:', e);
  }

  // Listen to popstate & hashchange events
  window.addEventListener('popstate', handleUrlChange);
  window.addEventListener('hashchange', handleUrlChange);

  // Phase 24: Tab Lifecycle cleanup
  window.addEventListener('pagehide', function() {
    console.log('[Userscript Content] Page unloading, cleaning execution references.');
  });
})();
