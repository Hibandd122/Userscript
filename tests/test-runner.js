// Node.js Automated Test Suite for Userscript Extension Engine 2.0
// Tests: Matcher Engine 2.0, Bridge Protocol, Scoped GM API, Injector Lifecycle, Script Recovery, and Network Inspector

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup mock browser globals
global.window = global;
global.window.location = { href: 'https://mangadex.org/title/123', hostname: 'mangadex.org' };
global.document = {
  readyState: 'complete',
  head: {
    appendChild: (el) => el
  },
  body: {
    appendChild: (el) => el
  },
  documentElement: {
    appendChild: (el) => el
  },
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    setAttribute: () => {},
    parentNode: { removeChild: () => {} }
  }),
  addEventListener: () => {}
};

// Robust mock localStorage supporting length and key(index)
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

// Load modules
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
  console.log('\n--- 1. Testing Matcher Engine 2.0 & Domain Hierarchy ---');
  const matcher = window.__US_Matcher;

  it('Matches wildcard domain (*://*.youtube.com/*)', () => {
    const script = { matches: ['*://*.youtube.com/*'] };
    assert.strictEqual(matcher.test('https://www.youtube.com/watch?v=123', script), true);
    assert.strictEqual(matcher.test('http://m.youtube.com/', script), true);
    assert.strictEqual(matcher.test('https://youtube.com/', script), true);
    assert.strictEqual(matcher.test('https://vimeo.com/', script), false);
  });

  it('Matches root domain without trailing slash (e.g. https://mangadex.org with *://*.mangadex.org/*)', () => {
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

  it('Domain Rule Block overrides matching pattern (Phase 3)', () => {
    const script = { id: 's1', matches: ['*://*.mangadex.org/*'] };
    const domainRules = [{ domainPattern: 'mangadex.org', action: 'Block' }];
    assert.strictEqual(matcher.test('https://mangadex.org', script, domainRules), false);
  });

  it('Temporary Override takes highest priority over everything (Phase 4)', () => {
    const script = { id: 's1', matches: ['*://*.mangadex.org/*'] };
    const domainRules = [{ domainPattern: 'mangadex.org', action: 'Block' }];
    const tempOverrides = { 's1': true };
    assert.strictEqual(matcher.test('https://mangadex.org', script, domainRules, tempOverrides), true);
  });

  console.log('\n--- 2. Testing JS Bridge Protocol ---');
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

  console.log('\n--- 3. Testing Scoped GM API Suite (Phase 5) ---');
  const contextA = window.__US_CreateRuntimeContext({ id: 'scriptA', name: 'Script A' });
  const contextB = window.__US_CreateRuntimeContext({ id: 'scriptB', name: 'Script B' });

  it('Isolates default script-scoped GM_setValue between different scripts', () => {
    contextA.GM_setValue('theme', 'dark');
    contextB.GM_setValue('theme', 'light');
    assert.strictEqual(contextA.GM_getValue('theme'), 'dark');
    assert.strictEqual(contextB.GM_getValue('theme'), 'light');
  });

  it('Supports global-scoped storage shared between scripts (Phase 5)', () => {
    contextA.GM_setValue('sharedFlag', 42, 'global');
    assert.strictEqual(contextB.GM_getValue('sharedFlag', null, 'global'), 42);
  });

  it('Supports domain-scoped storage based on window.location.hostname (Phase 5)', () => {
    contextA.GM_setValue('siteFontSize', '16px', 'domain');
    assert.strictEqual(contextB.GM_getValue('siteFontSize', null, 'domain'), '16px');
  });

  it('Tracks injected DOM styles in window.__US_DOMInspect (Phase 22)', () => {
    contextA.GM_addStyle('body { background: black; }');
    assert.ok(window.__US_DOMInspect.injectedStyles.length > 0);
  });

  console.log('\n--- 4. Testing Injector, Duplicate Protection & Script Recovery (Phase 18) ---');
  const injector = window.__US_Injector;

  it('Prevents duplicate execution of the same script in same frame', () => {
    const testScript = { id: 'dup_test', name: 'Duplicate Test', content: 'var a = 1;' };
    const r1 = injector.execute(testScript, window);
    const r2 = injector.execute(testScript, window);
    assert.strictEqual(r1, true);
    assert.strictEqual(r2, false);
  });

  it('Automatically recovers and blocks script after 5 consecutive runtime crashes (Phase 18)', () => {
    const crashingScript = {
      id: 'crash_test',
      name: 'Crashing Script',
      content: 'throw new Error("Deliberate Crash for Test");'
    };

    // Run 5 consecutive page reloads to hit threshold
    for (let i = 0; i < 5; i++) {
      injector.execute(crashingScript, { location: { href: 'https://test.com/fail?attempt=' + i } });
    }

    // 6th run should be intercepted by Script Recovery boundary
    const rBlocked = injector.execute(crashingScript, { location: { href: 'https://test.com/fail?attempt=6' } });
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
