/**
 * Userscript Advanced Matcher Engine
 * Implements Google Chrome / W3C Match Patterns & Greasemonkey include/exclude specifications.
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var regexCache = Object.create(null);

  /**
   * Normalizes incoming URL (e.g. handles missing scheme or trailing slash on domain)
   */
  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    url = url.trim();
    if (!/^https?:\/\//i.test(url) && !/^[a-z0-9+.-]+:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    var match = url.match(/^([a-z0-9+.-]+:\/\/[^\/?#]+)([\/?#].*)?$/i);
    if (match) {
      var origin = match[1];
      var pathAndRest = match[2] || '/';
      if (pathAndRest.charAt(0) !== '/') {
        pathAndRest = '/' + pathAndRest;
      }
      url = origin + pathAndRest;
    }
    return url;
  }

  /**
   * Converts a Chrome/Safari/Greasemonkey @match / @include pattern into a compiled RegExp.
   */
  function patternToRegex(pattern) {
    if (!pattern || typeof pattern !== 'string') return null;
    pattern = pattern.trim();
    if (!pattern) return null;

    if (regexCache[pattern]) return regexCache[pattern];

    if (pattern === '<all_urls>') {
      var allUrlsRe = /^https?:\/\/.+/i;
      regexCache[pattern] = allUrlsRe;
      return allUrlsRe;
    }

    // Greasemonkey regular expression pattern: /regex/flags
    if (/^\/.*\/[a-z]*$/i.test(pattern)) {
      try {
        var lastSlash = pattern.lastIndexOf('/');
        var expr = pattern.slice(1, lastSlash);
        var flags = pattern.slice(lastSlash + 1);
        var customRe = new RegExp(expr, flags);
        regexCache[pattern] = customRe;
        return customRe;
      } catch (e) {
        return null;
      }
    }

    var schemeSeparator = '://';
    var schemeIdx = pattern.indexOf(schemeSeparator);

    // If no scheme specified (e.g. *chapter*, mangadex.org, *mangadex*)
    if (schemeIdx === -1) {
      var isWildcard = pattern.indexOf('*') !== -1;
      var wildcardRe;
      if (isWildcard) {
        var escaped = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        wildcardRe = new RegExp(escaped, 'i');
      } else {
        // Plain domain match
        var escapedDomain = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        wildcardRe = new RegExp('(?:^|[./])' + escapedDomain + '(?::|/|$)', 'i');
      }
      regexCache[pattern] = wildcardRe;
      return wildcardRe;
    }

    var scheme = pattern.slice(0, schemeIdx);
    var rest = pattern.slice(schemeIdx + schemeSeparator.length);

    var slashIdx = rest.indexOf('/');
    var host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    var path = slashIdx === -1 ? '/*' : rest.slice(slashIdx);

    // 1. Scheme regex
    var schemeRegex;
    if (scheme === '*') {
      schemeRegex = 'https?';
    } else {
      schemeRegex = scheme.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }

    // 2. Host regex
    var hostRegex;
    if (host === '*') {
      hostRegex = '[^/:]+';
    } else if (host.indexOf('*.') === 0) {
      var baseDomain = host.slice(2);
      var baseRegex = baseDomain
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/:]*');
      // Matches both "mangadex.org" and "sub.mangadex.org"
      hostRegex = '(?:[^/:]+\\.)*' + baseRegex;
    } else {
      hostRegex = host
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/:]*');
    }

    // 3. Path regex
    var pathRegex;
    if (path === '/*' || path === '') {
      pathRegex = '(?:\\/.*)?';
    } else {
      pathRegex = path
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    }

    try {
      var compiled = new RegExp('^' + schemeRegex + ':\\/\\/' + hostRegex + '(?::\\d+)?' + pathRegex + '$', 'i');
      regexCache[pattern] = compiled;
      return compiled;
    } catch (e) {
      console.warn('[Userscript Matcher] Invalid pattern ignored:', pattern, e);
      return null;
    }
  }

  globalScope.__US_Matcher = {
    normalizeUrl: normalizeUrl,
    patternToRegex: patternToRegex,

    test: function(url, script) {
      if (!url || !script) return false;

      var normUrl = normalizeUrl(url);

      // 1. Exclude patterns take absolute precedence
      if (script.excludes && Array.isArray(script.excludes)) {
        for (var i = 0; i < script.excludes.length; i++) {
          var excRe = patternToRegex(script.excludes[i]);
          if (excRe && (excRe.test(normUrl) || excRe.test(url))) {
            return false;
          }
        }
      }

      // 2. Check Match patterns
      if (script.matches && Array.isArray(script.matches) && script.matches.length > 0) {
        for (var j = 0; j < script.matches.length; j++) {
          var matchRe = patternToRegex(script.matches[j]);
          if (matchRe && (matchRe.test(normUrl) || matchRe.test(url))) {
            return true;
          }
        }
      }

      // 3. Check Include patterns
      if (script.includes && Array.isArray(script.includes) && script.includes.length > 0) {
        for (var k = 0; k < script.includes.length; k++) {
          var incRe = patternToRegex(script.includes[k]);
          if (incRe && (incRe.test(normUrl) || incRe.test(url))) {
            return true;
          }
        }
      }

      return false;
    },

    clearCache: function() {
      regexCache = Object.create(null);
    }
  };
})();
