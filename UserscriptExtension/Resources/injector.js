/**
 * Userscript Injector Engine & Lifecycle Scheduler
 * Specification #2 & #5 & #21: Sandboxed execution, lifecycle states, duplicate injection protection, and error boundaries.
 */
(function() {
  'use strict';

  // Execution Registry to prevent duplicate injections in same frame (Phase 21)
  var executedScriptKeys = Object.create(null);

  // Script Runtime Registry
  var scriptRegistry = Object.create(null);

  function getExecutionKey(script, targetWin) {
    var win = targetWin || window;
    var locationStr = '';
    try {
      locationStr = (win.location && win.location.href) || 'default_context';
    } catch (e) {
      locationStr = 'cross_origin_frame';
    }
    return (script.id || script.name) + '_' + locationStr;
  }

  function reportLifecycle(script, state, details) {
    var id = script.id || script.name;
    scriptRegistry[id] = {
      name: script.name,
      version: script.version,
      state: state,
      timestamp: Date.now(),
      details: details || null
    };

    // Notify bridge
    var bridge = window.__US_Bridge;
    if (bridge && typeof bridge.request === 'function') {
      bridge.request('reportScriptStatus', {
        scriptId: script.id,
        scriptName: script.name,
        state: state,
        details: details
      }, 3000).catch(function() {});
    }
  }

  function executeScript(script, targetWin) {
    var win = targetWin || window;
    var execKey = getExecutionKey(script, win);

    if (executedScriptKeys[execKey]) {
      console.log('[Userscript Injector] Skipped duplicate injection for:', script.name);
      return false;
    }
    executedScriptKeys[execKey] = true;

    // Check @noframes directive
    try {
      if (script.noframes && win.self !== win.top) {
        reportLifecycle(script, 'Blocked', 'Skipped inside subframe due to @noframes');
        return false;
      }
    } catch (e) {
      // Subframe access error
    }

    reportLifecycle(script, 'Running');

    try {
      // Build isolated GM API context for this specific script
      var gmContext = (typeof window.__US_CreateRuntimeContext === 'function')
        ? window.__US_CreateRuntimeContext(script)
        : {};

      var paramNames = Object.keys(gmContext);
      var paramValues = paramNames.map(function(k) { return gmContext[k]; });

      // Wrap code in protected Function closure with try/catch Error Boundary (Phase 5)
      var wrapperCode =
        "(function(" + paramNames.join(", ") + ") {\n" +
        "  'use strict';\n" +
        "  try {\n" +
        (script.content || script.code || '') + "\n" +
        "  } catch (userScriptError) {\n" +
        "    console.error('[Userscript Runtime Error] In script \"" + (script.name || 'Untitled') + "\":', userScriptError);\n" +
        "    throw userScriptError;\n" +
        "  }\n" +
        "})";

      var evaluator = new Function("return " + wrapperCode)();
      evaluator.apply(win, paramValues);

      reportLifecycle(script, 'Loaded');
      console.log('[Userscript Injector] Executed successfully:', script.name);
      return true;
    } catch (err) {
      reportLifecycle(script, 'Error', err.message || String(err));
      console.error('[Userscript Injector] Error executing script ' + script.name + ':', err);
      return false;
    }
  }

  function schedule(script, targetWin) {
    var win = targetWin || window;
    var runAt = (script.runAt || 'document-end').toLowerCase();
    reportLifecycle(script, 'Waiting', 'Scheduled for ' + runAt);

    if (runAt === 'document-start') {
      return executeScript(script, win);
    } else if (runAt === 'document-idle') {
      if (document.readyState === 'complete') {
        if (win.requestIdleCallback) {
          win.requestIdleCallback(function() { executeScript(script, win); });
        } else {
          setTimeout(function() { executeScript(script, win); }, 1);
        }
      } else {
        win.addEventListener('load', function() {
          if (win.requestIdleCallback) {
            win.requestIdleCallback(function() { executeScript(script, win); });
          } else {
            setTimeout(function() { executeScript(script, win); }, 1);
          }
        }, { once: true });
      }
    } else {
      // document-end / document-body
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        return executeScript(script, win);
      } else {
        document.addEventListener('DOMContentLoaded', function() {
          executeScript(script, win);
        }, { once: true });
      }
    }
    return true;
  }

  function getScriptStatus(scriptId) {
    var entry = scriptRegistry[scriptId];
    return entry ? entry.state : 'Unknown';
  }

  window.__US_Injector = {
    schedule: schedule,
    executeScript: executeScript,
    getScriptStatus: getScriptStatus,
    getRegistry: function() { return scriptRegistry; }
  };
})();
