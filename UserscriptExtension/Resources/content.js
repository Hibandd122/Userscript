/**
 * Userscript Content Script for Safari
 */
(function() {
  'use strict';

  var currentUrl = window.location.href;

  function executeScript(script) {
    try {
      var gm = window.__US_CreateGM(script);
      
      // Build function parameter list
      var paramNames = Object.keys(gm);
      var paramValues = paramNames.map(function(k) { return gm[k]; });

      // Wrap code in closure
      var wrappedCode = 
        "(function(" + paramNames.join(", ") + ") {\n" +
        "  try {\n" +
        script.content + "\n" +
        "  } catch (err) {\n" +
        "    console.error('[Userscript Error in " + (script.name || 'script') + "]:', err);\n" +
        "  }\n" +
        "})";

      var fn = new Function("return " + wrappedCode)();
      fn.apply(window, paramValues);
      console.log("[Userscript] Successfully injected:", script.name);
    } catch (e) {
      console.error("[Userscript] Injection failure for", script.name, e);
    }
  }

  function scheduleScript(script) {
    var runAt = script.runAt || "document-end";

    if (runAt === "document-start") {
      executeScript(script);
    } else if (runAt === "document-idle") {
      if (document.readyState === "complete") {
        setTimeout(function() { executeScript(script); }, 1);
      } else {
        window.addEventListener("load", function() {
          setTimeout(function() { executeScript(script); }, 1);
        }, { once: true });
      }
    } else {
      // document-end or document-body
      if (document.readyState === "interactive" || document.readyState === "complete") {
        executeScript(script);
      } else {
        document.addEventListener("DOMContentLoaded", function() {
          executeScript(script);
        }, { once: true });
      }
    }
  }

  // Request scripts from background script
  chrome.runtime.sendMessage({ action: "getMatchingScripts", url: currentUrl }, function(response) {
    if (!response || !response.scripts) return;

    var matchedScripts = response.scripts;
    for (var i = 0; i < matchedScripts.length; i++) {
      scheduleScript(matchedScripts[i]);
    }
  });
})();
