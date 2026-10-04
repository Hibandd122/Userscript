/**
 * Userscript Injector Engine & Lifecycle Scheduler 2.0
 * Includes: Crash Resilience & Recovery (Phase 18), Frame Awareness (Phase 26), Runtime Resource Monitor (Phase 23)
 */
(function() {
  'use strict';

  var executedScriptKeys = Object.create(null);
  var scriptRegistry = Object.create(null);

  // Script Failure & Recovery Counter (Phase 18: Script Recovery)
  var scriptFailureCounts = Object.create(null);
  var MAX_CONSECUTIVE_FAILURES = 5;

  function getExecutionKey(script, targetWin) {
    var win = targetWin || window;
    var locationStr = '';
    var isTop = false;
    try {
      locationStr = (win.location && win.location.href) || 'default_context';
      isTop = (win.self === win.top);
    } catch (e) {
      locationStr = 'cross_origin_frame';
      isTop = false;
    }
    return (script.id || script.name) + '_' + (isTop ? 'top' : 'sub') + '_' + locationStr;
  }

  function reportLifecycle(script, state, details, durationMs) {
    var id = script.id || script.name;
    scriptRegistry[id] = {
      name: script.name,
      version: script.version,
      state: state,
      timestamp: Date.now(),
      durationMs: durationMs || 0,
      details: details || null
    };

    var bridge = window.__US_Bridge;
    if (bridge && typeof bridge.request === 'function') {
      bridge.request('reportScriptStatus', {
        scriptId: script.id,
        scriptName: script.name,
        state: state,
        durationMs: durationMs || 0,
        details: details
      }, 3000).catch(function() {});
    }
  }

  function executeScript(script, targetWin) {
    var win = targetWin || window;
    var execKey = getExecutionKey(script, win);
    var scriptId = script.id || script.name;

    // Check duplicate execution
    if (executedScriptKeys[execKey]) {
      console.log('[Userscript Injector] Skipped duplicate injection for:', script.name);
      return false;
    }
    executedScriptKeys[execKey] = true;

    // Phase 18: Script Recovery Check
    if (scriptFailureCounts[scriptId] && scriptFailureCounts[scriptId] >= MAX_CONSECUTIVE_FAILURES) {
      console.warn('[Userscript Recovery] Script auto-disabled due to repeated failures (' + MAX_CONSECUTIVE_FAILURES + 'x):', script.name);
      reportLifecycle(script, 'CrashBlocked', 'Auto-disabled: Failed ' + MAX_CONSECUTIVE_FAILURES + ' consecutive times.');
      return false;
    }

    // Check @noframes directive (Phase 26)
    try {
      if (script.noframes && win.self !== win.top) {
        reportLifecycle(script, 'Blocked', 'Skipped inside subframe due to @noframes');
        return false;
      }
    } catch (e) {}

    reportLifecycle(script, 'Running');
    var startTime = Date.now();

    try {
      var gmContext = (typeof window.__US_CreateRuntimeContext === 'function')
        ? window.__US_CreateRuntimeContext(script)
        : {};

      var paramNames = Object.keys(gmContext);
      var paramValues = paramNames.map(function(k) { return gmContext[k]; });

      var rawCode = script.content || script.code || '';
      var wrapperCode =
        "(function(" + paramNames.join(", ") + ") {\n" +
        "  'use strict';\n" +
        "  try {\n" +
        rawCode + "\n" +
        "  } catch (userScriptError) {\n" +
        "    console.error('[Userscript Runtime Error] In script \"" + (script.name || 'Untitled') + "\":', userScriptError);\n" +
        "    throw userScriptError;\n" +
        "  }\n" +
        "})";

      var evaluator = new Function("return " + wrapperCode)();
      evaluator.apply(win, paramValues);

      var duration = Date.now() - startTime;
      // Reset failure count on success
      scriptFailureCounts[scriptId] = 0;

      // Classify performance rating (Phase 23: Fast < 15ms, Normal < 100ms, Heavy >= 100ms)
      var perfRating = duration < 15 ? 'Fast' : (duration < 100 ? 'Normal' : 'Heavy');

      reportLifecycle(script, 'Loaded', 'Performance: ' + perfRating + ' (' + duration + 'ms)', duration);
      console.log('[Userscript Injector] Executed ' + script.name + ' in ' + duration + 'ms [' + perfRating + ']');
      return true;
    } catch (err) {
      delete executedScriptKeys[execKey];
      var durationErr = Date.now() - startTime;
      scriptFailureCounts[scriptId] = (scriptFailureCounts[scriptId] || 0) + 1;

      reportLifecycle(script, 'Error', err.message || String(err), durationErr);
      console.error('[Userscript Injector] Error executing script ' + script.name + ' (Failure ' + scriptFailureCounts[scriptId] + '):', err);
      return false;
    }
  }

  function schedule(script, targetWin) {
    var win = targetWin || window;
    var doc = win.document;
    var runAt = (script.runAt || 'document-end').toLowerCase();

    function runner() {
      executeScript(script, win);
    }

    if (runAt === 'document-start') {
      runner();
    } else if (runAt === 'document-body') {
      if (doc.body) {
        runner();
      } else {
        var bodyObserver = new MutationObserver(function(mutations, obs) {
          if (doc.body) {
            obs.disconnect();
            runner();
          }
        });
        bodyObserver.observe(doc.documentElement || doc, { childList: true, subtree: true });
      }
    } else if (runAt === 'document-idle') {
      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(runner, { timeout: 2000 });
      } else {
        setTimeout(runner, 200);
      }
    } else {
      // document-end
      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', runner, { once: true });
      } else {
        runner();
      }
    }
  }

  window.__US_Injector = {
    execute: executeScript,
    schedule: schedule,
    getScriptState: function(id) { return scriptRegistry[id] || null; },
    getRegistry: function() { return scriptRegistry; },
    resetFailureCount: function(scriptId) {
      if (scriptId) delete scriptFailureCounts[scriptId];
      else scriptFailureCounts = Object.create(null);
    }
  };
})();
