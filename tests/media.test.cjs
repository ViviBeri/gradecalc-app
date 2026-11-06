'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  click() { if (this.listeners.click && !this.disabled) this.listeners.click(); }
  pause() {}
  play() { return Promise.resolve(); }
}

function harness() {
  const ids = {};
  const body = new FakeElement('div');
  const documentListeners = {};
  const windowListeners = {};
  const requested = [];
  const stopped = [];
  let resolveMedia;
  const document = {
    readyState: 'complete',
    hidden: false,
    createElement: tag => new FakeElement(tag),
    getElementById: id => ids[id] || null,
    getElementByIdForBuild: id => ids[id] || null,
    getElementByIdExisting: id => ids[id] || null,
    querySelector: () => null,
    addEventListener: (name, callback) => { documentListeners[name] = callback; }
  };
  const navigator = {
    mediaDevices: {
      getUserMedia(constraints) {
        requested.push(constraints);
        return new Promise(resolve => { resolveMedia = resolve; });
      }
    }
  };
  class FakeMediaRecorder {
    constructor(stream) {
      this.stream = stream;
      this.state = 'inactive';
      this.listeners = {};
      this.mimeType = 'audio/webm';
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      if (this.listeners.stop) this.listeners.stop();
    }
  }
  const context = {
    document, navigator,
    window: { addEventListener: (name, callback) => { windowListeners[name] = callback; } },
    MediaRecorder: FakeMediaRecorder,
    URL: { createObjectURL: () => 'blob:audio', revokeObjectURL: () => {} },
    Blob, console
  };
  vm.runInNewContext(fs.readFileSync('js/media.js', 'utf8'), context);
  function index(node) {
    if (node.id) ids[node.id] = node;
    node.children.forEach(index);
  }
  // Simulate the Devices panel created by device.js before media.js loads.
  const devices = new FakeElement('section');
  devices.id = 'panel-devices';
  body.appendChild(devices);
  // Rebuild with the actual expected parent and index the appended controls.
  context.document.getElementById = id => id === 'panel-devices' ? devices : ids[id] || null;
  // media.js builds immediately; index after the module has appended its controls.
  devices.children.forEach(index);
  function grant() {
    const track = { stop: () => stopped.push(true) };
    resolveMedia({ getTracks: () => [track] });
  }
  return { ids, devices, requested, stopped, document, documentListeners, windowListeners, grant };
}

(async function () {
  const h = harness();
  assert.ok(h.ids['media-camera-start'], 'camera controls are created');
  assert.ok(h.ids['media-mic-start'], 'microphone controls are created');
  assert.equal(h.requested.length, 0, 'permissions are not requested on module load');

  h.ids['media-camera-start'].click();
  assert.deepEqual(h.requested[0], { video: true, audio: false }, 'camera asks only for video after explicit action');
  h.grant();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.ids['media-camera-stop'].disabled, false, 'camera stop is enabled after camera starts');
  h.document.hidden = true;
  h.documentListeners.visibilitychange();
  assert.equal(h.ids['media-camera-stop'].disabled, true, 'backgrounding stops camera');
  assert.equal(h.stopped.length, 1, 'camera track is released');

  const unavailable = harness();
  unavailable.document.hidden = false;
  // The feature reports unsupported APIs without requesting permissions.
  const unsupportedContext = {
    document: unavailable.document,
    navigator: {},
    window: { addEventListener: () => {} },
    console
  };
  vm.runInNewContext(fs.readFileSync('js/media.js', 'utf8'), unsupportedContext);
  assert.match(unavailable.ids['media-camera-status'].textContent, /Camera is off/);

  console.log('Media feature tests passed (no launch capture, explicit camera request, video-only permission, stop on background).');
})().catch(error => { console.error(error); process.exitCode = 1; });
