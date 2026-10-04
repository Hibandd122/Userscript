/**
 * URL Matcher for Userscript @match and @include directives
 */
(function() {
  window.__US_Matcher = {
    matchPatternToRegExp: function(pattern) {
      if (pattern === "<all_urls>") return /^https?:\/\/.+/i;
      
      var schemeMatch = pattern.match(/^(\*|https?|file|ftp):\/\//);
      if (!schemeMatch) {
        // Fallback simple wildcard
        var escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        return new RegExp('^' + escaped + '$', 'i');
      }

      var scheme = schemeMatch[1];
      var rest = pattern.slice(schemeMatch[0].length);
      var slashIdx = rest.indexOf('/');
      var host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      var path = slashIdx === -1 ? '/*' : rest.slice(slashIdx);

      var schemeRegex = scheme === '*' ? 'https?' : scheme;
      var hostRegex = host === '*' ? '[^/]+' : host.replace(/\./g, '\\.').replace(/^\*\\\./, '([^/]+\\.)?').replace(/\*/g, '[^/]*');
      var pathRegex = path.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

      return new RegExp('^' + schemeRegex + ':\\/\\/' + hostRegex + pathRegex + '$', 'i');
    },

    isUrlMatched: function(url, script) {
      if (!url) return false;

      // 1. Check excludes first
      if (script.excludes && Array.isArray(script.excludes)) {
        for (var i = 0; i < script.excludes.length; i++) {
          var excludeRegex = this.matchPatternToRegExp(script.excludes[i]);
          if (excludeRegex.test(url)) return false;
        }
      }

      // 2. Check matches
      if (script.matches && Array.isArray(script.matches)) {
        for (var j = 0; j < script.matches.length; j++) {
          var matchRegex = this.matchPatternToRegExp(script.matches[j]);
          if (matchRegex.test(url)) return true;
        }
      }

      // 3. Check includes
      if (script.includes && Array.isArray(script.includes)) {
        for (var k = 0; k < script.includes.length; k++) {
          var includeRegex = this.matchPatternToRegExp(script.includes[k]);
          if (includeRegex.test(url)) return true;
        }
      }

      return false;
    }
  };
})();
