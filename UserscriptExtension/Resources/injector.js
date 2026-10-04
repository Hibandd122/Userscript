/**
 * Userscript Runtime & Compatibility Engine 3.0
 * Injector, Execution Context, Dependency Manager (@require) & Sandboxing
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var executedScriptKeys = Object.create(null);
  var scriptRegistry = Object.create(null);
  var activeScriptContexts = Object.create(null); // scriptId -> { context, disposables }

  // Script Failure & Recovery Counter (5 consecutive crashes threshold)
  var scriptFailureCounts = Object.create(null);
  var MAX_CONSECUTIVE_FAILURES = 5;

  // In-memory Dependency Cache for @require (URL -> code string)
  var dependencyCache = Object.create(null);

  /**
   * Generates unique execution identity key
   */
  function getExecutionKey(script, targetWin) {
    var win = targetWin || window;
    var locationStr = '';
    var isTop = false;
    try {
      locationStr = (win.location && (win.location.pathname + win.location.search)) || 'default_context';
      isTop = (win.self === win.top);
    } catch (e) {
      locationStr = 'cross_origin_frame';
      isTop = false;
    }
    return (script.id || script.name) + '_' + (isTop ? 'top' : 'sub') + '_' + locationStr;
  }

  /**
   * Updates lifecycle state and notifies bridge
   */
  function reportLifecycle(script, state, details, durationMs) {
    var id = script.id || script.name;
    scriptRegistry[id] = {
      id: id,
      name: script.name,
      version: script.version || '1.0.0',
      state: state,
      timestamp: Date.now(),
      durationMs: durationMs || 0,
      details: details || null
    };

    var bridge = globalScope.__US_Bridge;
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

  /**
   * Resolves and fetches @require dependencies sequentially
   */
  function resolveDependencies(requires, onComplete, onError) {
    if (!requires || !Array.isArray(requires) || requires.length === 0) {
      onComplete([]);
      return;
    }

    var results = [];
    var index = 0;
    var visited = Object.create(null);

    function next() {
      if (index >= requires.length) {
        onComplete(results);
        return;
      }

      var depUrl = requires[index++];
      if (!depUrl || typeof depUrl !== 'string') {
        next();
        return;
      }

      // Detect circular or duplicate
      if (visited[depUrl]) {
        next();
        return;
      }
      visited[depUrl] = true;

      // Check cache first
      if (dependencyCache[depUrl]) {
        results.push(dependencyCache[depUrl]);
        next();
        return;
      }

      // Fetch dependency
      if (typeof fetch === 'function') {
        fetch(depUrl)
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' loading dependency: ' + depUrl);
            return res.text();
          })
          .then(function(code) {
            dependencyCache[depUrl] = code;
            results.push(code);
            next();
          })
          .catch(function(err) {
            onError(err, depUrl);
          });
      } else {
        // Mock / environment fallback
        var fallbackCode = "/* Dependency: " + depUrl + " */";
        dependencyCache[depUrl] = fallbackCode;
        results.push(fallbackCode);
        next();
      }
    }

    next();
  }

  /**
   * Global Error Boundary for Unhandled Promise Rejections originating from scripts
   */
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', function(event) {
      if (event && event.reason && event.reason._userscriptSource) {
        console.error('[Userscript Promise Boundary] Handled rejection from script ' + event.reason._userscriptSource + ':', event.reason);
        event.preventDefault();
      }
    });
  }

  /**
   * Executes userscript within an isolated execution sandbox
   */
  function executeScript(script, targetWin) {
    var win = targetWin || window;
    var execKey = getExecutionKey(script, win);
    var scriptId = script.id || script.name;

    // Check duplicate execution in current document context
    if (executedScriptKeys[execKey]) {
      console.log('[Userscript Injector] Skipped duplicate injection for:', script.name);
      return false;
    }
    executedScriptKeys[execKey] = true;

    // Check Script Recovery Threshold (5 consecutive crashes)
    if (scriptFailureCounts[scriptId] && scriptFailureCounts[scriptId] >= MAX_CONSECUTIVE_FAILURES) {
      console.warn('[Userscript Recovery] Script auto-disabled due to repeated failures (' + MAX_CONSECUTIVE_FAILURES + 'x):', script.name);
      reportLifecycle(script, 'CrashBlocked', 'Auto-disabled: Failed ' + MAX_CONSECUTIVE_FAILURES + ' consecutive times.');
      return false;
    }

    // Check @noframes directive
    try {
      if (script.noframes && win.self !== win.top) {
        reportLifecycle(script, 'Blocked', 'Skipped inside subframe due to @noframes');
        return false;
      }
    } catch (e) {}

    reportLifecycle(script, 'Running');
    var startTime = Date.now();

    try {
      // 1. Create sandboxed GM runtime context
      var gmContext = (typeof globalScope.__US_CreateRuntimeContext === 'function')
        ? globalScope.__US_CreateRuntimeContext(script)
        : {};

      activeScriptContexts[scriptId] = gmContext;

      // 2. Prepare parameter injection
      var paramNames = Object.keys(gmContext);
      var paramValues = paramNames.map(function(k) { return gmContext[k]; });

      // 3. Assemble code: prepend pre-bundled @require dependencies if any
      var dependencyCode = '';
      if (script._resolvedDependencies && Array.isArray(script._resolvedDependencies)) {
        dependencyCode = script._resolvedDependencies.join('\n;\n') + '\n;\n';
      }

      var rawCode = script.content || script.code || '';
      var wrapperCode =
        "(function(" + paramNames.join(", ") + ") {\n" +
        "  'use strict';\n" +
        "  try {\n" +
        dependencyCode +
        rawCode + "\n" +
        "  } catch (userScriptError) {\n" +
        "    try { userScriptError._userscriptSource = '" + (script.name || 'Untitled').replace(/'/g, "\\'") + "'; } catch(e){}\n" +
        "    console.error('[Userscript Runtime Error] In script \"" + (script.name || 'Untitled') + "\":', userScriptError);\n" +
        "    throw userScriptError;\n" +
        "  }\n" +
        "})";

      var evaluator = new Function("return " + wrapperCode)();
      evaluator.apply(win, paramValues);

      var duration = Date.now() - startTime;
      scriptFailureCounts[scriptId] = 0; // Reset crash count on success

      var perfRating = duration < 15 ? 'Fast' : (duration < 100 ? 'Normal' : 'Heavy');
      reportLifecycle(script, 'Loaded', 'Performance: ' + perfRating + ' (' + duration + 'ms)', duration);
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

  /**
   * Cleans up all resources created by a script during execution
   */
  function cleanupScript(scriptId) {
    if (activeScriptContexts[scriptId] && typeof activeScriptContexts[scriptId].__cleanup === 'function') {
      try {
        activeScriptContexts[scriptId].__cleanup();
      } catch (e) {
        console.warn('[Userscript Injector] Error cleaning up script ' + scriptId + ':', e);
      }
      delete activeScriptContexts[scriptId];
    }

    // Clear execution key from registry so it can re-run if needed
    for (var k in executedScriptKeys) {
      if (k.indexOf(scriptId + '_') === 0) {
        delete executedScriptKeys[k];
      }
    }
  }

  /**
   * Schedules script execution according to @run-at timing directive
   */
  function schedule(script, targetWin) {
    var win = targetWin || window;
    var doc = win.document;
    var runAt = (script.runAt || 'document-end').toLowerCase().replace(/_/g, '-');

    function executeWithDependencies() {
      var requires = script.requires || [];
      if (requires.length > 0 && !script._resolvedDependencies) {
        reportLifecycle(script, 'LoadingDependencies', 'Resolving ' + requires.length + ' @require(s)...');
        resolveDependencies(requires, function(deps) {
          script._resolvedDependencies = deps;
          executeScript(script, win);
        }, function(err, depUrl) {
          console.error('[Userscript Dependency Manager] Failed to load dependency ' + depUrl + ' for ' + script.name + ':', err);
          reportLifecycle(script, 'DependencyFailed', 'Failed to load: ' + depUrl);
        });
      } else {
        executeScript(script, win);
      }
    }

    if (runAt === 'document-start') {
      executeWithDependencies();
    } else if (runAt === 'document-idle') {
      if (doc.readyState === 'complete') {
        if (typeof win.requestIdleCallback === 'function') {
          win.requestIdleCallback(executeWithDependencies, { timeout: 1500 });
        } else {
          Promise.resolve().then(executeWithDependencies);
        }
      } else {
        win.addEventListener('load', function() {
          if (typeof win.requestIdleCallback === 'function') {
            win.requestIdleCallback(executeWithDependencies, { timeout: 1500 });
          } else {
            Promise.resolve().then(executeWithDependencies);
          }
        }, { once: true });
      }
    } else {
      // document-end (DOMContentLoaded or already interactive)
      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', executeWithDependencies, { once: true });
      } else {
        executeWithDependencies();
      }
    }
  }

  globalScope.__US_Injector = {
    execute: executeScript,
    schedule: schedule,
    cleanupScript: cleanupScript,
    cleanupAll: function() {
      for (var sId in activeScriptContexts) {
        cleanupScript(sId);
      }
      executedScriptKeys = Object.create(null);
    },
    getScriptState: function(id) { return scriptRegistry[id] || null; },
    getRegistry: function() { return scriptRegistry; },
    getDependencyCache: function() { return dependencyCache; },
    resetFailureCount: function(scriptId) {
      if (scriptId) delete scriptFailureCounts[scriptId];
      else scriptFailureCounts = Object.create(null);
    }
  };
})();
