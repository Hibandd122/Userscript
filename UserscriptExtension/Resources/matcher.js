/**
 * Userscript Advanced Matcher Engine
 * Implements Google Chrome / W3C Match Patterns & Greasemonkey include/exclude specifications.
 */
(function() {
  'use strict';

  var regexCache = Object.create(null);

  /**
   * Converts a Chrome/Safari @match pattern into a strict regular expression.
   */
  function patternToRegex(pattern) {
    if (!pattern || typeof pattern !== 'string') return null;
    pattern = pattern.trim();
    if (!pattern) return null;

    if (regexCache[pattern]) return regexCache[pattern];

    if (pattern === '<all_urls>') {
      var re = /^https?:\/\/.+/i;
      regexCache[pattern] = re;
      return re;
    }

    // Match Scheme: * | http | https | file | ftp
    var schemeSeparator = '://';
    var schemeIdx = pattern.indexOf(schemeSeparator);
    if (schemeIdx === -1) {
      // Treat as simple wildcard include (e.g. *google.com*)
      var wildcardEscaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      var wildcardRe = new RegExp('^' + wildcardEscaped + '$', 'i');
      regexCache[pattern] = wildcardRe;
      return wildcardRe;
    }

    var scheme = pattern.slice(0, schemeIdx);
    var rest = pattern.slice(schemeIdx + schemeSeparator.length);

    var slashIdx = rest.indexOf('/');
    var host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    var path = slashIdx === -1 ? '/*' : rest.slice(slashIdx);

    // Scheme regex
    var schemeRegex = scheme === '*' ? 'https?' : scheme.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Host regex
    var hostRegex;
    if (host === '*') {
      hostRegex = '[^/]+';
    } else if (host.indexOf('*.') === 0) {
      var rawDomain = host.slice(2).replace(/[.+^${}()|[\]\\]/g, '\\$&');
      hostRegex = '([^/]+\\.)*' + rawDomain;
    } else {
      hostRegex = host.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    }

    // Path regex
    var pathRegex = path.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

    try {
      var compiled = new RegExp('^' + schemeRegex + ':\\/\\/' + hostRegex + pathRegex + '$', 'i');
      regexCache[pattern] = compiled;
      return compiled;
    } catch (e) {
      console.warn('[Userscript Matcher] Invalid pattern ignored:', pattern, e);
      return null;
    }
  }

  window.__US_Matcher = {
    test: function(url, script) {
      if (!url || !script) return false;

      // 1. Exclude patterns take absolute precedence
      if (script.excludes && Array.isArray(script.excludes)) {
        for (var i = 0; i < script.excludes.length; i++) {
          var excRe = patternToRegex(script.excludes[i]);
          if (excRe && excRe.test(url)) {
            return false;
          }
        }
      }

      // 2. Check Match patterns
      if (script.matches && Array.isArray(script.matches) && script.matches.length > 0) {
        for (var j = 0; j < script.matches.length; j++) {
          var matchRe = patternToRegex(script.matches[j]);
          if (matchRe && matchRe.test(url)) {
            return true;
          }
        }
      }

      // 3. Check Include patterns
      if (script.includes && Array.isArray(script.includes) && script.includes.length > 0) {
        for (var k = 0; k < script.includes.length; k++) {
          var incRe = patternToRegex(script.includes[k]);
          if (incRe && incRe.test(url)) {
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
