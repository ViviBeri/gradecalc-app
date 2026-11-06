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
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  load() {}
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
  const revoked = [];
  let created = 0;
  let resolveMedia;
  const devices = new FakeElement('section');
  devices.id = 'panel-devices';
  const document = {
    readyState: 'complete',
    hidden: false,
    createElement: tag => new FakeElement(tag),
    getElementById: id => id === 'panel-devices' ? devices : ids[id] || null,
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
      this.dataCallback = null;
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      Promise.resolve().then(() => { if (this.listeners.stop) this.listeners.stop(); });
    }
  }
  const context = {
    document, navigator,
    window: { addEventListener: (name, callback) => { windowListeners[name] = callback; } },
    MediaRecorder: FakeMediaRecorder,
    URL: { createObjectURL: () => { created += 1; return 'blob:audio'; }, revokeObjectURL: url => revoked.push(url) },
    Blob, console
  };
  function index(node) {
    if (node.id) ids[node.id] = node;
    node.children.forEach(index);
  }
  body.appendChild(devices);
  vm.runInNewContext(fs.readFileSync('js/media.js', 'utf8'), context);
  devices.children.forEach(index);
  function grant() {
    const track = { stop: () => stopped.push(true) };
    resolveMedia({ getTracks: () => [track] });
  }
  return { ids, devices, requested, stopped, revoked, document, documentListeners, windowListeners, grant, media: context.window.GradeCalcMedia, get created() { return created; } };
}

(async function () {
  const h = harness();
  assert.ok(h.ids['media-camera-start'], 'camera controls are created');
  assert.ok(h.ids['media-mic-start'], 'microphone controls are created');
  assert.equal(h.requested.length, 0, 'permissions are not requested on module load');

  h.ids['media-camera-start'].click();
  assert.equal(h.requested[0].video, true, 'camera asks for video after explicit action');
  assert.equal(h.requested[0].audio, false, 'camera does not request microphone access');
  h.grant();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.ids['media-camera-stop'].disabled, false, 'camera stop is enabled after camera starts');
  h.document.hidden = true;
  h.documentListeners.visibilitychange();
  assert.equal(h.ids['media-camera-stop'].disabled, true, 'backgrounding stops camera');
  assert.equal(h.stopped.length, 1, 'camera track is released');


  const delayed = harness();
  delayed.ids['media-camera-start'].click();
  delayed.document.hidden = true;
  delayed.documentListeners.visibilitychange();
  delayed.document.hidden = false;
  delayed.grant();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(delayed.stopped.length, 1, 'late camera permission response releases the stream');
  assert.equal(delayed.ids['media-camera-stop'].disabled, true, 'late camera permission cannot reactivate capture');
  assert.equal(delayed.ids['media-camera-start'].disabled, false, 'camera remains ready for a fresh user action');

  const delayedMic = harness();
  delayedMic.ids['media-mic-start'].click();
  assert.equal(delayedMic.requested[0].audio, true, 'microphone requests audio after explicit action');
  assert.equal(delayedMic.requested[0].video, false, 'microphone never requests camera access');
  delayedMic.document.hidden = true;
  delayedMic.documentListeners.visibilitychange();
  delayedMic.document.hidden = false;
  delayedMic.grant();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(delayedMic.stopped.length, 1, 'late microphone permission response releases the stream');
  assert.equal(delayedMic.ids['media-mic-stop'].disabled, true, 'late microphone permission cannot start recording');

  const cleanup = harness();
  cleanup.ids['media-photo-preview'].src = 'data:image/jpeg;base64,test';
  cleanup.ids['media-photo-preview'].hidden = false;
  cleanup.ids['media-audio-playback'].src = 'blob:old-audio';
  cleanup.ids['media-audio-playback'].hidden = false;
  cleanup.media.stopAll();
  assert.equal(cleanup.ids['media-photo-preview'].hidden, true, 'leaving media feature hides captured photo');
  assert.equal(cleanup.ids['media-photo-preview'].src, '', 'leaving media feature clears captured photo data');
  assert.equal(cleanup.ids['media-audio-playback'].hidden, true, 'leaving media feature hides audio playback');
  assert.equal(cleanup.ids['media-audio-playback'].src, '', 'leaving media feature clears audio playback source');

  const recordingCleanup = harness();
  recordingCleanup.ids['media-mic-start'].click();
  recordingCleanup.grant();
  await Promise.resolve();
  await Promise.resolve();
  recordingCleanup.media.stopAll();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(recordingCleanup.ids['media-audio-playback'].hidden, true, 'async recorder stop cannot restore playback after cleanup');
  assert.equal(recordingCleanup.ids['media-audio-playback'].src, '', 'async recorder stop leaves playback source empty');
  assert.equal(recordingCleanup.created, 0, 'discarded recording does not create a temporary audio URL');

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

  const appHtml = fs.readFileSync('index.html', 'utf8');
  assert.match(appHtml, /function switchTab\(tab, btn\)\s*\{\s*if \(tab !== 'devices' && window\.GradeCalcMedia\) window\.GradeCalcMedia\.stopAll\(\);/, 'switching away from Devices stops all media sessions');

  assert.equal(typeof h.windowListeners.pagehide, 'function', 'pagehide cleanup handler is registered');
  assert.equal(typeof h.windowListeners.beforeunload, 'function', 'beforeunload cleanup handler is registered');

  console.log('Media feature tests passed (explicit permissions, camera stop, and delayed permission cleanup).');
})().catch(error => { console.error(error); process.exitCode = 1; });
