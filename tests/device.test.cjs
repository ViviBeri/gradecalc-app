'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
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
  const document = {
    readyState: 'complete',
    hidden: false,
    createElement: tag => new FakeElement(tag),
    querySelector: selector => selector === '.tab-bar' ? tabBar : selector === '.body' ? body : null,
    getElementById: id => ids[id] || null,
    addEventListener: (name, callback) => { documentListeners[name] = callback; }
  };
  const navigator = options.noBattery ? {} : {
    getBattery: () => options.batteryReject ? Promise.reject(new Error('Unavailable')) : Promise.resolve(battery)
  };
  const window = {
    addEventListener: (name, callback) => { windowListeners[name] = callback; },
    switchTab: () => {}
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
  return { ids, tabBar, body, battery, document, documentListeners, windowListeners, storage };
}

async function run() {
  const h = createHarness({ storage: { gradecalc_device_name: 'Study phone' } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.ids['device-local-name'].value, 'Study phone');
  assert.equal(h.ids['device-display-name'].textContent, 'Study phone');
  assert.equal(h.ids['device-battery-status'].textContent, '76% · Charging');
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

  const storageFailure = createHarness({ storageWriteFails: true });
  storageFailure.ids['device-local-name'].value = 'Backup phone';
  storageFailure.ids['device-save-name'].click();
  assert.match(storageFailure.ids['device-name-status'].textContent, /could not save/);
  assert.ok(storageFailure.ids['device-add-device'].disabled, 'remote pairing stays disabled until secure enrollment is connected');

  const noBattery = createHarness({ noBattery: true });
  await Promise.resolve();
  assert.match(noBattery.ids['device-battery-status'].textContent, /Not available/);

  const backgrounded = createHarness();
  await Promise.resolve();
  backgrounded.document.hidden = true;
  backgrounded.documentListeners.visibilitychange();
  assert.equal(Object.keys(backgrounded.battery.listeners).length, 0, 'hiding the page removes battery listeners');

  const deviceSource = fs.readFileSync('js/device.js', 'utf8');
  assert.doesNotMatch(deviceSource, /geolocation|Location|latitude|longitude|openstreetmap/i);
  assert.doesNotMatch(deviceSource, /navigator\.connection|effectiveType|SSID|BSSID/i);
  console.log('Device feature tests passed (local device label, battery preview, pairing guard, and privacy exclusions).');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
