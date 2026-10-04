// 🍎 Safari Userscript Extension Popup Controller 2.0 (Section 20, 21)
document.addEventListener("DOMContentLoaded", function() {
  var domainEl = document.getElementById("current-domain");
  var statsEl = document.getElementById("stats-summary");
  var listEl = document.getElementById("script-list");
  var badgeEl = document.getElementById("badge");
  var countTagEl = document.getElementById("script-count-label");
  var reloadBtn = document.getElementById("reload-tab-btn");
  var blockDomainBtn = document.getElementById("block-domain-btn");
  var blockBtnText = document.getElementById("block-btn-text");
  var emergencyBtn = document.getElementById("emergency-btn");
  var emergencyLabel = document.getElementById("emergency-label");
  var openBtn = document.getElementById("open-app-btn");

  var currentHost = "";
  var currentUrl = "";
  var isSiteBlocked = false;

  // Open native app
  if (openBtn) {
    openBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://", "_blank");
    });
  }

  // Reload current active tab
  if (reloadBtn) {
    reloadBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "reloadTab" });
      window.close();
    });
  }

  // Emergency Global Killswitch
  if (emergencyBtn) {
    emergencyBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "toggleEmergencyDisable" }, function() {
        refreshView();
      });
    });
  }

  // Block / Unblock domain toggle
  if (blockDomainBtn) {
    blockDomainBtn.addEventListener("click", function() {
      if (!currentHost) return;
      var newAction = isSiteBlocked ? "Allow" : "Block";
      var promptMsg = isSiteBlocked 
        ? "Re-enable userscripts for " + currentHost + "?" 
        : "Disable all userscripts on " + currentHost + "?";
      
      if (confirm(promptMsg)) {
        chrome.runtime.sendMessage({ 
          action: "toggleDomainRule", 
          payload: { domain: currentHost, ruleAction: newAction } 
        }, function() {
          chrome.runtime.sendMessage({ action: "reloadTab" });
          window.close();
        });
      }
    });
  }

  function refreshView() {
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0] && tabs[0].url) {
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
              listEl.innerHTML = '<div class="empty-state"><p>Connecting to Safari extension runtime...</p></div>';
              return;
            }

            // Check Emergency Killswitch State
            if (response.emergencyDisabled) {
              emergencyBtn.classList.add("active");
              emergencyLabel.textContent = "STOPPED";
              badgeEl.textContent = "OFF";
              badgeEl.style.background = "var(--error)";
              statsEl.textContent = "Emergency Killswitch active";
              listEl.innerHTML = '<div class="empty-state"><p style="color:var(--error); font-weight:600;">Global Killswitch Active<br>All script execution is disabled.</p></div>';
              countTagEl.textContent = "0 Active";
              return;
            } else {
              emergencyBtn.classList.remove("active");
              emergencyLabel.textContent = "Killswitch";
              badgeEl.style.background = "var(--accent)";
            }

            var scripts = (response.payload && response.payload.scripts) || response.scripts || [];
            var tempOverrides = (response.payload && response.payload.temporaryOverrides) || response.temporaryOverrides || {};
            var domainRules = (response.payload && response.payload.domainRules) || response.domainRules || [];

            // Check if current host is explicitly blocked
            isSiteBlocked = domainRules.some(function(r) {
              return r.domain === currentHost && r.action === "Block";
            });

            if (blockBtnText) {
              blockBtnText.textContent = isSiteBlocked ? "Allow on Site" : "Disable on Site";
              if (isSiteBlocked) {
                blockDomainBtn.classList.remove("danger");
              } else {
                blockDomainBtn.classList.add("danger");
              }
            }

            var runningCount = scripts.filter(function(s) {
              var sId = s.id || s.name;
              return tempOverrides[sId] !== false;
            }).length;

            badgeEl.textContent = String(runningCount);
            countTagEl.textContent = runningCount + " of " + scripts.length + " Active";
            statsEl.textContent = scripts.length + " matched • " + runningCount + " running";

            if (scripts.length === 0) {
              listEl.innerHTML = '<div class="empty-state"><p>No scripts matched this website</p></div>';
              return;
            }

            listEl.innerHTML = "";
            scripts.forEach(function(s) {
              var sId = s.id || s.name;
              var isPaused = tempOverrides[sId] === false;

              var card = document.createElement("div");
              card.className = "script-card";

              var mainRow = document.createElement("div");
              mainRow.className = "script-main";

              var infoCol = document.createElement("div");
              infoCol.className = "script-info";

              var title = document.createElement("div");
              title.className = "script-title";
              title.textContent = s.name || "Untitled Script";

              var meta = document.createElement("div");
              meta.className = "script-meta";
              meta.textContent = "v" + (s.version || "1.0.0") + (s.author ? " • " + s.author : "");

              infoCol.appendChild(title);
              infoCol.appendChild(meta);

              // iOS Switch Toggle
              var toggleLabel = document.createElement("label");
              toggleLabel.className = "ios-toggle";
              var toggleInput = document.createElement("input");
              toggleInput.type = "checkbox";
              toggleInput.checked = !isPaused;
              var toggleSlider = document.createElement("span");
              toggleSlider.className = "toggle-slider";

              toggleInput.addEventListener("change", function() {
                var enable = toggleInput.checked;
                chrome.runtime.sendMessage({ 
                  action: "setTemporaryOverride", 
                  payload: { scriptId: sId, enable: enable } 
                }, function() {
                  refreshView();
                });
              });

              toggleLabel.appendChild(toggleInput);
              toggleLabel.appendChild(toggleSlider);

              mainRow.appendChild(infoCol);
              mainRow.appendChild(toggleLabel);
              card.appendChild(mainRow);

              // Quick control micro-actions
              var subActions = document.createElement("div");
              subActions.className = "script-subactions";

              if (isPaused) {
                var resumeBtn = document.createElement("button");
                resumeBtn.className = "quick-ctrl-btn resume";
                resumeBtn.textContent = "▶ Resume";
                resumeBtn.addEventListener("click", function() {
                  chrome.runtime.sendMessage({ 
                    action: "setTemporaryOverride", 
                    payload: { scriptId: sId, enable: true } 
                  }, function() {
                    refreshView();
                  });
                });
                subActions.appendChild(resumeBtn);
              } else {
                var btn5m = document.createElement("button");
                btn5m.className = "quick-ctrl-btn";
                btn5m.textContent = "⏸ 5m";
                btn5m.addEventListener("click", function() {
                  chrome.runtime.sendMessage({ 
                    action: "setTemporaryOverride", 
                    payload: { scriptId: sId, enable: false, durationMinutes: 5 } 
                  }, function() {
                    refreshView();
                  });
                });

                var btn1h = document.createElement("button");
                btn1h.className = "quick-ctrl-btn";
                btn1h.textContent = "⏸ 1h";
                btn1h.addEventListener("click", function() {
                  chrome.runtime.sendMessage({ 
                    action: "setTemporaryOverride", 
                    payload: { scriptId: sId, enable: false, durationMinutes: 60 } 
                  }, function() {
                    refreshView();
                  });
                });

                subActions.appendChild(btn5m);
                subActions.appendChild(btn1h);
              }

              card.appendChild(subActions);
              listEl.appendChild(card);
            });
          });
        } else {
          domainEl.textContent = "Safari Tab";
        }
      });
    }
  }

  refreshView();
});
