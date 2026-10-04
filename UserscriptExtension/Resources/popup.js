document.addEventListener("DOMContentLoaded", function() {
  var urlEl = document.getElementById("current-url");
  var listEl = document.getElementById("script-list");
  var badgeEl = document.getElementById("badge");
  var openBtn = document.getElementById("open-app-btn");

  if (openBtn) {
    openBtn.addEventListener("click", function(e) {
      e.preventDefault();
      window.open("userscript://", "_blank");
    });
  }

  // Get active tab URL
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0] && tabs[0].url) {
        var currentUrl = tabs[0].url;
        urlEl.textContent = new URL(currentUrl).hostname || currentUrl;

        // Fetch matched scripts
        chrome.runtime.sendMessage({ action: "getMatchingScripts", url: currentUrl }, function(response) {
          var scripts = (response && response.payload && response.payload.scripts) || (response && response.scripts) || [];
          if (!scripts || scripts.length === 0) {
            listEl.innerHTML = '<div class="empty">No scripts active on this tab</div>';
            badgeEl.textContent = "0";
            return;
          }

          badgeEl.textContent = String(scripts.length);
          listEl.innerHTML = "";

          scripts.forEach(function(s) {
            var item = document.createElement("div");
            item.className = "script-item";
            item.innerHTML = 
              '<div class="script-info">' +
                '<span class="script-name">' + (s.name || "Untitled") + '</span>' +
                '<span class="script-version">v' + (s.version || "1.0.0") + (s.author ? ' • ' + s.author : '') + '</span>' +
              '</div>' +
              '<span style="font-size:12px;color:#34c759;font-weight:600;">ACTIVE</span>';
            listEl.appendChild(item);
          });
        });
      } else {
        urlEl.textContent = "Unknown Tab";
      }
    });
  }
});
