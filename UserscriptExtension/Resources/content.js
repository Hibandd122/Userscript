/**
 * Userscript Content Script Engine
 * Orchestrates URL matching, priority sorting, and scheduled script injection.
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

  // Request matching scripts for the current page
  bridge.request('getMatchingScripts', { url: currentUrl }, 10000)
    .then(function(response) {
      if (!response || !response.scripts || !Array.isArray(response.scripts)) {
        return;
      }

      var scripts = response.scripts;

      // 1. Filter enabled and strictly matched scripts
      var matchedScripts = [];
      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i];
        if (s.enabled !== false && matcher.test(currentUrl, s)) {
          matchedScripts.push(s);
        }
      }

      // 2. Sort by priority descending (Phase 22: Script Priority System)
      matchedScripts.sort(function(a, b) {
        var pA = a.priority !== undefined ? a.priority : 100;
        var pB = b.priority !== undefined ? b.priority : 100;
        return pB - pA;
      });

      console.log('[Userscript Content] Found ' + matchedScripts.length + ' matching script(s) for:', currentUrl);

      // 3. Schedule injection for each script
      for (var j = 0; j < matchedScripts.length; j++) {
        injector.schedule(matchedScripts[j]);
      }
    })
    .catch(function(err) {
      console.warn('[Userscript Content] Could not retrieve scripts:', err.message);
    });
})();
