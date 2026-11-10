'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.value = '';
    this.id = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { if (this.listeners.click && !this.disabled) this.listeners.click(); }
}

function createHarness(options = {}) {
  const ids = {};
  const tabBar = new FakeElement('div');
  const body = new FakeElement('div');
  const documentListeners = {};
  const windowListeners = {};
  const battery = options.battery || {
    level: 0.76,
    charging: true,
    listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    removeEventListener(name) { delete this.listeners[name]; }
  };
  function findElement(node, id) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findElement(child, id);
      if (found) return found;
    }
    return null;
  }
  const document = {
    readyState: 'complete',
    hidden: false,
    createElement: tag => new FakeElement(tag),
    querySelector: selector => selector === '.tab-bar' ? tabBar : selector === '.body' ? body : null,
    getElementById: id => findElement(body, id) || findElement(tabBar, id) || ids[id] || null,
    addEventListener: (name, callback) => { documentListeners[name] = callback; }
  };
  const navigator = options.noBattery ? {} : {
    getBattery: () => options.batteryReject ? Promise.reject(new Error('Unavailable')) : Promise.resolve(battery)
  };
  const intervalCalls = [];
  const clearedIntervals = [];
  const window = {
    addEventListener: (name, callback) => { windowListeners[name] = callback; },
    setInterval: (callback, delay) => { intervalCalls.push({ callback, delay }); return intervalCalls.length; },
    clearInterval: id => { clearedIntervals.push(id); },
    switchTab: () => {},
    GradeCalcDeviceApi: options.api
  };
  const storage = new Map(Object.entries(options.storage || {}));
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => {
      if (options.storageWriteFails) throw new Error('Storage unavailable');
      storage.set(key, String(value));
    }
  };
  const context = { document, navigator, window, localStorage, console, Date };
  vm.runInNewContext(fs.readFileSync('js/device.js', 'utf8'), context);
  function indexTree(node) {
    if (node.id) ids[node.id] = node;
    node.children.forEach(indexTree);
  }
  body.children.forEach(indexTree);
  tabBar.children.forEach(indexTree);
  return { ids, tabBar, body, battery, document, documentListeners, windowListeners, storage, window, intervalCalls, clearedIntervals };
}

async function run() {
  const h = createHarness({ storage: { gradecalc_device_name: 'Study phone' } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.ids['device-local-name'].value, 'Study phone');
  assert.equal(h.ids['device-display-name'].textContent, 'Study phone');
  assert.equal(h.ids['device-battery-status'].textContent, '76% · Charging');
  assert.equal(h.ids['device-consent-setup'].hidden, false, 'first use shows the consent setup');
  h.ids['device-local-name'].value = 'Beri phone';
  h.ids['device-save-name'].click();
  assert.equal(h.storage.get('gradecalc_device_name'), 'Beri phone');
  assert.equal(h.ids['device-display-name'].textContent, 'Beri phone');
  assert.match(h.ids['device-name-status'].textContent, /saved on this device/);
  h.ids['device-local-name'].value = '   ';
  h.ids['device-save-name'].click();
  assert.match(h.ids['device-name-status'].textContent, /between 1 and 60/);
  h.ids['device-local-name'].value = 'x'.repeat(61);
  h.ids['device-save-name'].click();
  assert.match(h.ids['device-name-status'].textContent, /between 1 and 60/);

  const consentBlocked = createHarness({ api: {
    getSettings: async () => ({ apiUrl: '', deviceToken: '', deviceScopes: [] })
  } });
  await consentBlocked.window.GradeCalcDeviceFeatures.refreshDeviceState();
  assert.equal(consentBlocked.ids['device-consent-setup'].hidden, false, 'setup remains visible before consent');
  assert.equal(consentBlocked.ids['device-enroll-form'].hidden, true, 'enrollment stays locked until consent is recorded');

  const storageFailure = createHarness({ storageWriteFails: true, storage: { gradecalc_device_setup_consent_v1: 'accepted' } });
  storageFailure.ids['device-local-name'].value = 'Backup phone';
  storageFailure.ids['device-save-name'].click();
  assert.match(storageFailure.ids['device-name-status'].textContent, /could not save/);
  assert.ok(storageFailure.ids['device-enroll-form'], 'device enrollment form is available');
  assert.ok(storageFailure.ids['device-enroll-button'], 'enrollment requires a one-time dashboard invitation');
  assert.match(storageFailure.ids['device-pairing-status'].textContent, /Remote connection is unavailable/);

  const pending = createHarness({ storage: { gradecalc_device_setup_consent_v1: 'accepted' }, api: {
    getSettings: async () => ({ apiUrl: 'https://worker.example', deviceToken: 'a'.repeat(43), deviceScopes: ['battery'] }),
    getDeviceStatus: async () => ({ status: 'pending', deviceApprovedAt: null })
  } });
  await pending.window.GradeCalcDeviceFeatures.refreshDeviceState();
  assert.equal(pending.intervalCalls.length, 1, 'pending enrollment keeps polling for dashboard approval');
  assert.equal(pending.intervalCalls[0].delay, 10000);
  assert.equal(pending.clearedIntervals.length, 0, 'pending polling is not cleared with telemetry timers');

  const noBattery = createHarness({ noBattery: true });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.match(noBattery.ids['device-battery-status'].textContent, /Not available/);

  const backgrounded = createHarness();
  await Promise.resolve();
  backgrounded.document.hidden = true;
  backgrounded.documentListeners.visibilitychange();
  assert.equal(Object.keys(backgrounded.battery.listeners).length, 0, 'hiding the page removes battery listeners');

  const deviceSource = fs.readFileSync('js/device.js', 'utf8');
  assert.doesNotMatch(deviceSource, /geolocation|latitude|longitude|openstreetmap/i);
  assert.doesNotMatch(deviceSource, /navigator\.connection|effectiveType|SSID|BSSID/i);
  console.log('Device feature tests passed (local device label, battery preview, enrollment controls, and privacy exclusions).');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
