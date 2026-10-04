// Node.js Automated Test Suite for Userscript Runtime & Compatibility Engine 3.0
// Tests: MetadataParser 3.0, MatcherEngine 2.0 (Pipeline & Reasons), MatchExplanationEngine,
// @require Dependency Manager, Scoped GM API Suite 3.0, Value Change Listeners, @connect Verification,
// Injector Sandboxing & Resource Cleanup, and Bridge Protocol 2.0

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup mock browser globals
global.window = global;
global.window.location = { href: 'https://mangadex.org/title/123', hostname: 'mangadex.org' };
global.window.self = global.window;
global.window.top = global.window;
global.document = {
  readyState: 'complete',
  head: {
    appendChild: (el) => el
  },
  body: {
    appendChild: (el) => el,
    removeChild: () => {}
  },
  documentElement: {
    appendChild: (el) => el
  },
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      setAttribute: (k, v) => { el.attributes[k] = String(v); },
      parentNode: {
        removeChild: (child) => {}
      },
      select: () => {}
    };
    return el;
  },
  execCommand: () => true,
  addEventListener: () => {}
};

// Mock localStorage
const mockStorage = {
  _data: {},
  get length() {
    return Object.keys(this._data).length;
  },
  key: function(i) {
    const keys = Object.keys(this._data);
    return keys[i] || null;
  },
  getItem: function(k) {
    return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null;
  },
  setItem: function(k, v) {
    this._data[k] = String(v);
  },
  removeItem: function(k) {
    delete this._data[k];
  },
  clear: function() {
    this._data = {};
  }
};
global.localStorage = mockStorage;

// Load Extension Modules
const matcherCode = fs.readFileSync(path.join(__dirname, '../UserscriptExtension/Resources/matcher.js'), 'utf8');
eval(matcherCode);

const bridgeCode = fs.readFileSync(path.join(__dirname, '../UserscriptExtension/Resources/bridge.js'), 'utf8');
eval(bridgeCode);

const gmApiCode = fs.readFileSync(path.join(__dirname, '../UserscriptExtension/Resources/gm-api.js'), 'utf8');
eval(gmApiCode);

const injectorCode = fs.readFileSync(path.join(__dirname, '../UserscriptExtension/Resources/injector.js'), 'utf8');
eval(injectorCode);

let passedCount = 0;
let failedCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n--- 1. Testing MetadataParser 3.0 ---');
  const matcher = window.__US_Matcher;

  it('Parses metadata with UTF-8 BOM, CRLF and duplicate @match directives', () => {
    const scriptRaw =
      "\uFEFF// ==UserScript==\r\n" +
      "// @name         Test Script\r\n" +
      "// @version      2.5.1\r\n" +
      "// @match        https://*.example.com/*\r\n" +
      "// @match        *://mangadex.org/*\r\n" +
      "// @grant        GM_getValue\r\n" +
      "// @grant        GM_setValue\r\n" +
      "// @connect      api.mangadex.org\r\n" +
      "// @connect      *.example.com\r\n" +
      "// @noframes\r\n" +
      "// @run-at       document-start\r\n" +
      "// ==/UserScript==\r\n" +
      "console.log('hello');";

    const parsed = matcher.parseMetadata(scriptRaw);
    assert.strictEqual(parsed.name, 'Test Script');
    assert.strictEqual(parsed.version, '2.5.1');
    assert.strictEqual(parsed.matches.length, 2);
    assert.strictEqual(parsed.grants.length, 2);
    assert.strictEqual(parsed.connects.length, 2);
    assert.strictEqual(parsed.noframes, true);
    assert.strictEqual(parsed.runAt, 'document-start');
  });

  console.log('\n--- 2. Testing Matcher Engine 2.0 & Pipeline Reasons ---');

  it('Matches wildcard domain (*://*.youtube.com/*) with reason matched-by-match', () => {
    const script = { matches: ['*://*.youtube.com/*'] };
    const r1 = matcher.evaluate('https://www.youtube.com/watch?v=123', script);
    assert.strictEqual(r1.matched, true);
    assert.strictEqual(r1.reason, 'matched-by-match');

    const r2 = matcher.evaluate('https://vimeo.com/', script);
    assert.strictEqual(r2.matched, false);
    assert.strictEqual(r2.reason, 'not-matched');
  });

  it('Matches root domain without trailing slash (https://mangadex.org)', () => {
    const script = { matches: ['*://*.mangadex.org/*'] };
    assert.strictEqual(matcher.test('https://mangadex.org', script), true);
    assert.strictEqual(matcher.test('https://mangadex.org/', script), true);
    assert.strictEqual(matcher.test('https://mangadex.org/title/123', script), true);
    assert.strictEqual(matcher.test('https://auth.mangadex.org/login', script), true);
  });

  it('Matches complex multi-wildcard domains (e.g. *://*.truyenqq*.*/*)', () => {
    const script = { matches: ['*://*.truyenqq*.*/*'] };
    assert.strictEqual(matcher.test('https://truyenqqpro.com/chap-1', script), true);
    assert.strictEqual(matcher.test('https://truyenqq.net', script), true);
  });

  it('Enforces @exclude-match and @exclude with structured reason', () => {
    const script = {
      matches: ['*://*.mangadex.org/*'],
      excludes: ['*://*.mangadex.org/admin/*'],
      excludeMatches: ['*://*.mangadex.org/private/*']
    };
    const rNormal = matcher.evaluate('https://mangadex.org/chapter/1', script);
    assert.strictEqual(rNormal.matched, true);

    const rExc = matcher.evaluate('https://mangadex.org/admin/dashboard', script);
    assert.strictEqual(rExc.matched, false);
    assert.strictEqual(rExc.reason, 'excluded-by-exclude');

    const rExcMatch = matcher.evaluate('https://mangadex.org/private/user', script);
    assert.strictEqual(rExcMatch.matched, false);
    assert.strictEqual(rExcMatch.reason, 'excluded-by-exclude-match');
  });

  it('Blocks subframes when @noframes is set', () => {
    const script = { matches: ['*://*/*'], noframes: true };
    const rTop = matcher.evaluate('https://example.com', script, { isTopFrame: true });
    assert.strictEqual(rTop.matched, true);

    const rSub = matcher.evaluate('https://example.com', script, { isTopFrame: false });
    assert.strictEqual(rSub.matched, false);
    assert.strictEqual(rSub.reason, 'frame-blocked');
  });

  it('Domain Rule Block overrides matching pattern', () => {
    const script = { id: 's1', matches: ['*://*.mangadex.org/*'] };
    const domainRules = [{ domainPattern: 'mangadex.org', action: 'Block' }];
    const res = matcher.evaluate('https://mangadex.org', script, { domainRules: domainRules });
    assert.strictEqual(res.matched, false);
    assert.strictEqual(res.reason, 'domain-blocked');
  });

  it('Temporary Override takes highest priority over everything', () => {
    const script = { id: 's1', matches: ['*://*.mangadex.org/*'] };
    const domainRules = [{ domainPattern: 'mangadex.org', action: 'Block' }];
    const tempOverrides = { 's1': true };
    const res = matcher.evaluate('https://mangadex.org', script, { domainRules: domainRules, temporaryOverrides: tempOverrides });
    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.reason, 'temporary-override-allowed');
  });

  console.log('\n--- 3. Testing MatchExplanationEngine ---');

  it('Generates why script runs explanation with checklist', () => {
    const script = { id: 'manga_tool', name: 'Manga Tool', matches: ['*://*.mangadex.org/*'] };
    const exp = matcher.WhyScriptRuns(script, 'https://mangadex.org/title/123');
    assert.ok(exp);
    assert.strictEqual(exp.status, 'READY');
    assert.strictEqual(exp.runs, true);
    assert.ok(exp.checklist.length >= 4);
  });

  it('Generates why script does not run explanation with exact blocking reason', () => {
    const script = { id: 'manga_tool', name: 'Manga Tool', matches: ['*://*.mangadex.org/*'], excludes: ['*://*.mangadex.org/blocked/*'] };
    const exp = matcher.WhyScriptDoesNotRun(script, 'https://mangadex.org/blocked/123');
    assert.ok(exp);
    assert.strictEqual(exp.status, 'BLOCKED');
    assert.strictEqual(exp.reason, 'excluded-by-exclude');
  });

  console.log('\n--- 4. Testing JS Bridge Protocol 2.0 ---');
  const bridge = window.__US_Bridge;

  it('Formats valid protocol message with UUID and version', () => {
    const msg = bridge.createRequest('getValue', { key: 'foo' });
    assert.strictEqual(msg.type, 'GM_REQUEST');
    assert.strictEqual(msg.action, 'getValue');
    assert.strictEqual(msg.version, 1);
    assert.ok(msg.requestId);
    assert.strictEqual(msg.payload.key, 'foo');
  });

  it('Validates incoming message structure and detects malformed payloads', () => {
    assert.strictEqual(bridge.isValidMessage({ type: 'GM_REQUEST', action: 'test', requestId: 'req_123' }), true);
    assert.strictEqual(bridge.isValidMessage(null), false);
  });

  it('Dispatches events through bridge event listener system', () => {
    let received = null;
    function onEvent(payload) { received = payload; }
    bridge.on('testEvent', onEvent);
    bridge.emit('testEvent', { data: 999 });
    assert.deepStrictEqual(received, { data: 999 });
    bridge.off('testEvent', onEvent);
  });

  console.log('\n--- 5. Testing Scoped GM API Suite 3.0 ---');
  const contextA = window.__US_CreateRuntimeContext({ id: 'scriptA', name: 'Script A', connects: ['api.mangadex.org', 'self'] });
  const contextB = window.__US_CreateRuntimeContext({ id: 'scriptB', name: 'Script B', connects: ['*'] });

  it('Isolates default script-scoped GM_setValue between different scripts', () => {
    contextA.GM_setValue('theme', 'dark');
    contextB.GM_setValue('theme', 'light');
    assert.strictEqual(contextA.GM_getValue('theme'), 'dark');
    assert.strictEqual(contextB.GM_getValue('theme'), 'light');
  });

  it('Supports global-scoped storage shared between scripts', () => {
    contextA.GM_setValue('sharedFlag', 42, 'global');
    assert.strictEqual(contextB.GM_getValue('sharedFlag', null, 'global'), 42);
  });

  it('Supports domain-scoped storage based on window.location.hostname', () => {
    contextA.GM_setValue('siteFontSize', '16px', 'domain');
    assert.strictEqual(contextB.GM_getValue('siteFontSize', null, 'domain'), '16px');
  });

  it('Notifies value change listeners when GM_setValue is called', () => {
    let triggeredKey = null;
    let oldVal = null;
    let newVal = null;

    const listenerId = contextA.GM_addValueChangeListener('notifyTest', (k, o, n) => {
      triggeredKey = k;
      oldVal = o;
      newVal = n;
    });

    contextA.GM_setValue('notifyTest', 'initial');
    assert.strictEqual(triggeredKey, 'notifyTest');
    assert.strictEqual(newVal, 'initial');

    contextA.GM_setValue('notifyTest', 'updated');
    assert.strictEqual(oldVal, 'initial');
    assert.strictEqual(newVal, 'updated');

    contextA.GM_removeValueChangeListener(listenerId);
  });

  it('Tracks injected DOM styles in window.__US_DOMInspect', () => {
    const styleEl = contextA.GM_addStyle('body { background: black; }');
    assert.ok(window.__US_DOMInspect.injectedStyles.length > 0);
  });

  it('Verifies @connect allowlist in GM_xmlhttpRequest', () => {
    let errorCalled = false;
    let errorMsg = null;

    // contextA only allows api.mangadex.org and self. Unauthorized host should be blocked!
    contextA.GM_xmlhttpRequest({
      url: 'https://evil-tracking-site.com/steal-data',
      onerror: (err) => {
        errorCalled = true;
        errorMsg = err.error;
      }
    });

    assert.strictEqual(errorCalled, true);
    assert.strictEqual(errorMsg, 'blocked-by-policy');
  });

  await itAsync('Modern GM.* Promise API works seamlessly', async () => {
    await contextA.GM.setValue('promiseKey', 123);
    const val = await contextA.GM.getValue('promiseKey');
    assert.strictEqual(val, 123);
  });

  console.log('\n--- 6. Testing Injector, Duplicate Protection & Script Recovery ---');
  const injector = window.__US_Injector;

  it('Prevents duplicate execution of the same script in same frame', () => {
    const testScript = { id: 'dup_test', name: 'Duplicate Test', content: 'var a = 1;' };
    const r1 = injector.execute(testScript, window);
    const r2 = injector.execute(testScript, window);
    assert.strictEqual(r1, true);
    assert.strictEqual(r2, false);
  });

  it('Cleans up script resources and execution state on disposal', () => {
    injector.cleanupScript('dup_test');
    const testScript = { id: 'dup_test', name: 'Duplicate Test', content: 'var a = 1;' };
    const reExecuted = injector.execute(testScript, window);
    assert.strictEqual(reExecuted, true);
  });

  it('Automatically recovers and blocks script after 5 consecutive runtime crashes', () => {
    const crashingScript = {
      id: 'crash_test',
      name: 'Crashing Script',
      content: 'throw new Error("Deliberate Crash for Test");'
    };

    // Run 5 consecutive page attempts
    for (let i = 0; i < 5; i++) {
      injector.execute(crashingScript, { location: { pathname: '/fail', search: '?attempt=' + i } });
    }

    // 6th run intercepted by Script Recovery boundary
    const rBlocked = injector.execute(crashingScript, { location: { pathname: '/fail', search: '?attempt=6' } });
    assert.strictEqual(rBlocked, false);
    const state = injector.getScriptState('crash_test');
    assert.strictEqual(state.state, 'CrashBlocked');
  });

  console.log('\n===========================================');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('===========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
