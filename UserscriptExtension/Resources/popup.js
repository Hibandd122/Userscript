// 🍎 USERSCRIPT SAFARI EXTENSION POPUP CONTROLLER 2.0 (HIGH DENSITY & NATIVE UX)
document.addEventListener("DOMContentLoaded", function() {
  // Elements
  var domainEl = document.getElementById("current-domain");
  var siteToggle = document.getElementById("site-master-toggle");
  var listEl = document.getElementById("script-list");
  var sectionCountBadge = document.getElementById("section-script-count");

  // Status & Metrics
  var runtimeStatusPill = document.getElementById("runtime-status-pill");
  var runtimeStatusText = document.getElementById("runtime-status-text");
  var overviewBadge = document.getElementById("overview-state-badge");
  var metricTotalScripts = document.getElementById("metric-total-scripts");
  var metricActiveScripts = document.getElementById("metric-active-scripts");
  var metricErrorScripts = document.getElementById("metric-error-scripts");

  // Summary counts
  var statRunningCount = document.getElementById("stat-running-count");
  var statDisabledCount = document.getElementById("stat-disabled-count");
  var statErrorsCount = document.getElementById("stat-errors-count");

  // Banners
  var errorBanner = document.getElementById("error-banner");
  var errorBannerTitle = document.getElementById("error-banner-title");
  var errorBannerDesc = document.getElementById("error-banner-desc");
  var errorBannerAction = document.getElementById("error-banner-action");

  var updateBanner = document.getElementById("update-banner");
  var updateBannerText = document.getElementById("update-banner-text");
  var updateBannerBtn = document.getElementById("update-banner-btn");

  // Action Buttons
  var reloadBtn = document.getElementById("reload-tab-btn");
  var openAppBtn = document.getElementById("open-app-btn");
  var addScriptBtn = document.getElementById("add-script-btn");
  var quickInstallBtn = document.getElementById("quick-install-btn");
  var quickReloadScriptsBtn = document.getElementById("quick-reload-scripts-btn");
  var emergencyKillswitchBtn = document.getElementById("emergency-killswitch-btn");
  var killswitchText = document.getElementById("killswitch-text");

  // Action Sheet Modal
  var optionsSheet = document.getElementById("options-sheet");
  var sheetTitle = document.getElementById("sheet-script-title");
  var sheetSubtitle = document.getElementById("sheet-script-version");
  var sheetCloseBtn = document.getElementById("sheet-close-btn");
  var sheetPause5m = document.getElementById("sheet-action-pause-5m");
  var sheetPause1h = document.getElementById("sheet-action-pause-1h");
  var sheetResume = document.getElementById("sheet-action-resume");
  var sheetCopyName = document.getElementById("sheet-action-copy-name");

  var currentHost = "";
  var currentUrl = "";
  var activeScriptObj = null;

  // Navigation & External App Triggers
  if (openAppBtn) {
    openAppBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://", "_blank");
    });
  }

  if (addScriptBtn) {
    addScriptBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://install", "_blank");
    });
  }

  if (quickInstallBtn) {
    quickInstallBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://install", "_blank");
    });
  }

  // Reload current active tab
  if (reloadBtn) {
    reloadBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "reloadTab" });
      window.close();
    });
  }

  if (quickReloadScriptsBtn) {
    quickReloadScriptsBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "reloadTab" });
      window.close();
    });
  }

  // Global Killswitch Toggle
  if (emergencyKillswitchBtn) {
    emergencyKillswitchBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "toggleEmergencyDisable" }, function() {
        refreshView();
      });
    });
  }

  // Master Website Toggle
  if (siteToggle) {
    siteToggle.addEventListener("change", function() {
      if (!currentHost) return;
      var shouldAllow = siteToggle.checked;
      var ruleAction = shouldAllow ? "Allow" : "Block";

      chrome.runtime.sendMessage({
        action: "toggleDomainRule",
        payload: { domain: currentHost, ruleAction: ruleAction }
      }, function() {
        chrome.runtime.sendMessage({ action: "reloadTab" });
        setTimeout(function() {
          refreshView();
        }, 180);
      });
    });
  }

  // Action Sheet Controls
  function openActionSheet(script) {
    activeScriptObj = script;
    sheetTitle.textContent = script.name || "Script Options";
    sheetSubtitle.textContent = "v" + (script.version || "1.0.0") + (script.author ? " • by " + script.author : "");
    optionsSheet.classList.remove("hidden");
  }

  function closeActionSheet() {
    activeScriptObj = null;
    optionsSheet.classList.add("hidden");
  }

  if (sheetCloseBtn) sheetCloseBtn.addEventListener("click", closeActionSheet);
  if (optionsSheet) {
    optionsSheet.addEventListener("click", function(e) {
      if (e.target === optionsSheet) closeActionSheet();
    });
  }

  if (sheetPause5m) {
    sheetPause5m.addEventListener("click", function() {
      if (!activeScriptObj) return;
      var sId = activeScriptObj.id || activeScriptObj.name;
      chrome.runtime.sendMessage({
        action: "setTemporaryOverride",
        payload: { scriptId: sId, enable: false, durationMinutes: 5 }
      }, function() {
        closeActionSheet();
        refreshView();
        chrome.runtime.sendMessage({ action: "reloadTab" });
      });
    });
  }

  if (sheetPause1h) {
    sheetPause1h.addEventListener("click", function() {
      if (!activeScriptObj) return;
      var sId = activeScriptObj.id || activeScriptObj.name;
      chrome.runtime.sendMessage({
        action: "setTemporaryOverride",
        payload: { scriptId: sId, enable: false, durationMinutes: 60 }
      }, function() {
        closeActionSheet();
        refreshView();
        chrome.runtime.sendMessage({ action: "reloadTab" });
      });
    });
  }

  if (sheetResume) {
    sheetResume.addEventListener("click", function() {
      if (!activeScriptObj) return;
      var sId = activeScriptObj.id || activeScriptObj.name;
      chrome.runtime.sendMessage({
        action: "setTemporaryOverride",
        payload: { scriptId: sId, enable: true }
      }, function() {
        closeActionSheet();
        refreshView();
        chrome.runtime.sendMessage({ action: "reloadTab" });
      });
    });
  }

  if (sheetCopyName) {
    sheetCopyName.addEventListener("click", function() {
      if (activeScriptObj && activeScriptObj.name && navigator.clipboard) {
        navigator.clipboard.writeText(activeScriptObj.name);
        sheetCopyName.querySelector(".option-main").textContent = "Copied to Clipboard!";
        setTimeout(function() {
          closeActionSheet();
        }, 600);
      }
    });
  }

  // Main Render Routine
  function refreshView() {
    if (!chrome.tabs || !chrome.tabs.query) return;

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url) {
        domainEl.textContent = "Safari Tab";
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
          listEl.innerHTML = '<div class="empty-placeholder"><span class="empty-headline">Connecting...</span></div>';
          return;
        }

        // Global Killswitch State Check
        if (response.emergencyDisabled) {
          runtimeStatusPill.className = "runtime-pill disabled";
          runtimeStatusText.textContent = "Paused";
          overviewBadge.className = "badge-mini red";
          overviewBadge.textContent = "Killswitch";
          killswitchText.textContent = "Resume All";

          siteToggle.checked = false;
          siteToggle.disabled = true;

          metricTotalScripts.textContent = "Global stop";
          metricActiveScripts.textContent = "0 active";
          metricErrorScripts.textContent = "0 errors";

          statRunningCount.textContent = "0 Running";
          statDisabledCount.textContent = "All Suspended";
          statErrorsCount.textContent = "0 Errors";
          sectionCountBadge.textContent = "0";

          listEl.innerHTML = 
            '<div class="empty-placeholder">' +
              '<div class="empty-icon-circle" style="color:var(--apple-red);">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>' +
              '</div>' +
              '<span class="empty-headline">Killswitch Active</span>' +
              '<span class="empty-caption">All script execution is globally paused for Safari. Tap Resume to re-enable.</span>' +
            '</div>';
          return;
        } else {
          runtimeStatusPill.className = "runtime-pill active";
          runtimeStatusText.textContent = "Active";
          overviewBadge.className = "badge-mini green";
          overviewBadge.textContent = "Protected";
          killswitchText.textContent = "Killswitch";
          siteToggle.disabled = false;
        }

        var scripts = (response.payload && response.payload.scripts) || response.scripts || [];
        var tempOverrides = (response.payload && response.payload.temporaryOverrides) || response.temporaryOverrides || {};
        var domainRules = (response.payload && response.payload.domainRules) || response.domainRules || [];

        // Check Domain Block State
        var isSiteBlocked = domainRules.some(function(r) {
          return r.domain === currentHost && r.action === "Block";
        });
        siteToggle.checked = !isSiteBlocked;

        var runningList = [];
        var disabledList = [];
        var errorCount = 0;

        scripts.forEach(function(s) {
          var sId = s.id || s.name;
          var isPaused = tempOverrides[sId] === false;
          var isScriptEnabled = s.enabled !== false;
          var hasError = (s.lastError != null || (s.statistics && s.statistics.failureCount > 0));

          if (hasError) errorCount++;

          if (!isSiteBlocked && isScriptEnabled && !isPaused) {
            runningList.push(s);
          } else {
            disabledList.push(s);
          }
        });

        // Update Overview Card (Section 4)
        metricTotalScripts.textContent = scripts.length + " matching";
        metricActiveScripts.textContent = runningList.length + " active";
        metricErrorScripts.textContent = errorCount + " errors";

        // Update Summary Row (Section 13)
        statRunningCount.textContent = runningList.length + " Running";
        statDisabledCount.textContent = disabledList.length + " Disabled";
        statErrorsCount.textContent = errorCount + " Errors";

        sectionCountBadge.textContent = String(scripts.length);

        // Update Error Banner (Section 14)
        if (errorCount > 0) {
          errorBanner.classList.remove("hidden");
          errorBannerTitle.textContent = errorCount + (errorCount === 1 ? " Script Needs Attention" : " Scripts Need Attention");
          errorBannerDesc.textContent = "Runtime failure detected on this domain";
          errorBannerAction.onclick = function() {
            window.open("userscript://", "_blank");
          };
        } else {
          errorBanner.classList.add("hidden");
        }

        // Render Inset Grouped Scripts (Section 7, 8, 37)
        if (scripts.length === 0) {
          listEl.innerHTML = 
            '<div class="empty-placeholder">' +
              '<div class="empty-icon-circle">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
              '</div>' +
              '<span class="empty-headline">No Scripts Installed</span>' +
              '<span class="empty-caption">No userscripts match ' + currentHost + '</span>' +
            '</div>';
          return;
        }

        listEl.innerHTML = "";

        // Sort: Running scripts first, then disabled
        var sortedScripts = runningList.concat(disabledList);

        sortedScripts.forEach(function(s) {
          var sId = s.id || s.name;
          var isPaused = tempOverrides[sId] === false;
          var isScriptEnabled = s.enabled !== false;
          var isActive = !isSiteBlocked && isScriptEnabled && !isPaused;
          var hasError = (s.lastError != null || (s.statistics && s.statistics.failureCount > 0));

          var row = document.createElement("div");
          row.className = "script-row";

          // Monogram Avatar
          var avatar = document.createElement("div");
          avatar.className = "script-avatar";
          avatar.textContent = (s.name && s.name.trim().length > 0) ? s.name.trim().charAt(0).toUpperCase() : "U";

          // Script Content Info
          var contentCol = document.createElement("div");
          contentCol.className = "script-content-col";
          contentCol.addEventListener("click", function() {
            openActionSheet(s);
          });

          var label = document.createElement("div");
          label.className = "script-label-text";
          label.textContent = s.name || "Untitled Script";

          var sub = document.createElement("div");
          sub.className = "script-sub-text";

          var dotClass = isActive ? "green" : (isPaused ? "orange" : (hasError ? "red" : "gray"));
          var statusText = isActive ? "Running" : (isPaused ? "Paused" : (isSiteBlocked ? "Site Blocked" : "Disabled"));

          sub.innerHTML = 
            '<span>v' + (s.version || "1.0.0") + '</span>' +
            '<span>•</span>' +
            '<span class="status-dot-sub ' + dotClass + '">●</span>' +
            '<span>' + statusText + '</span>';

          contentCol.appendChild(label);
          contentCol.appendChild(sub);

          // Actions Column
          var actionCol = document.createElement("div");
          actionCol.className = "script-action-col";

          // Kebab Menu Button
          var moreBtn = document.createElement("button");
          moreBtn.className = "more-kebab-btn";
          moreBtn.title = "Script Options";
          moreBtn.innerHTML = 
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">' +
              '<circle cx="12" cy="12" r="2"></circle>' +
              '<circle cx="12" cy="5" r="2"></circle>' +
              '<circle cx="12" cy="19" r="2"></circle>' +
            '</svg>';
          moreBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            openActionSheet(s);
          });

          // Individual Script Apple Switch
          var switchLabel = document.createElement("label");
          switchLabel.className = "apple-switch";
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

          var slider = document.createElement("span");
          slider.className = "apple-slider";

          switchLabel.appendChild(switchInput);
          switchLabel.appendChild(slider);

          actionCol.appendChild(moreBtn);
          actionCol.appendChild(switchLabel);

          row.appendChild(avatar);
          row.appendChild(contentCol);
          row.appendChild(actionCol);

          listEl.appendChild(row);
        });
      });
    });
  }

  refreshView();
});
