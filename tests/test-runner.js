// Node.js Automated Test Suite for Userscript Extension Engine
// Tests: Matcher Engine, Bridge Protocol, GM API Isolation, and Injector Lifecycle

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup mock browser globals
global.window = global;
global.document = {
  readyState: 'complete',
  head: {
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
  console.log('\n--- 1. Testing Matcher Engine ---');
  const matcher = window.__US_Matcher;

  it('Matches wildcard domain (*://*.youtube.com/*)', () => {
    const script = { matches: ['*://*.youtube.com/*'] };
    assert.strictEqual(matcher.test('https://www.youtube.com/watch?v=123', script), true);
    assert.strictEqual(matcher.test('http://m.youtube.com/', script), true);
    assert.strictEqual(matcher.test('https://youtube.com/', script), true);
    assert.strictEqual(matcher.test('https://vimeo.com/', script), false);
  });

  it('Matches exact domain and port', () => {
    const script = { matches: ['http://localhost:8080/*'] };
    assert.strictEqual(matcher.test('http://localhost:8080/app', script), true);
    assert.strictEqual(matcher.test('http://localhost:3000/app', script), false);
  });

  it('Matches <all_urls>', () => {
    const script = { matches: ['<all_urls>'] };
    assert.strictEqual(matcher.test('https://anything.org/path', script), true);
  });

  it('Exclude rule strictly overrides match rule', () => {
    const script = {
      matches: ['*://*.google.com/*'],
      excludes: ['*://*.google.com/search*']
    };
    assert.strictEqual(matcher.test('https://www.google.com/maps', script), true);
    assert.strictEqual(matcher.test('https://www.google.com/search?q=userscript', script), false);
  });

  it('Handles legacy @include with regex and wildcards', () => {
    const script = { includes: ['https://*.github.com/*'] };
    assert.strictEqual(matcher.test('https://gist.github.com/test', script), true);
    assert.strictEqual(matcher.test('https://gitlab.com/test', script), false);
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
    assert.strictEqual(bridge.isValidMessage('not an object'), false);
    assert.strictEqual(bridge.isValidMessage({ noType: true }), false);
  });

  console.log('\n--- 3. Testing GM API Suite & Storage Isolation ---');
  const scriptA = { id: 'script_A', name: 'Script Alpha' };
  const scriptB = { id: 'script_B', name: 'Script Beta' };

  const ctxA = window.__US_CreateRuntimeContext(scriptA);
  const ctxB = window.__US_CreateRuntimeContext(scriptB);

  it('Isolates GM_setValue between different scripts', () => {
    ctxA.GM_setValue('shared_key', 'Value From Alpha');
    ctxB.GM_setValue('shared_key', 'Value From Beta');

    assert.strictEqual(ctxA.GM_getValue('shared_key'), 'Value From Alpha');
    assert.strictEqual(ctxB.GM_getValue('shared_key'), 'Value From Beta');
  });

  it('Supports GM_listValues and GM_deleteValue', () => {
    ctxA.GM_setValue('k1', 'val1');
    ctxA.GM_setValue('k2', 'val2');

    const keys = ctxA.GM_listValues();
    assert.ok(keys.includes('k1'));
    assert.ok(keys.includes('k2'));

    ctxA.GM_deleteValue('k1');
    assert.strictEqual(ctxA.GM_getValue('k1', 'fallback'), 'fallback');
  });

  it('GM_addStyle creates style elements safely', () => {
    const el = ctxA.GM_addStyle('body { background: black !important; }');
    assert.ok(el);
    assert.strictEqual(el.tagName, 'STYLE');
  });

  await itAsync('Modern GM.* Promise API resolves asynchronously', async () => {
    await ctxA.GM.setValue('promised_key', 42);
    const val = await ctxA.GM.getValue('promised_key');
    assert.strictEqual(val, 42);
  });

  console.log('\n--- 4. Testing Injector & Duplicate Protection ---');
  const injector = window.__US_Injector;

  it('Prevents duplicate execution of the same script in same frame', () => {
    const testScript = {
      id: 'duplicate_test_script',
      name: 'Duplicate Test',
      content: 'window.__duplicateTestExecuted = (window.__duplicateTestExecuted || 0) + 1;'
    };

    const firstRun = injector.executeScript(testScript, window);
    assert.strictEqual(firstRun, true);

    const secondRun = injector.executeScript(testScript, window);
    assert.strictEqual(secondRun, false); // Blocked duplicate!

    assert.strictEqual(window.__duplicateTestExecuted, 1);
  });

  it('Tracks script execution lifecycle status', () => {
    const status = injector.getScriptStatus('duplicate_test_script');
    assert.strictEqual(status, 'Loaded');
  });

  console.log('\n===========================================');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('===========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
