// ==UserScript==
// @name         Manga Universal Pro (Offline Bundle)
// @namespace    https://github.com/mangadex
// @version      3.0.0
// @description  Chặn sạch 100% quảng cáo, popunder, nhảy tab, vượt Anti-Adblock và tự động chuyển chương tiếp theo
// @author       Manga Pro Team
// @match        *://*.mangadex.org/*
// @match        *://*.cuutruyen.net/*
// @match        *://*.truyenqq*.*/*
// @match        *://*.tvtruyen.*/*
// @match        *://*.nettruyen*.*/*
// @match        *://*.blogtruyen*.*/*
// @match        *://*.nhentai.net/*
// @match        *://*.nhentai.xxx/*
// @match        *://*.nhentai.to/*
// @match        *://*.hentaiz.*/*
// @match        *://hentaiz.*/*
// @match        *://*.rule34.xxx/*
// @match        *://rule34.xxx/*
// @match        *://*.rule34video.com/*
// @match        *://rule34video.com/*
// @match        *://*/*chapter*
// @match        *://*/*truyen*
// @match        *://*/*manga*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

// ==================== cosmetic.js ====================
// Manga Universal Pro - Cosmetic CSS Injector
(function () {
  'use strict';

  const css = `/* Manga Universal Pro - Multi-Site Cosmetic AdBlocker */

/* 1. MangaDex Specific */
iframe[src*="e-embed.mangadex.org"],
iframe[src*="/embed/external/ads.html"],
video[src*="/temp/"],
img[src*="/temp/"],
a[href*="/advertise"],
a[href*="anime-gifs.com"],
a[href*="amazon.com?utm_source=md"],
a[href="/support-us"],
div:has(> video[src*="/temp/"]) {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  pointer-events: none !important;
}

/* 2. TruyenQQ & NetTruyen Specific */
iframe[src*="bundleunum"],
iframe[src*="traffictop"],
iframe[src*="adservice"],
iframe[src*="doubleclick"],
#image_popup,
#image_popup_mobile,
.image_popup,
#ads_mobile,
.ads_close_mobile,
#left-banner,
#right-banner,
#top-banner,
#bottom-banner,
#bottom_banner,
.ads_close,
.productafs,
.product-grid,
.product-item,
div:has(> .product-grid),
div:has(> .productafs),
a[href*="shopee.vn"],
a[href*="lazada.vn"],
.ads-holder,
.banner-holder,
.bottom-ads,
#floating-ad,
.middle-ads,
.ad_fixed,
.ad-container,
.box_ads,
.box-ads,
.banner-desktop,
.banner-mobile,
div[id^="ads"],
div[id*="ad_banner"],
div[id^="preload_ads"],
div[id^="preload_banner"],
div[style*="z-index: 2147483647"],
div[style*="z-index: 999999"]:not(#md-autonext-widget):not(#md-autonext-flash) {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  pointer-events: none !important;
}

/* 3. CuuTruyen Specific */
div[class*="sponsor"]:not([class*="manga"]):not([class*="chapter"]),
a[href*="affiliate"] {
  display: none !important;
}

/* 4. nHentai Specific */
iframe[src*="exoclick"],
iframe[src*="juicyads"],
iframe[src*="ero-advertising"],
iframe[src*="trafficjunky"],
iframe[src*="tsyndicate"],
iframe[src*="chaturbate"],
#ad-banner,
.ad-banner,
.advertisement,
#chaturbate-ad,
.banner-holder,
div[id^="ad_"],
div[class^="ad-"] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  pointer-events: none !important;
}

/* 5. Bảo vệ tuyệt đối Video Player trên HentaiZ & Rule34 */
iframe[src*="haiten.org"],
iframe[allow*="fullscreen"],
div:has(> iframe[src*="haiten.org"]),
#kt_player,
.kt-player,
video.fp-engine,
#image,
#gelcomVideoPlayer {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* 6. Rule34 Specific Ads */
.sidebar_ad_buttons,
.panel_header--promo,
iframe[src*="trialhd"],
iframe[src*="sadbaguette"],
iframe[src*="poweredby.jads.co"],
iframe[src*="chilihandshakewing"] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  pointer-events: none !important;
}

/* 7. Triệt tiêu bảng thông báo Anti-Adblock (TruyenQQ & NetTruyen) */
#reader-notice,
.reader-notice,
.modal-adblock,
div[class*="adblock-notice"] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  height: 0 !important;
  width: 0 !important;
}

body.reader-locked {
  overflow: auto !important;
  position: static !important;
  height: auto !important;
}

/* 8. Fix manga image spacing and prevent layout shifts */
.page-chapter,
.story-see-content,
.chapter_content {
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
}
`;

  function injectCSS() {
    if (document.getElementById('manga-pro-cosmetic-css')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'manga-pro-cosmetic-css';
    styleEl.textContent = css;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  if (document.head || document.documentElement) {
    injectCSS();
  } else {
    document.addEventListener('DOMContentLoaded', injectCSS);
  }
})();


// ==================== inject.js ====================
// Universal Runtime JS Injected Hook (Runs in page context: MAIN world)
// Defeats Anti-AdBlock Traps, Intercepts Bait Scripts, Prevents Image Hijacking & Blocks Rogue Ads

(function () {
  'use strict';

  // =========================================================================
  // 1. Vô hiệu hóa bẫy Anti-AdBlock (Bait Scripts: adsbygoogle, prebid, etc.)
  // =========================================================================
  // Tạo giả đối tượng adsbygoogle để qua mặt các đoạn code kiểm tra
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.push = function () { return true; };
  window.adsbygoogle.loaded = true;

  // Intercept document.createElement('script')
  // Khi trang cố tình nạp script quảng cáo mồi (như TruyenQQ chapter2.js line 1) để check xem có bị chặn mạng không:
  // Ta giả lập tải thành công (onload) để script của trang tưởng quảng cáo đã chạy bình thường!
  const origCreateElement = document.createElement;
  document.createElement = function (tagName, options) {
    const el = origCreateElement.call(document, tagName, options);
    if (typeof tagName === 'string' && tagName.toLowerCase() === 'script') {
      const origSetAttribute = el.setAttribute;
      const checkBait = (src) => {
        if (typeof src === 'string' && (
          src.includes('pagead2.googlesyndication.com') ||
          src.includes('adsbygoogle') ||
          src.includes('prebid') ||
          src.includes('googletagservices')
        )) {
          setTimeout(() => {
            if (typeof el.onload === 'function') {
              try { el.onload(); } catch (e) {}
            }
            try {
              el.dispatchEvent(new Event('load'));
            } catch (e) {}
          }, 15);
        }
      };

      el.setAttribute = function (name, value) {
        if (name && name.toLowerCase() === 'src') checkBait(value);
        return origSetAttribute.apply(this, arguments);
      };

      let _src = '';
      try {
        Object.defineProperty(el, 'src', {
          get() { return _src; },
          set(val) {
            _src = val;
            checkBait(val);
          },
          configurable: true
        });
      } catch (e) {}
    }
    return el;
  };

  // =========================================================================
  // 2. Chống bẫy popup / popunder mở tab ngầm (TruyenQQ, NetTruyen, nHentai)
  // =========================================================================
  const origOpen = window.open;
  window.open = function (url, target, features) {
    if (typeof url === 'string') {
      const suspicious = [
        'bundleunum', 'adservice', 'doubleclick', 'onclick', 'popunder',
        'affiliate', 'game', 'bet', 'casino', 'redirect', 'click', 'syndication',
        'popcash', 'exoclick', 'juicyads', 'trafficjunky'
      ];
      if (suspicious.some(term => url.toLowerCase().includes(term))) {
        console.info('[Manga Pro] Blocked popup window.open:', url);
        return null;
      }
    }
    return origOpen.apply(this, arguments);
  };

  // =========================================================================
  // 3. Vô hiệu hóa Google Tag Manager / Analytics / Trackers
  // =========================================================================
  window.dataLayer = [];
  window.gtag = function () {};

  // =========================================================================
  // 4. MangaDex: Chặn fallback quảng cáo tự kích hoạt qua postMessage
  // =========================================================================
  const origAddEventListener = window.addEventListener;
  window.addEventListener = function (type, listener, options) {
    if (type === 'message' && typeof listener === 'function') {
      const wrappedListener = function (event) {
        if (typeof event.data === 'string' && (
          event.data.startsWith('ads-loaded') ||
          event.data.startsWith('fallback-loaded') ||
          event.data.startsWith('render-ad-fallback:')
        )) {
          return;
        }
        return listener.apply(this, arguments);
      };
      return origAddEventListener.call(this, type, wrappedListener, options);
    }
    return origAddEventListener.call(this, type, listener, options);
  };

  // =========================================================================
  // 5. Chặn TruyenQQ tự động biến ảnh lỗi thành placeholder xám
  // =========================================================================
  // TruyenQQ script #12 đăng ký: img.src = '/images/image-placeholder.webp'
  // Ta chặn trước ở capture phase, bảo toàn URL gốc để Engine tự khôi phục
  origAddEventListener.call(window, 'error', function (e) {
    if (e.target && e.target.tagName === 'IMG') {
      const img = e.target;
      const isMangaImg = img.closest('.reading-content, .reading-detail, #image-container, .chapter_content');
      if (isMangaImg) {
        if (!img.dataset.mangaOriginalSrc && img.src && !img.src.includes('placeholder')) {
          img.dataset.mangaOriginalSrc = img.src;
        }
        // Dừng sự kiện truyền xuống TruyenQQ
        e.stopImmediatePropagation();
      }
    }
  }, true);

  // =========================================================================
  // 6. Tự động triệt hạ modal Anti-AdBlock & Mở khóa cuộn trang (Body lock)
  // =========================================================================
  function unlockReader() {
    const notice = document.getElementById('reader-notice');
    if (notice) notice.remove();

    if (document.body && document.body.classList.contains('reader-locked')) {
      document.body.classList.remove('reader-locked');
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
    }
  }

  const observer = new MutationObserver(unlockReader);
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  }

  // =========================================================================
  // 7. Chặn Fetch & XMLHttpRequest tới máy chủ quảng cáo (Network-level in Userscript)
  // =========================================================================
  const BLOCKED_DOMAINS = [
    'e-embed.mangadex.org', '/embed/external/ads.html', '/temp/',
    'bundleunum.com', 'traffictop.net', 'syndication.exdynsrv.com',
    'exoclick.com', 'juicyads.com', 'trafficjunky.com', 'popads.net',
    'popcash.net', 'adsco.re', 'histats.com', 'mgid.com',
    'trialhd.com', 'sadbaguette.com', 'chilihandshakewing.com',
    'poweredby.jads.co', 'janitorprecisiontrio.com', 'frozenpayerpregnant.com',
    'clammyendearedkeg.com', 'guidepaparazzisurface.com', 'acquiredeceasedundress.com',
    'darnobedienceupscale.com', '/api/_/popunder', 'tsyndicate.com',
    'ero-advertising.com', 'theporndude.com'
  ];

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const u = url.toLowerCase();
    if (BLOCKED_DOMAINS.some(d => u.includes(d))) {
      return Promise.reject(new Error('[Manga Pro] Blocked ad fetch: ' + u));
    }
    return origFetch.apply(this, arguments);
  };

  const origOpenXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === 'string') {
      const u = url.toLowerCase();
      if (BLOCKED_DOMAINS.some(d => u.includes(d))) {
        this.send = function () {};
        return;
      }
    }
    return origOpenXHR.apply(this, arguments);
  };

  console.info('[Manga Pro] Universal Runtime JS Hooked & Anti-Adblock Defeated (Userscript Mode)');
})();


// ==================== ad_heuristic.js ====================
// Manga Universal Pro - Heuristic & Behavioral Ad Detection Engine
// Catches ads by behavior, link targets, third-party origins, and floating overlays
// Future-proof: Immune to CSS class renaming and domain rotation

window.MangaAdHeuristic = (function () {
  'use strict';

  // 1. Danh sách từ khóa nhà cái / cờ bạc / cá cược / link affiliate phổ biến trên web truyện VN
  const BETTING_AND_AFF_PATTERNS = [
    /88bet/i, /kubet/i, /w88/i, /fb88/i, /fun88/i, /jun88/i, /hi88/i, /789bet/i,
    /okvip/i, /new88/i, /bk8/i, /ta88/i, /f8bet/i, /ee88/i, /sv388/i, /go88/i,
    /sunwin/i, /iwin/i, /rikvip/i, /shopee\.vn.*aff/i, /lazada\.vn.*aff/i,
    /gamebaidoithuong/i, /nhacai/i, /nha-cai/i, /soi-keo/i, /link-vao/i,
    /affiliate/i, /track\.(php|aspx)/i, /click\.(php|aspx)/i, /redirect\.(php|aspx)/i
  ];

  // 2. Danh sách dịch vụ bên thứ 3 hợp lệ cần giữ lại (không xóa nhầm)
  const SAFE_EMBEDS = [
    'youtube.com', 'youtu.be', 'disqus.com', 'facebook.com/plugins',
    'giscus.app', 'recaptcha', 'cloudflare.com/cdn-cgi/challenge-platform',
    'turnstile', 'haiten.org', 'x.haiten.org', 'storage.haiten.org'
  ];

  // Kiểm tra iframe có phải là trình phát video / media hợp lệ không
  function isMediaIframe(ifr) {
    if (!ifr) return false;
    const src = (ifr.getAttribute('src') || '').toLowerCase();
    if (SAFE_EMBEDS.some(safe => src.includes(safe))) return true;

    // Các iframe video player luôn có thuộc tính allowfullscreen hoặc allow="...fullscreen..."
    const allow = (ifr.getAttribute('allow') || '').toLowerCase();
    if (allow.includes('fullscreen') || allow.includes('picture-in-picture') || ifr.hasAttribute('allowfullscreen')) {
      return true;
    }

    // Nằm trong khung phát video của trang (aspect-video, player, video-container)
    if (ifr.closest('[class*="aspect-video"], [class*="player"], #player, .video-container, .player-container')) {
      return true;
    }

    return false;
  }

  // Kiểm tra link có phải quảng cáo/nhà cái không
  function isAdLink(href) {
    if (!href || typeof href !== 'string') return false;
    // Bỏ qua link nội bộ hoặc neo
    if (href.startsWith('#') || href.startsWith('javascript:')) return false;
    
    return BETTING_AND_AFF_PATTERNS.some(rx => rx.test(href));
  }

  // Quét và thanh trừng theo hành vi
  function sweep() {
    const currentHost = window.location.hostname.toLowerCase();

    // A. Quét tất cả thẻ <a> có đích đến là cờ bạc / affiliate / link bẩn
    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (isAdLink(href)) {
        // Tìm thẻ bọc quảng cáo (container) để xóa gọn gàng, tránh để lại khoảng trắng
        const container = a.closest('div.banner, div[class*="ad"], div[class*="sponsor"], li, p') || a;
        container.remove();
      }
    }

    // B. Quét IFRAME bên thứ 3 (Bảo vệ tuyệt đối trình phát phim / YouTube / Haiten)
    const iframes = document.querySelectorAll('iframe[src]');
    for (const ifr of iframes) {
      // Nếu là trình phát video ➔ Bỏ qua không bao giờ xóa
      if (isMediaIframe(ifr)) continue;

      const src = ifr.getAttribute('src') || '';
      if (!src) continue;

      try {
        const url = new URL(src, window.location.href);
        // Nếu iframe trỏ sang domain khác hoàn toàn ➔ là iframe quảng cáo
        if (url.hostname && !url.hostname.includes(currentHost) && !currentHost.includes(url.hostname)) {
          const parent = ifr.parentElement;
          ifr.remove();
          if (parent && parent.children.length === 0 && parent !== document.body && !parent.closest('[class*="aspect-video"]')) {
            parent.remove();
          }
        }
      } catch (e) {}
    }

    // C. Quét các banner treo lơ lửng (Fixed / Sticky Overlays ở 2 bên mép hoặc đáy màn hình)
    const fixedElements = document.querySelectorAll('div[style*="fixed"], div[style*="sticky"], aside[style*="fixed"]');
    for (const el of fixedElements) {
      if (el.id === 'md-turbo-widget' || el.closest('#md-turbo-widget')) continue;
      
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex, 10);
      
      // Nếu có z-index cực cao hoặc chứa thẻ a/img ra ngoài
      if (zIndex >= 999 || style.position === 'fixed') {
        const hasAdContent = el.querySelector('iframe, video, a[href*="http"], img');
        const isReader = el.querySelector('.reading-content, #image-container, .reading-detail, nav, header');
        
        // Nếu chứa ảnh/iframe nhưng không phải thanh điều hướng trang web hay nội dung truyện
        if (hasAdContent && !isReader) {
          const textLength = el.textContent.trim().length;
          // Các banner treo thường chỉ có ảnh và rất ít chữ
          if (textLength < 30) {
            el.remove();
          }
        }
      }
    }

    // D. Dọn dẹp khoảng trống rỗng do quảng cáo bị chặn để lại
    const emptyPlaceholders = document.querySelectorAll('.ads-holder, .banner-holder, [id^="ad-"], [class*="advertisement"]');
    for (const p of emptyPlaceholders) {
      if (p.children.length === 0 || p.innerHTML.trim() === '') {
        p.style.display = 'none';
        p.style.height = '0';
        p.style.margin = '0';
        p.style.padding = '0';
      }
    }
  }

  // Khởi động MutationObserver để tự động dọn sạch khi trang chèn thêm quảng cáo động
  function init() {
    sweep();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sweep);
    }

    let timer = null;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        sweep();
        timer = null;
      }, 500); // Throttling 500ms để 0% tốn CPU
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  return {
    init: init,
    sweep: sweep
  };
})();


// ==================== generic.js ====================
// Universal Fallback Adapter for Any Manga Website
// Detects common manga reader buttons, pagination, and generic ads

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['generic'] = {
  name: 'Universal Manga Reader',

  match: function () {
    return true; // Fallback
  },

  isReader: function () {
    const path = window.location.pathname.toLowerCase();
    return path.includes('chapter') || path.includes('doc-truyen') || path.includes('read') || path.includes('chuong');
  },

  adSelectors: [
    'iframe[src*="ad"]',
    'iframe[src*="banner"]',
    'div[class*="ad-container"]',
    'div[id*="ad-slot"]',
    'div[class*="sponsor"]'
  ],

  nextChapterSelectors: [
    'a.next',
    'a.btn-next',
    'a[rel="next"]',
    'button.next',
    '[aria-label*="Next" i]',
    '[title*="Next" i]'
  ],

  purgeAds: function () {
    for (const sel of this.adSelectors) {
      document.querySelectorAll(sel).forEach(el => el.remove());
    }
  }
};


// ==================== mangadex.js ====================
// Adapter: MangaDex (mangadex.org)
// Specific ad targets, Vue router hooks, and chapter reader selectors

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['mangadex.org'] = {
  name: 'MangaDex',
  
  match: function () {
    return window.location.hostname.includes('mangadex.org');
  },

  isReader: function () {
    return window.location.pathname.startsWith('/chapter/');
  },

  adSelectors: [
    'iframe[src*="e-embed.mangadex.org"]',
    'iframe[src*="ads.html"]',
    'video[src*="/temp/"]',
    'img[src*="/temp/"]',
    'a[href*="/advertise"]',
    'a[href*="anime-gifs.com"]',
    'a[href*="amazon.com?utm_source=md"]',
    'a[href="/support-us"]'
  ],

  nextChapterSelectors: [
    '[aria-label*="Next chapter" i]',
    '[title*="Next chapter" i]',
    '[aria-label*="Next page" i]',
    '[title*="Next page" i]',
    'button:has(svg.feather-chevron-right)',
    'button:has(svg.tabler-icon-chevron-right)',
    'a[href*="/chapter/"]:has(svg)'
  ],

  // Specific purge logic
  purgeAds: function () {
    for (const sel of this.adSelectors) {
      const items = document.querySelectorAll(sel);
      for (const el of items) {
        const parent = el.closest('div.flex, div.grid, div.relative');
        if (parent && parent.children.length === 1 && parent !== document.body) {
          parent.remove();
        } else {
          el.remove();
        }
      }
    }
  }
};


// ==================== cuutruyen.js ====================
// Adapter: CuuTruyen (cuutruyen.net)

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['cuutruyen.net'] = {
  name: 'Cửu Truyện (CuuTruyen)',

  match: function () {
    return window.location.hostname.includes('cuutruyen.net');
  },

  isReader: function () {
    return window.location.pathname.includes('/chapters/');
  },

  adSelectors: [
    'iframe[src*="ad"]',
    'iframe[src*="banner"]',
    'div[class*="sponsor"]',
    'div[class*="banner"]',
    'a[href*="affiliate"]',
    'div[id*="ad-slot"]'
  ],

  nextChapterSelectors: [
    'a[href*="/chapters/"]:has(svg)',
    'button:has(svg.feather-chevron-right)',
    'a[aria-label*="kế tiếp" i]',
    'a[aria-label*="next" i]',
    'a[title*="kế tiếp" i]',
    'a[title*="next" i]',
    'a.next'
  ],

  purgeAds: function () {
    for (const sel of this.adSelectors) {
      document.querySelectorAll(sel).forEach(el => el.remove());
    }
  }
};


// ==================== truyenqq.js ====================
// Adapter: TruyenQQ (truyenqq*.com, truyenqq*.vn, truyenqqko.com, truyenqqq.org, etc.)

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['truyenqq'] = {
  name: 'TruyenQQ',

  match: function () {
    const host = window.location.hostname.toLowerCase();
    return host.includes('truyenqq') || host.includes('tvtruyen');
  },

  isReader: function () {
    const path = window.location.pathname.toLowerCase();
    return path.includes('chapter-') || path.includes('/chap-') || path.includes('chap');
  },

  adSelectors: [
    // 1. Popup quảng cáo toàn màn hình & Popunder
    '#image_popup',
    '#image_popup_mobile',
    '.image_popup',
    'div[id^="preload_ads"]',
    'div[id^="preload_banner"]',

    // 2. Banner trượt & Banner cố định 2 bên viền (Desktop & Mobile)
    '#ads_mobile',
    '.ads_close_mobile',
    '#left-banner',
    '#right-banner',
    '#top-banner',
    '#bottom_banner',
    '#bottom-banner',
    '.ads_close',
    '#floating-ad',
    '.ad_fixed',
    '.ad-container',
    '.box_ads',
    '.box-ads',
    '.banner-desktop',
    '.banner-mobile',
    '.ads-holder',
    '.banner-holder',
    '.bottom-ads',
    '.middle-ads',

    // 3. Khối Shopee / Lazada Affiliate chèn giữa các trang truyện
    '.productafs',
    '.product-grid',
    '.product-item',
    'div:has(> .product-grid)',
    'div:has(> .productafs)',
    'a[href*="shopee.vn"]',
    'a[href*="s.shopee.vn"]',
    'a[href*="lazada.vn"]',
    'a[href*="s.lazada.vn"]',

    // 4. Iframes & Ad Networks bên thứ 3
    'iframe[src*="traffictop"]',
    'iframe[src*="bundleunum"]',
    'iframe[src*="googletagmanager"]',
    'iframe[src*="ad"]',
    'iframe[src*="banner"]',

    // 5. Bẫy thông báo chống AdBlock của TruyenQQ
    '#reader-notice',
    '.reader-notice',
    'div[class*="reader-notice"]',

    // 6. Link & Banner Nhà Cái / Cờ Bạc / Casino / Cá Độ
    'a[href*="fun88"]',
    'a[href*="mm88"]',
    'a[href*="mb66"]',
    'a[href*="xx88"]',
    'a[href*="ww88"]',
    'a[href*="kubet"]',
    'a[href*="o8v"]',
    'a[href*="o8bet"]',
    'a[href*="boc88"]',
    'a[href*="sv368"]',
    'a[href*="sv388"]',
    'a[href*="go88"]',
    'a[href*="xoilac"]',
    'a[href*="kqbd"]',
    'a[href*="win79"]',
    'a[href*="sunwin"]',
    'a[href*="rikvip"]',
    'a[href*="b52"]',
    'a[href*="789club"]',
    'a[href*="f8bet"]',
    'a[href*="shbet"]',
    'a[href*="new88"]',
    'a[href*="hi88"]',
    'a[href*="jun88"]',
    'a[href*="78win"]',
    'a[href*="okvip"]',

    // 7. Generic id bẫy quảng cáo
    'div[id*="ad_"]',
    'div[id*="ads_"]',
    'div[id^="ads"]',
    'div[style*="z-index: 2147483647"]',
    'div[style*="z-index: 999999"]'
  ],

  nextChapterSelectors: [
    'a.next',
    'a.btn_next',
    'a.next_chapter',
    'a[href*="chapter-"]:has(i.fa-chevron-right)',
    'a[href*="chapter-"]:has(i.fa-arrow-right)',
    'a.btn-action.next'
  ],

  purgeAds: function () {
    // 1. Quét và loại bỏ tất cả node quảng cáo định danh
    for (const sel of this.adSelectors) {
      try {
        document.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {}
    }

    // 2. Mở khóa đọc nếu bị dính class reader-locked
    if (document.body.classList.contains('reader-locked')) {
      document.body.classList.remove('reader-locked');
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.body.style.height = 'auto';
    }

    // 3. Quét các thẻ <a> dẫn sang web cờ bạc, shopee, bên thứ ba gắn hình banner
    const externalLinks = document.querySelectorAll('a[href^="http"]');
    for (const a of externalLinks) {
      const href = a.href.toLowerCase();
      if (!href.includes('truyenqq') && !href.includes('discord.com') && !href.includes('facebook.com')) {
        const hasAdKeywords = ['bet', '88', 'casino', 'shopee', 'lazada', 'game', 'aff', 'traffictop', 'link', 'banner'].some(k => href.includes(k));
        const hasImg = a.querySelector('img') !== null;
        if (hasAdKeywords || hasImg) {
          const wrapper = a.closest('.product-item, .productafs, .product-grid, div');
          if (wrapper && wrapper !== document.body && wrapper.children.length === 1) {
            wrapper.remove();
          } else {
            a.remove();
          }
        }
      }
    }

    // 4. Xóa banner cố định bám 2 bên màn hình (nếu có inline style)
    const fixedElements = document.querySelectorAll('div[style*="fixed"]');
    for (const el of fixedElements) {
      const style = el.getAttribute('style') || '';
      if ((style.includes('left:') || style.includes('right:')) && !el.id.includes('uptop') && !el.classList.contains('chapter_scroll')) {
        el.remove();
      }
    }
  }
};



// ==================== nettruyen.js ====================
// Adapter: NetTruyen & NhatTruyen (nettruyen*.*, nhattruyen*.*)

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['nettruyen'] = {
  name: 'NetTruyen',

  match: function () {
    const host = window.location.hostname.toLowerCase();
    return host.includes('nettruyen') || host.includes('nhattruyen');
  },

  isReader: function () {
    const path = window.location.pathname.toLowerCase();
    return path.includes('chap-') || path.includes('/chuong-') || path.includes('chapter');
  },

  adSelectors: [
    'iframe[src*="ad"]',
    'iframe[src*="banner"]',
    '.bottom-ads',
    '#floating-ad',
    '.middle-ads',
    '.ads-holder',
    '.banner-holder',
    'div[id^="ads"]',
    'div[id*="ad_"]',
    'div[class*="ads-"]',
    'div[class*="banner-"]',
    'div[style*="position: fixed"][style*="bottom: 0"]',
    '#reader-notice',
    '.reader-notice',
    '.modal-adblock'
  ],

  nextChapterSelectors: [
    'a.next',
    'a.navNext',
    'a.chapter-nav-btn.next',
    'a:has(.fa-chevron-right)',
    'a:has(.fa-arrow-right)',
    '.btn-navigation-next'
  ],

  purgeAds: function () {
    for (const sel of this.adSelectors) {
      try {
        document.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {}
    }

    if (document.body && document.body.classList.contains('reader-locked')) {
      document.body.classList.remove('reader-locked');
      document.body.style.overflow = 'auto';
    }
  }
};


// ==================== nhentai.js ====================
// Adapter: nHentai (nhentai.net, nhentai.xxx, nhentai.to)
// Deep integration: Ad neutralization, Popunder trap defang, Clean navigation

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['nhentai.net'] = {
  name: 'nHentai',

  match: function () {
    const host = window.location.hostname.toLowerCase();
    return host.includes('nhentai.net') || host.includes('nhentai.xxx') || host.includes('nhentai.to');
  },

  isReader: function () {
    // /g/{id}/{page}/ or /g/{id}/
    return /^\/g\/\d+\/\d+\/?$/.test(window.location.pathname);
  },

  adSelectors: [
    // 1. Mạng quảng cáo người lớn phổ biến trên nHentai
    'iframe[src*="exoclick"]',
    'iframe[src*="juicyads"]',
    'iframe[src*="ero-advertising"]',
    'iframe[src*="trafficjunky"]',
    'iframe[src*="tsyndicate"]',
    'iframe[src*="chaturbate"]',
    
    // 2. Banner & Popunder container
    '#ad-banner',
    '.ad-banner',
    '.advertisement',
    '#chaturbate-ad',
    '.banner-holder',
    '.script_manager_video_master',
    'div[id*="ad_"]',
    'div[class*="ad-"]',
    'div[data-jads-slot]',
    
    // 3. Link quảng cáo ngoài & Bẫy click chuyển hướng
    'a[href*="/api/_/popunder"]',
    'a[href*="chaturbate.com"]',
    'a[href*="exoclick.com"]',
    'a[href*="theporndude.com"]',
    'a[href*="daftsex.eu"]',
    'a[href*="animemafia.to"]',
    'a[href*="juicyads.com"]',
    'a[href*="ero-advertising.com"]'
  ],

  nextChapterSelectors: [
    '#image-container a',
    'a.next',
    'button.next',
    '.pagination a.next'
  ],

  // Thanh trừng quảng cáo & Hóa giải bẫy click chuột
  purgeAds: function () {
    // 1. Xóa các container quảng cáo
    for (const sel of this.adSelectors) {
      try {
        document.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {}
    }

    // 2. Hóa giải bẫy popunder gài trên ảnh đọc truyện (#image-container)
    const imgLink = document.querySelector('#image-container a');
    if (imgLink && !imgLink.dataset.defanged) {
      imgLink.dataset.defanged = 'true';
      // Ngăn chặn các script bên ngoài gài popup khi bấm vào ảnh
      imgLink.addEventListener('click', function (e) {
        e.stopPropagation();
      }, true);
    }
  }
};



// ==================== hentaiz.js ====================
// Adapter: HentaiZ (hentaiz.foo, hentaiz.net, hentaiz.cc, hentaiz.vip, hentaiz.*)
// Deep integration: Ad neutralization, Popunder killer, Absolute Video Player Protection

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['hentaiz'] = {
  name: 'HentaiZ',

  match: function () {
    const host = window.location.hostname.toLowerCase();
    return host.includes('hentaiz.') || host.startsWith('hentaiz');
  },

  isReader: function () {
    const path = window.location.pathname.toLowerCase();
    return path.startsWith('/watch/') || path.startsWith('/gallery/');
  },

  adSelectors: [
    'iframe[id*="__clb-spot"]',
    'div[id*="__clb-spot"]',
    'div[class*="spot_"]',
    'iframe[src*="janitorprecisiontrio"]',
    'iframe[src*="frozenpayerpregnant"]',
    'iframe[src*="clammyendearedkeg"]',
    'script[src*="janitorprecisiontrio"]',
    'script[src*="frozenpayerpregnant"]',
    'script[src*="clammyendearedkeg"]',
    'a[href*="meoden.net"]',
    'div[style*="z-index: 2147483647"]',
    'div[style*="z-index: 999999"]:not(#md-autonext-widget)'
  ],

  nextChapterSelectors: [
    'a[href*="/watch/"]'
  ],

  // Thanh trừng triệt để banner & popup nhưng BẢO VỆ TUYỆT ĐỐI trình phát video player (haiten.org)
  purgeAds: function () {
    // 1. Xóa các container quảng cáo và script bẫy cụ thể của HentaiZ
    const adNodes = document.querySelectorAll(this.adSelectors.join(','));
    for (const el of adNodes) {
      if (el.closest('[class*="aspect-video"], .video-container, #player')) {
        continue;
      }
      el.remove();
    }

    // 2. Chỉ xóa các iframe quảng cáo đã được xác định chắc chắn
    const adIframes = document.querySelectorAll('iframe[id*="__clb-spot"], iframe[src*="janitorprecisiontrio"], iframe[src*="frozenpayerpregnant"], iframe[src*="clammyendearedkeg"]');
    for (const ifr of adIframes) {
      ifr.remove();
    }
  }
};



// ==================== rule34.js ====================
// Adapter: Rule34 Universal (rule34.xxx & rule34video.com)
// Full ad neutralization, popunder defang, video player acceleration, image preloading

window.MangaAdapters = window.MangaAdapters || {};

window.MangaAdapters['rule34'] = {
  name: 'Rule34 Universal',

  match: function () {
    const host = window.location.hostname.toLowerCase();
    return host.includes('rule34.xxx') || host.includes('rule34video.com');
  },

  isReader: function () {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    
    // 1. rule34video.com: /video/{id}/{slug}/
    if (host.includes('rule34video.com')) {
      return path.startsWith('/video/');
    }
    
    // 2. rule34.xxx: index.php?page=post&s=view
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('page') === 'post' && sp.get('s') === 'view';
    } catch (e) {
      return false;
    }
  },

  adSelectors: [
    // Container Clickadilla / ExoClick
    'iframe[id*="__clb-spot"]',
    'div[id*="__clb-spot"]',
    'div[class*="spot_"]',
    
    // Mạng quảng cáo rule34video.com
    'iframe[src*="trialhd.com"]',
    'iframe[src*="sadbaguette.com"]',
    'iframe[src*="jads.co"]',
    'iframe[src*="chilihandshakewing"]',
    '.sidebar_ad_buttons',
    '.panel_header--promo',
    'a[href*="trafficjunky"]',
    'a[href*="jads.co"]',
    
    // Mạng quảng cáo rule34.xxx
    '#ad-top',
    '#ad-bottom',
    '#ad-left',
    '#ad-right',
    '.ad-banner',
    'div[id*="ad_"]',
    'iframe[src*="exoclick"]',
    'iframe[src*="juicyads"]',
    'iframe[src*="trafficjunky"]',
    'iframe[src*="ero-advertising"]',
    
    // Popunder / floating overlays
    'div[style*="z-index: 2147483647"]',
    'div[style*="z-index: 999999"]:not(#md-autonext-widget)'
  ],

  nextChapterSelectors: [
    // rule34video: Related video link
    '#custom_list_videos_related_videos a[href*="/video/"]',
    // rule34.xxx: Next post in pool or tag list
    'a[alt="next"]',
    'a[title="Next Post"]'
  ],

  // Thanh trừng toàn bộ quảng cáo nhưng BẢO VỆ TUYỆT ĐỐI khung phát video (#kt_player) và ảnh chính (#image)
  purgeAds: function () {
    // 1. Xóa các container quảng cáo theo selector
    const nodes = document.querySelectorAll(this.adSelectors.join(','));
    for (const el of nodes) {
      if (el.closest('#kt_player, .kt-player, #image, #gelcomVideoPlayer')) {
        continue;
      }
      el.remove();
    }

    // 2. Xóa các iframe quảng cáo độc hại
    const iframes = document.querySelectorAll('iframe');
    for (const ifr of iframes) {
      const src = (ifr.getAttribute('src') || '').toLowerCase();
      // Bỏ qua nếu là player hợp lệ
      if (ifr.closest('#kt_player, .kt-player') || ifr.hasAttribute('allowfullscreen')) {
        continue;
      }
      if (
        src.includes('trialhd') ||
        src.includes('sadbaguette') ||
        src.includes('jads.co') ||
        src.includes('chilihandshakewing') ||
        src.includes('exoclick') ||
        src.includes('juicyads') ||
        src.includes('trafficjunky') ||
        ifr.id.includes('__clb-spot')
      ) {
        ifr.remove();
      }
    }
  }
};



// ==================== content.js ====================
// Manga Universal Pro - Pure AdShield & Anti-Adblock Master
// 100% Focused on Ad Blocking, Popunder Defense & Anti-Adblock Defeat

(function () {
  'use strict';

  // 1. Kiểm tra danh sách tên miền cần bỏ qua (đảm bảo 0% chiếm tài nguyên trên Google, FB, v.v.)
  const IGNORED_DOMAINS = [
    'google.', 'facebook.', 'youtube.', 'github.', 'twitter.', 'x.com',
    'reddit.', 'wikipedia.', 'microsoft.', 'bing.', 'yahoo.', 'amazon.'
  ];

  const currentHost = window.location.hostname.toLowerCase();
  if (IGNORED_DOMAINS.some(d => currentHost.includes(d))) {
    return;
  }

  // 2. Tìm Adapter phù hợp với web hiện tại
  function getActiveAdapter() {
    const host = window.location.hostname.toLowerCase();
    const adapters = window.MangaAdapters || {};
    for (const key in adapters) {
      if (key !== 'generic') {
        const adp = adapters[key];
        if (typeof adp.match === 'function' && adp.match()) {
          return adp;
        }
        if (host.includes(key)) {
          return adp;
        }
      }
    }
    const path = window.location.pathname.toLowerCase();
    const isMangaSite = ['manga', 'comic', 'truyen', 'chapter', 'chap', 'read', 'chuong', 'hentai'].some(w => host.includes(w) || path.includes(w));
    if (isMangaSite) {
      return adapters['generic'] || null;
    }
    return null;
  }

  const adapter = getActiveAdapter();
  if (!adapter) return;

  console.info(`[Manga Universal Pro] Kích hoạt Lá chắn Quảng cáo cho: ${adapter.name}`);

  // 3. Chặn quảng cáo, Popunder & Banner tài trợ
  function purgeAds() {
    if (typeof adapter.purgeAds === 'function') {
      adapter.purgeAds();
    }
    if (window.MangaAdHeuristic) {
      window.MangaAdHeuristic.sweep();
    }
  }

  // Khởi động Heuristic Ad Sweeper (Tự động thanh trừng theo hành vi, chống đổi tên class)
  if (window.MangaAdHeuristic) {
    window.MangaAdHeuristic.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purgeAds);
  } else {
    purgeAds();
  }

  // 4. Theo dõi DOM động (SPA route changes, Vue/Nuxt/Svelte router)
  const obs = new MutationObserver(() => {
    purgeAds();
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // 5. TỰ ĐỘNG CHUYỂN CHƯƠNG TIẾP THEO (Auto-Next Chapter Engine - Siêu nhẹ, 0% Lag)
  function setupAutoNextChapter() {
    // Chỉ kích hoạt khi đang ở trang đọc truyện / xem nội dung
    const isReading = typeof adapter.isReader === 'function' ? adapter.isReader() : true;
    if (!isReading) return;

    let isNavigating = false;
    let lastUrl = window.location.href;

    // Reset cờ khi trang SPA chuyển URL
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        isNavigating = false;
      }
    }, 500);

    function findNextTarget() {
      // 1. Dò theo danh sách selector tối ưu riêng của từng web
      const selectors = adapter.nextChapterSelectors || [];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            if (el.tagName === 'A' && el.href && !el.href.endsWith('#') && !el.href.startsWith('javascript:')) {
              if (el.href !== window.location.href) {
                return { element: el, url: el.href };
              }
            } else if (typeof el.click === 'function') {
              return { element: el, url: null };
            }
          }
        } catch (e) {}
      }

      // 2. Dự phòng: Tìm thẻ select chứa danh sách chapter
      try {
        const select = document.querySelector('select.select-chapter, select[id*="chapter"], select[class*="chapter"]');
        if (select && select.selectedIndex >= 0) {
          const currOpt = select.options[select.selectedIndex];
          if (select.selectedIndex < select.options.length - 1) {
            const nextOpt = select.options[select.selectedIndex + 1];
            if (nextOpt && nextOpt.value && nextOpt.value !== currOpt.value) {
              const url = nextOpt.value.startsWith('http') ? nextOpt.value : (window.location.origin + nextOpt.value);
              return { element: select, url: url, isSelect: true, nextIndex: select.selectedIndex + 1 };
            }
          }
        }
      } catch (e) {}

      // 3. Dự phòng chung: a[rel="next"], link[rel="next"]
      try {
        const relNext = document.querySelector('a[rel="next"], a.next, a.btn-next, a.next_chapter');
        if (relNext && relNext.href && relNext.href !== window.location.href) {
          return { element: relNext, url: relNext.href };
        }
      } catch (e) {}

      return null;
    }

    function navigateToTarget(target) {
      if (isNavigating) return;
      isNavigating = true;

      if (target.url) {
        window.location.href = target.url;
      } else if (target.isSelect && target.element) {
        target.element.selectedIndex = target.nextIndex;
        target.element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (target.element && typeof target.element.click === 'function') {
        target.element.click();
      }
    }

    function triggerAutoNext() {
      if (isNavigating) return;
      const target = findNextTarget();
      if (!target) return;
      navigateToTarget(target);
    }

    // 6. Theo dõi thao tác cuộn đến cuối trang (Scroll to Bottom) -> Nhảy chap ngay tức thì (0s chờ)
    let isScrolling = false;
    window.addEventListener('scroll', () => {
      if (isScrolling || isNavigating) return;
      isScrolling = true;

      requestAnimationFrame(() => {
        isScrolling = false;
        const scrollDistanceToBottom = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);

        // Khi người đọc cuộn chạm cuối trang (còn dưới 120px)
        if (scrollDistanceToBottom <= 120) {
          triggerAutoNext();
        }
      });
    }, { passive: true });
  }

  // Khởi chạy Auto-Next khi DOM đã sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAutoNextChapter);
  } else {
    setupAutoNextChapter();
  }
})();



})();
