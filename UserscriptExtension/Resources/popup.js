document.addEventListener("DOMContentLoaded", function() {
  var domainEl = document.getElementById("current-domain");
  var statsEl = document.getElementById("stats-summary");
  var listEl = document.getElementById("script-list");
  var badgeEl = document.getElementById("badge");
  var countTagEl = document.getElementById("script-count-label");
  var reloadBtn = document.getElementById("reload-tab-btn");
  var blockDomainBtn = document.getElementById("block-domain-btn");
  var emergencyBtn = document.getElementById("emergency-btn");
  var openBtn = document.getElementById("open-app-btn");

  var currentHost = "";
  var currentUrl = "";

  if (openBtn) {
    openBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://", "_blank");
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "reloadTab" });
      window.close();
    });
  }

  if (emergencyBtn) {
    emergencyBtn.addEventListener("click", function() {
      chrome.runtime.sendMessage({ action: "toggleEmergencyDisable" }, function(res) {
        refreshView();
      });
    });
  }

  if (blockDomainBtn) {
    blockDomainBtn.addEventListener("click", function() {
      if (!currentHost) return;
      var confirmBlock = confirm("Block all userscripts on " + currentHost + "?");
      if (confirmBlock) {
        chrome.runtime.sendMessage({ action: "toggleDomainRule", payload: { domain: currentHost, ruleAction: "Block" } }, function() {
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
              listEl.innerHTML = '<div class="empty">Unable to communicate with background</div>';
              return;
            }

            if (response.emergencyDisabled) {
              emergencyBtn.classList.add("active");
              emergencyBtn.textContent = "ON (DISABLED)";
              badgeEl.textContent = "OFF";
              badgeEl.style.backgroundColor = "#ff3b30";
              statsEl.textContent = "All scripts emergency disabled";
              listEl.innerHTML = '<div class="empty" style="color:#ff3b30;">Emergency Killswitch is Active.<br>No scripts are executing.</div>';
              countTagEl.textContent = "0";
              return;
            } else {
              emergencyBtn.classList.remove("active");
              emergencyBtn.textContent = "OFF";
              badgeEl.style.backgroundColor = "#007aff";
            }

            var scripts = (response.payload && response.payload.scripts) || response.scripts || [];
            var tempOverrides = (response.payload && response.payload.temporaryOverrides) || response.temporaryOverrides || {};

            badgeEl.textContent = String(scripts.length);
            countTagEl.textContent = String(scripts.length);
            statsEl.textContent = scripts.length + " matched • " + scripts.length + " running";

            if (scripts.length === 0) {
              listEl.innerHTML = '<div class="empty">No scripts active on this tab</div>';
              return;
            }

            listEl.innerHTML = "";
            scripts.forEach(function(s) {
              var sId = s.id || s.name;
              var isPaused = tempOverrides[sId] === false;

              var item = document.createElement("div");
              item.className = "script-item";

              var headerHtml = 
                '<div class="script-header">' +
                  '<div>' +
                    '<div class="script-name">' + (s.name || "Untitled") + '</div>' +
                    '<div class="script-version">v' + (s.version || "1.0.0") + (s.author ? ' • ' + s.author : '') + '</div>' +
                  '</div>' +
                  '<span class="status-pill ' + (isPaused ? 'paused' : 'active') + '">' +
                    (isPaused ? 'PAUSED' : 'ACTIVE') +
                  '</span>' +
                '</div>';

              var controlsHtml = 
                '<div class="script-controls">' +
                  '<button class="ctrl-btn temp-5m" data-id="' + sId + '">⏸ 5m</button>' +
                  '<button class="ctrl-btn temp-1h" data-id="' + sId + '">⏸ 1h</button>' +
                  (isPaused ? '<button class="ctrl-btn resume-btn" data-id="' + sId + '">▶ Resume</button>' : '') +
                '</div>';

              item.innerHTML = headerHtml + controlsHtml;
              listEl.appendChild(item);
            });

            // Bind temporary control buttons (Phase 4)
            var temp5mBtns = listEl.querySelectorAll(".temp-5m");
            temp5mBtns.forEach(function(btn) {
              btn.addEventListener("click", function() {
                var id = btn.getAttribute("data-id");
                chrome.runtime.sendMessage({ action: "setTemporaryOverride", payload: { scriptId: id, enable: false, durationMinutes: 5 } }, function() {
                  chrome.runtime.sendMessage({ action: "reloadTab" });
                  window.close();
                });
              });
            });

            var temp1hBtns = listEl.querySelectorAll(".temp-1h");
            temp1hBtns.forEach(function(btn) {
              btn.addEventListener("click", function() {
                var id = btn.getAttribute("data-id");
                chrome.runtime.sendMessage({ action: "setTemporaryOverride", payload: { scriptId: id, enable: false, durationMinutes: 60 } }, function() {
                  chrome.runtime.sendMessage({ action: "reloadTab" });
                  window.close();
                });
              });
            });

            var resumeBtns = listEl.querySelectorAll(".resume-btn");
            resumeBtns.forEach(function(btn) {
              btn.addEventListener("click", function() {
                var id = btn.getAttribute("data-id");
                chrome.runtime.sendMessage({ action: "setTemporaryOverride", payload: { scriptId: id, enable: true } }, function() {
                  chrome.runtime.sendMessage({ action: "reloadTab" });
                  window.close();
                });
              });
            });

          });
        } else {
          domainEl.textContent = "Unknown Tab";
        }
      });
    }
  }

  refreshView();
});
