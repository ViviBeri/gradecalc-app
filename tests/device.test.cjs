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
    this.href = '';
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
  let watchCallback;
  let errorCallback;
  let nextWatchId = 41;
  const cleared = [];
  const documentListeners = {};
  const document = {
    readyState: 'complete',
    hidden: false,
    createElement: tag => new FakeElement(tag),
    querySelector: selector => selector === '.tab-bar' ? tabBar : selector === '.body' ? body : null,
    getElementById: id => ids[id] || null,
    addEventListener: (name, callback) => { documentListeners[name] = callback; }
  };
  const navigator = {
    geolocation: options.noGeolocation ? null : {
      watchPosition(success, failure) {
        if (options.watchThrows) throw new Error('Geolocation unavailable');
        watchCallback = success;
        errorCallback = failure;
        return nextWatchId;
      },
      clearWatch(id) { cleared.push(id); }
    }
  };
  const window = {
    isSecureContext: options.secure !== false,
    addEventListener: () => {},
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
  const context = {
    document, navigator, window, localStorage, console,
    Date, encodeURIComponent,
  };
  vm.runInNewContext(fs.readFileSync('js/device.js', 'utf8'), context);
  function indexTree(node) {
    if (node.id) ids[node.id] = node;
    node.children.forEach(indexTree);
  }
  body.children.forEach(indexTree);
  tabBar.children.forEach(indexTree);
  return { ids, tabBar, body, cleared, navigator, window, storage, document, documentListeners,
    emitPosition: position => watchCallback(position),
    emitError: error => errorCallback(error) };
}

const h = createHarness({ storage: { gradecalc_device_name: 'Study phone' } });
assert.equal(h.ids['device-local-name'].value, 'Study phone', 'saved local device name is restored');
assert.equal(h.ids['device-display-name'].textContent, 'Study phone', 'saved name appears in device identity');
h.ids['device-local-name'].value = 'Beri phone';
h.ids['device-save-name'].click();
assert.equal(h.storage.get('gradecalc_device_name'), 'Beri phone', 'device name saves locally');
assert.equal(h.ids['device-display-name'].textContent, 'Beri phone', 'device identity updates after saving');
assert.match(h.ids['device-name-status'].textContent, /saved on this device/);
h.ids['device-local-name'].value = '   ';
h.ids['device-save-name'].click();
assert.match(h.ids['device-name-status'].textContent, /between 1 and 60/);
h.ids['device-local-name'].value = 'x'.repeat(61);
h.ids['device-save-name'].click();
assert.match(h.ids['device-name-status'].textContent, /between 1 and 60/, 'names longer than 60 characters are rejected');

const storageFailure = createHarness({ storageWriteFails: true });
storageFailure.ids['device-local-name'].value = 'Backup phone';
storageFailure.ids['device-save-name'].click();
assert.match(storageFailure.ids['device-name-status'].textContent, /could not save/, 'storage failures are shown clearly');
assert.ok(h.ids['device-start-location'], 'device tab builds a location preview control');
assert.equal(h.ids['device-stop-location'].disabled, true, 'stop is disabled before consent');
assert.equal(h.ids['device-location-status'].textContent, 'Location permission has not been requested.');

h.ids['device-start-location'].click();
assert.equal(h.ids['device-start-location'].disabled, true, 'start is disabled while requesting location');
assert.equal(h.ids['device-stop-location'].disabled, false, 'stop is available while location is active');
h.emitPosition({ coords: { latitude: 11.93, longitude: 79.83, accuracy: 12 }, timestamp: 1000 });
assert.match(h.ids['device-location-details'].textContent, /Latitude 11\.93000/);
assert.match(h.ids['device-location-details'].textContent, /Accuracy about 12 m/);
assert.match(h.ids['device-open-map'].href, /openstreetmap\.org/);
assert.equal(h.ids['device-open-map'].hidden, false);

h.ids['device-stop-location'].click();
assert.deepEqual(h.cleared, [41], 'stop clears the active geolocation watch');
h.emitPosition({ coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: 2000 });
assert.match(h.ids['device-location-details'].textContent, /only while you actively share/, 'late location callbacks are ignored after stop');
assert.equal(h.ids['device-stop-location'].disabled, true);
assert.equal(h.ids['device-start-location'].disabled, false);
assert.equal(h.ids['device-open-map'].hidden, true);
assert.match(h.ids['device-location-status'].textContent, /uploaded or saved/);

const backgrounded = createHarness();
backgrounded.ids['device-start-location'].click();
backgrounded.document.hidden = true;
backgrounded.documentListeners.visibilitychange();
assert.deepEqual(backgrounded.cleared, [41], 'hiding the page stops foreground location access');
assert.equal(backgrounded.ids['device-stop-location'].disabled, true);
assert.equal(backgrounded.ids['device-start-location'].disabled, false);

const denied = createHarness();
denied.ids['device-start-location'].click();
denied.emitError({ code: 1 });
assert.deepEqual(denied.cleared, [41], 'permission failure clears the watch');
assert.match(denied.ids['device-location-status'].textContent, /permission was denied/);
assert.equal(denied.ids['device-start-location'].disabled, false);

const insecure = createHarness({ secure: false });
insecure.ids['device-start-location'].click();
assert.match(insecure.ids['device-location-status'].textContent, /secure HTTPS/);
assert.equal(insecure.ids['device-stop-location'].disabled, true);

const startFailure = createHarness({ watchThrows: true });
startFailure.ids['device-start-location'].click();
assert.equal(startFailure.ids['device-start-location'].disabled, false, 'start is re-enabled if the browser throws');
assert.equal(startFailure.ids['device-stop-location'].disabled, true, 'stop remains disabled if location never starts');
assert.match(startFailure.ids['device-location-status'].textContent, /could not start location access/);

const unsupported = createHarness({ noGeolocation: true });
unsupported.ids['device-start-location'].click();
assert.match(unsupported.ids['device-location-status'].textContent, /does not support location/);

console.log('Device feature tests passed (consent, location update, map link, stop, denial, HTTPS and unsupported browser).');
