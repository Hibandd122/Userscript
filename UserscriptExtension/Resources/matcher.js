/**
 * Userscript Runtime & Compatibility Engine 3.0
 * Matcher Engine 2.0, Metadata Parser & Match Explanation Engine
 */
(function() {
  'use strict';

  var globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  var regexCache = Object.create(null);

  /**
   * Normalizes URL for consistent matching across protocols, subdomains, and paths
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
   * Converts match pattern or Greasemonkey include/exclude string to RegExp.
   * Handles:
   *  - <all_urls>
   *  - Standard Chrome/W3C match patterns: <scheme>://<host>/<path>
   *  - Subdomain wildcards: *.example.com and *example*
   *  - Greasemonkey RegExps: /regex/flags
   *  - Path wildcards: *chapter*, /manga/*
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

    // Greasemonkey explicit RegExp pattern: /.../flags
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
    var schemeRegex = 'https?';
    var host = pattern;
    var path = '/*';

    if (schemeIdx !== -1) {
      var scheme = pattern.slice(0, schemeIdx).toLowerCase();
      var rest = pattern.slice(schemeIdx + schemeSeparator.length);
      if (scheme === '*' || scheme === 'http*' || scheme === 'http' || scheme === 'https') {
        schemeRegex = 'https?';
      } else {
        schemeRegex = scheme.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      }
      var slashIdx = rest.indexOf('/');
      host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      path = slashIdx === -1 ? '/*' : rest.slice(slashIdx);
    } else {
      var sIdx = pattern.indexOf('/');
      host = sIdx === -1 ? pattern : pattern.slice(0, sIdx);
      path = sIdx === -1 ? '/*' : pattern.slice(sIdx);
    }

    // Host regex
    var hostRegex;
    if (host === '*') {
      hostRegex = '[^/:]+';
    } else if (host.indexOf('*.') === 0) {
      var baseDomain = host.slice(2);
      var baseRegex = baseDomain
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/:]*');
      // Matches root domain, subdomains, and www
      hostRegex = '(?:[^/:]+\\.)*' + baseRegex;
    } else {
      var escapedHost = host
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/:]*');
      hostRegex = '(?:www\\.)?' + escapedHost;
    }

    // Path regex: if /* or / or empty, match optional slash + rest
    var pathRegex;
    if (path === '/*' || path === '/' || path === '') {
      pathRegex = '(?:\\/.*)?';
    } else {
      var p = path
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      if (p.slice(-5) === '\\/.*') {
        p = p.slice(0, -5) + '(?:\\/.*)?';
      }
      pathRegex = p;
    }

    try {
      var compiled = new RegExp('^(?:' + schemeRegex + ':\\/\\/)?' + hostRegex + '(?::\\d+)?' + pathRegex + '$', 'i');
      regexCache[pattern] = compiled;
      return compiled;
    } catch (e) {
      console.warn('[Userscript Matcher] Invalid pattern ignored:', pattern, e);
      return null;
    }
  }

  /**
   * MetadataParser 3.0
   * Robust parser supporting LF/CRLF, UTF-8 BOM, duplicate keys, whitespace trimming,
   * @connect, @require, @resource, @noframes, @run-at, @spa, etc.
   */
  function parseMetadata(content) {
    if (!content || typeof content !== 'string') return {};
    var clean = content;
    if (clean.charCodeAt(0) === 0xFEFF) {
      clean = clean.slice(1);
    }

    var metadata = {
      name: 'Untitled Script',
      namespace: '',
      version: '1.0.0',
      description: '',
      author: '',
      matches: [],
      includes: [],
      excludes: [],
      excludeMatches: [],
      grants: [],
      requires: [],
      resources: Object.create(null),
      connects: [],
      runAt: 'document-end',
      noframes: false,
      spaMode: 'once-per-document',
      priority: 100
    };

    var lines = clean.split(/\r?\n/);
    var insideHeader = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('==UserScript==') !== -1) {
        insideHeader = true;
        continue;
      }
      if (line.indexOf('==/UserScript==') !== -1) {
        insideHeader = false;
        break;
      }
      if (!insideHeader || line.indexOf('//') !== 0) continue;

      var directive = line.replace(/^\/\/\s*/, '');
      if (directive.indexOf('@') !== 0) continue;

      var match = directive.slice(1).match(/^([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
      if (!match) continue;

      var key = match[1].toLowerCase();
      var value = match[2] ? match[2].trim() : '';

      switch (key) {
        case 'name':
          if (value) metadata.name = value;
          break;
        case 'namespace':
          metadata.namespace = value;
          break;
        case 'version':
          if (value) metadata.version = value;
          break;
        case 'description':
          metadata.description = value;
          break;
        case 'author':
          metadata.author = value;
          break;
        case 'match':
          if (value) metadata.matches.push(value);
          break;
        case 'include':
          if (value) metadata.includes.push(value);
          break;
        case 'exclude':
          if (value) metadata.excludes.push(value);
          break;
        case 'exclude-match':
          if (value) metadata.excludeMatches.push(value);
          break;
        case 'grant':
          if (value) metadata.grants.push(value);
          break;
        case 'require':
          if (value) metadata.requires.push(value);
          break;
        case 'resource':
          if (value) {
            var rParts = value.split(/\s+/);
            if (rParts.length >= 2) {
              metadata.resources[rParts[0]] = rParts.slice(1).join(' ');
            }
          }
          break;
        case 'connect':
          if (value) metadata.connects.push(value);
          break;
        case 'run-at':
          var rLow = value.toLowerCase().replace(/_/g, '-');
          if (rLow === 'document-start' || rLow === 'document-end' || rLow === 'document-idle') {
            metadata.runAt = rLow;
          }
          break;
        case 'noframes':
          metadata.noframes = true;
          break;
        case 'spa':
          var sLow = value.toLowerCase().replace(/\s+/g, '-');
          if (sLow === 'page' || sLow === 'once-per-document') metadata.spaMode = 'once-per-document';
          else if (sLow === 'url' || sLow === 'once-per-url') metadata.spaMode = 'once-per-url';
          else if (sLow === 'navigation' || sLow === 'every-navigation' || sLow === 'always') metadata.spaMode = 'every-navigation';
          break;
        case 'priority':
          var pInt = parseInt(value, 10);
          if (!isNaN(pInt)) metadata.priority = pInt;
          break;
        case 'icon':
        case 'iconurl':
        case 'defaulticon':
          metadata.icon = value;
          break;
        case 'updateurl':
          metadata.updateURL = value;
          break;
        case 'downloadurl':
          metadata.downloadURL = value;
          break;
      }
    }

    if (metadata.matches.length === 0 && metadata.includes.length === 0) {
      metadata.matches.push('*://*/*');
    }
    if (metadata.grants.length === 0) {
      metadata.grants.push('none');
    }

    return metadata;
  }

  /**
   * MatcherEngine 2.0 Pipeline
   * Evaluates match with precise structured reason and rule details.
   */
  function evaluateMatch(url, script, options) {
    options = options || {};
    var domainRules = options.domainRules || [];
    var temporaryOverrides = options.temporaryOverrides || {};
    var isTopFrame = options.isTopFrame !== undefined ? options.isTopFrame : true;

    if (!url || !script) {
      return {
        matched: false,
        reason: 'unsupported-url',
        rule: null,
        details: 'Missing URL or Script definition'
      };
    }

    var normUrl = normalizeUrl(url);
    var scriptId = script.id || script.name;

    // 1. Script Enabled check
    if (script.enabled === false) {
      return {
        matched: false,
        reason: 'disabled',
        rule: null,
        details: 'Script is explicitly disabled by user.'
      };
    }

    // 2. Temporary Override (Highest Priority)
    if (temporaryOverrides && temporaryOverrides[scriptId] !== undefined) {
      if (temporaryOverrides[scriptId]) {
        return {
          matched: true,
          reason: 'temporary-override-allowed',
          rule: 'temporaryOverride:' + scriptId,
          details: 'Script explicitly enabled via Quick Controls.'
        };
      } else {
        return {
          matched: false,
          reason: 'temporary-override-blocked',
          rule: 'temporaryOverride:' + scriptId,
          details: 'Script is temporarily paused via Quick Controls.'
        };
      }
    }

    // 3. Frame Rules (@noframes check)
    if (script.noframes && !isTopFrame) {
      return {
        matched: false,
        reason: 'frame-blocked',
        rule: '@noframes',
        details: 'Script blocked in iframe due to @noframes directive.'
      };
    }

    // 4. Domain Rules
    if (domainRules && Array.isArray(domainRules)) {
      var now = Date.now();
      for (var d = 0; d < domainRules.length; d++) {
        var rule = domainRules[d];
        if (rule.expiresAt && new Date(rule.expiresAt).getTime() < now) {
          continue; // Expired
        }

        var ruleRe = patternToRegex(rule.domainPattern);
        if (ruleRe && (ruleRe.test(normUrl) || ruleRe.test(url))) {
          if (!rule.targetScriptId || rule.targetScriptId === scriptId) {
            if (rule.action === 'Block' || rule.action === 'Temporary Block') {
              return {
                matched: false,
                reason: 'domain-blocked',
                rule: rule.domainPattern,
                details: 'Blocked by Domain Rule: ' + rule.domainPattern
              };
            }
            if (rule.action === 'Allow' || rule.action === 'Temporary Allow') {
              return {
                matched: true,
                reason: 'domain-rule-allowed',
                rule: rule.domainPattern,
                details: 'Explicitly allowed by Domain Rule: ' + rule.domainPattern
              };
            }
          }
        }
      }
    }

    // 5. Exclude-Match Patterns
    var excMatches = script.excludeMatches || script['exclude-matches'] || [];
    if (Array.isArray(excMatches)) {
      for (var em = 0; em < excMatches.length; em++) {
        var emRe = patternToRegex(excMatches[em]);
        if (emRe && (emRe.test(normUrl) || emRe.test(url))) {
          return {
            matched: false,
            reason: 'excluded-by-exclude-match',
            rule: excMatches[em],
            details: 'URL matched @exclude-match pattern: ' + excMatches[em]
          };
        }
      }
    }

    // 6. Exclude Patterns
    var excludes = script.excludes || [];
    if (Array.isArray(excludes)) {
      for (var ex = 0; ex < excludes.length; ex++) {
        var exRe = patternToRegex(excludes[ex]);
        if (exRe && (exRe.test(normUrl) || exRe.test(url))) {
          return {
            matched: false,
            reason: 'excluded-by-exclude',
            rule: excludes[ex],
            details: 'URL matched @exclude pattern: ' + excludes[ex]
          };
        }
      }
    }

    // 7. Match Patterns
    var matches = script.matches || [];
    if (Array.isArray(matches) && matches.length > 0) {
      for (var m = 0; m < matches.length; m++) {
        var mRe = patternToRegex(matches[m]);
        if (mRe && (mRe.test(normUrl) || mRe.test(url))) {
          return {
            matched: true,
            reason: 'matched-by-match',
            rule: matches[m],
            details: 'URL satisfied @match pattern: ' + matches[m]
          };
        }
      }
    }

    // 8. Include Patterns
    var includes = script.includes || [];
    if (Array.isArray(includes) && includes.length > 0) {
      for (var inc = 0; inc < includes.length; inc++) {
        var incRe = patternToRegex(includes[inc]);
        if (incRe && (incRe.test(normUrl) || incRe.test(url))) {
          return {
            matched: true,
            reason: 'matched-by-include',
            rule: includes[inc],
            details: 'URL satisfied @include pattern: ' + includes[inc]
          };
        }
      }
    }

    return {
      matched: false,
      reason: 'not-matched',
      rule: null,
      details: 'URL does not match any @match or @include rules for this script.'
    };
  }

  /**
   * MatchExplanationEngine
   * Generates comprehensive human and machine-readable explanation of why a script runs or is blocked.
   */
  function explainMatch(url, script, domainRules, temporaryOverrides, isTopFrame) {
    var result = evaluateMatch(url, script, {
      domainRules: domainRules,
      temporaryOverrides: temporaryOverrides,
      isTopFrame: isTopFrame
    });

    var checklist = [];

    // Enabled check
    checklist.push({
      item: 'Script Enabled',
      passed: script.enabled !== false,
      message: script.enabled !== false ? 'Script is active in manager' : 'Script is toggled OFF'
    });

    // Temp Override check
    var scriptId = script.id || script.name;
    var isOverridden = temporaryOverrides && temporaryOverrides[scriptId] === false;
    checklist.push({
      item: 'Temporary Pause',
      passed: !isOverridden,
      message: isOverridden ? 'Temporarily paused for this site' : 'No active temporary pause'
    });

    // Frame check
    var frameOk = !(script.noframes && !isTopFrame);
    checklist.push({
      item: 'Frame Permission',
      passed: frameOk,
      message: frameOk ? (isTopFrame ? 'Top window context' : 'Allowed in subframe') : 'Blocked in subframe by @noframes'
    });

    // Pattern evaluation
    checklist.push({
      item: 'URL Pattern Match',
      passed: result.matched,
      message: result.details
    });

    return {
      scriptId: scriptId,
      scriptName: script.name || 'Untitled Script',
      url: url,
      runs: result.matched,
      status: result.matched ? 'READY' : 'BLOCKED',
      reason: result.reason,
      rule: result.rule,
      checklist: checklist
    };
  }

  // Central Script Registry for lightweight runtime metadata management
  var ScriptRegistry = {
    _scripts: Object.create(null),
    register: function(script) {
      if (!script) return;
      var id = script.id || script.name;
      this._scripts[id] = {
        id: id,
        name: script.name,
        namespace: script.namespace || '',
        version: script.version || '1.0.0',
        enabled: script.enabled !== false,
        matches: script.matches || [],
        includes: script.includes || [],
        excludes: script.excludes || [],
        excludeMatches: script.excludeMatches || [],
        grants: script.grants || ['none'],
        requires: script.requires || [],
        resources: script.resources || {},
        connects: script.connects || [],
        runAt: script.runAt || 'document-end',
        noframes: !!script.noframes,
        spaMode: script.spaMode || 'once-per-document',
        priority: script.priority || 100
      };
    },
    get: function(id) {
      return this._scripts[id] || null;
    },
    getAll: function() {
      var arr = [];
      for (var k in this._scripts) {
        arr.push(this._scripts[k]);
      }
      return arr;
    },
    clear: function() {
      this._scripts = Object.create(null);
    }
  };

  // Export subsystem to globalScope
  globalScope.__US_Matcher = {
    normalizeUrl: normalizeUrl,
    patternToRegex: patternToRegex,
    parseMetadata: parseMetadata,
    evaluate: evaluateMatch,
    explain: explainMatch,
    WhyScriptRuns: function(script, url, domainRules, temporaryOverrides, isTopFrame) {
      var exp = explainMatch(url, script, domainRules, temporaryOverrides, isTopFrame);
      return exp.runs ? exp : null;
    },
    WhyScriptDoesNotRun: function(script, url, domainRules, temporaryOverrides, isTopFrame) {
      var exp = explainMatch(url, script, domainRules, temporaryOverrides, isTopFrame);
      return !exp.runs ? exp : null;
    },
    test: function(url, script, domainRules, temporaryOverrides, isTopFrame) {
      return evaluateMatch(url, script, {
        domainRules: domainRules,
        temporaryOverrides: temporaryOverrides,
        isTopFrame: isTopFrame
      }).matched;
    },
    clearCache: function() {
      regexCache = Object.create(null);
    }
  };

  globalScope.__US_ScriptRegistry = ScriptRegistry;
})();
