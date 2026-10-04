// 🍎 Userscript Safari Extension: Native Controller (Stay Standard)
document.addEventListener("DOMContentLoaded", function() {
  var domainEl = document.getElementById("current-domain");
  var domainStatusEl = document.getElementById("domain-status");
  var siteToggle = document.getElementById("site-master-toggle");
  var listEl = document.getElementById("script-list");
  var matchBadgeEl = document.getElementById("match-badge");
  var emergencyBtn = document.getElementById("emergency-btn");
  var reloadBtn = document.getElementById("reload-tab-btn");
  var openAppBtn = document.getElementById("open-app-btn");
  var addScriptBtn = document.getElementById("add-script-btn");

  // Sheet Elements
  var sheetBackdrop = document.getElementById("options-sheet");
  var sheetTitle = document.getElementById("sheet-script-title");
  var sheetCloseBtn = document.getElementById("sheet-close-btn");
  var sheetPause5m = document.getElementById("sheet-pause-5m");
  var sheetPause1h = document.getElementById("sheet-pause-1h");
  var sheetResumeNow = document.getElementById("sheet-resume-now");

  var currentHost = "";
  var currentUrl = "";
  var activeScriptTargetId = null;

  // Open full app
  if (openAppBtn) {
    openAppBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://", "_blank");
    });
  }

  // Create new script
  if (addScriptBtn) {
    addScriptBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://install", "_blank");
    });
  }

  // Reload current tab
  if (reloadBtn) {
    reloadBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "reloadTab" });
      window.close();
    });
  }

  // Global Killswitch Toggle
  if (emergencyBtn) {
    emergencyBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "toggleEmergencyDisable" }, function() {
        refreshView();
      });
    });
  }

  // Master Website Toggle (One-tap allow/block for current domain)
  if (siteToggle) {
    siteToggle.addEventListener("change", function() {
      if (!currentHost) return;
      var shouldAllow = siteToggle.checked;
      var ruleAction = shouldAllow ? "Allow" : "Block";

      chrome.runtime.sendMessage({
        action: "toggleDomainRule",
        payload: { domain: currentHost, ruleAction: ruleAction }
      }, function() {
        domainStatusEl.textContent = shouldAllow ? "Scripts enabled on this site" : "Blocked on this site";
        chrome.runtime.sendMessage({ action: "reloadTab" });
        setTimeout(function() {
          refreshView();
        }, 200);
      });
    });
  }

  // Sheet Controls
  function openSheet(scriptId, scriptName) {
    activeScriptTargetId = scriptId;
    sheetTitle.textContent = scriptName || "Script Options";
    sheetBackdrop.classList.remove("hidden");
  }

  function closeSheet() {
    activeScriptTargetId = null;
    sheetBackdrop.classList.add("hidden");
  }

  if (sheetCloseBtn) sheetCloseBtn.addEventListener("click", closeSheet);
  if (sheetBackdrop) {
    sheetBackdrop.addEventListener("click", function(e) {
      if (e.target === sheetBackdrop) closeSheet();
    });
  }

  if (sheetPause5m) {
    sheetPause5m.addEventListener("click", function() {
      if (!activeScriptTargetId) return;
      chrome.runtime.sendMessage({
        action: "setTemporaryOverride",
        payload: { scriptId: activeScriptTargetId, enable: false, durationMinutes: 5 }
      }, function() {
        closeSheet();
        refreshView();
        chrome.runtime.sendMessage({ action: "reloadTab" });
      });
    });
  }

  if (sheetPause1h) {
    sheetPause1h.addEventListener("click", function() {
      if (!activeScriptTargetId) return;
      chrome.runtime.sendMessage({
        action: "setTemporaryOverride",
        payload: { scriptId: activeScriptTargetId, enable: false, durationMinutes: 60 }
      }, function() {
        closeSheet();
        refreshView();
        chrome.runtime.sendMessage({ action: "reloadTab" });
      });
    });
  }

  if (sheetResumeNow) {
    sheetResumeNow.addEventListener("click", function() {
      if (!activeScriptTargetId) return;
      chrome.runtime.sendMessage({
        action: "setTemporaryOverride",
        payload: { scriptId: activeScriptTargetId, enable: true }
      }, function() {
        closeSheet();
        refreshView();
        chrome.runtime.sendMessage({ action: "reloadTab" });
      });
    });
  }

  // Main Render View
  function refreshView() {
    if (!chrome.tabs || !chrome.tabs.query) return;

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url) {
        domainEl.textContent = "Safari Tab";
        domainStatusEl.textContent = "No website loaded";
        return;
      }

      currentUrl = tabs[0].url;
      try {
        var parsed = new URL(currentUrl);
        currentHost = parsed.hostname || currentUrl;
      } catch (e) {
        currentHost = currentUrl;
      }

      domainEl.textContent = currentHost;

      chrome.runtime.sendMessage({ action: "getMatchingScripts", url: currentUrl }, function(response) {
        if (!response) {
          listEl.innerHTML = '<div class="empty-box"><span class="empty-headline">Connecting...</span></div>';
          return;
        }

        // 1. Check Global Killswitch
        if (response.emergencyDisabled) {
          emergencyBtn.classList.add("killswitch-active");
          emergencyBtn.title = "Emergency Killswitch Active - Tap to Resume";
          domainStatusEl.textContent = "All scripts globally paused";
          siteToggle.checked = false;
          siteToggle.disabled = true;
          matchBadgeEl.textContent = "OFF";

          listEl.innerHTML = 
            '<div class="empty-box">' +
              '<div class="empty-icon-wrap" style="color:var(--apple-red);">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>' +
              '</div>' +
              '<span class="empty-headline">Killswitch Active</span>' +
              '<span class="empty-caption">Userscript is currently disabled across all websites.</span>' +
            '</div>';
          return;
        } else {
          emergencyBtn.classList.remove("killswitch-active");
          emergencyBtn.title = "Pause All Scripts";
          siteToggle.disabled = false;
        }

        var scripts = (response.payload && response.payload.scripts) || response.scripts || [];
        var tempOverrides = (response.payload && response.payload.temporaryOverrides) || response.temporaryOverrides || {};
        var domainRules = (response.payload && response.payload.domainRules) || response.domainRules || [];

        // 2. Check Domain Rule Block
        var isSiteBlocked = domainRules.some(function(r) {
          return r.domain === currentHost && r.action === "Block";
        });

        siteToggle.checked = !isSiteBlocked;
        domainStatusEl.textContent = isSiteBlocked 
          ? "Disabled on this website" 
          : (scripts.length > 0 ? (scripts.length + " scripts available") : "Ready for scripts");

        matchBadgeEl.textContent = String(scripts.length);

        // 3. Render Script Inset Grouped Rows
        if (scripts.length === 0) {
          listEl.innerHTML = 
            '<div class="empty-box">' +
              '<div class="empty-icon-wrap">' +
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
              '</div>' +
              '<span class="empty-headline">No Scripts Installed</span>' +
              '<span class="empty-caption">No userscripts currently match ' + currentHost + '</span>' +
            '</div>';
          return;
        }

        listEl.innerHTML = "";
        scripts.forEach(function(s) {
          var sId = s.id || s.name;
          var isTemporarilyPaused = tempOverrides[sId] === false;
          var isGloballyEnabled = (s.enabled !== false);
          var isActive = isGloballyEnabled && !isTemporarilyPaused && !isSiteBlocked;

          var row = document.createElement("div");
          row.className = "script-row";

          // Monogram Glyph (First letter or ⚡)
          var firstLetter = (s.name && s.name.trim().length > 0) ? s.name.trim().charAt(0).toUpperCase() : "U";
          var glyph = document.createElement("div");
          glyph.className = "script-glyph";
          glyph.textContent = firstLetter;

          // Meta Column
          var metaCol = document.createElement("div");
          metaCol.className = "script-meta-col";
          metaCol.addEventListener("click", function() {
            openSheet(sId, s.name);
          });

          var nameText = document.createElement("div");
          nameText.className = "script-name-text";
          nameText.textContent = s.name || "Untitled Script";

          var detailText = document.createElement("div");
          detailText.className = "script-detail-text";
          detailText.textContent = "v" + (s.version || "1.0.0") + (isTemporarilyPaused ? " • Paused" : (isActive ? " • Running" : " • Off"));

          metaCol.appendChild(nameText);
          metaCol.appendChild(detailText);

          // Controls Column
          var controlsCol = document.createElement("div");
          controlsCol.className = "script-controls-col";

          // Options Button
          var moreBtn = document.createElement("button");
          moreBtn.className = "more-opt-btn";
          moreBtn.title = "Script Options";
          moreBtn.innerHTML = 
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
              '<circle cx="12" cy="12" r="2"></circle>' +
              '<circle cx="12" cy="5" r="2"></circle>' +
              '<circle cx="12" cy="19" r="2"></circle>' +
            '</svg>';
          moreBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            openSheet(sId, s.name);
          });

          // iOS Switch Control
          var switchLabel = document.createElement("label");
          switchLabel.className = "switch-control";
          var switchInput = document.createElement("input");
          switchInput.type = "checkbox";
          switchInput.checked = isActive;

          switchInput.addEventListener("change", function(e) {
            e.stopPropagation();
            var targetEnable = switchInput.checked;
            chrome.runtime.sendMessage({
              action: "setTemporaryOverride",
              payload: { scriptId: sId, enable: targetEnable }
            }, function() {
              refreshView();
              chrome.runtime.sendMessage({ action: "reloadTab" });
            });
          });

          var switchTrack = document.createElement("span");
          switchTrack.className = "switch-track";

          switchLabel.appendChild(switchInput);
          switchLabel.appendChild(switchTrack);

          controlsCol.appendChild(moreBtn);
          controlsCol.appendChild(switchLabel);

          row.appendChild(glyph);
          row.appendChild(metaCol);
          row.appendChild(controlsCol);

          listEl.appendChild(row);
        });
      });
    });
  }

  refreshView();
});
