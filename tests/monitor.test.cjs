'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync('monitor/index.html', 'utf8');

test('dashboard clearly identifies the local-only state and disabled remote enrollment', () => {
  assert.match(html, /Dashboard preview/);
  assert.match(html, /Remote enrollment and synchronization are not active yet/);
  assert.match(html, /No remote devices connected/);
  assert.match(html, /id="add-device"[^>]*disabled/);
  assert.doesNotMatch(html, /fetch\(|sendBeacon\(|XMLHttpRequest|WebSocket|firebase\.firestore/);
});

test('dashboard displays battery, device and permission status without opening sensors', () => {
  assert.match(html, /getBattery/);
  assert.match(html, /permissions\.query/);
  assert.doesNotMatch(html, /getUserMedia\s*\(/);
  assert.doesNotMatch(html, /MediaRecorder/);
  assert.match(html, /Camera is not opened/);
  assert.match(html, /Microphone is not opened/);
});

test('dashboard excludes location and network data entirely', () => {
  assert.doesNotMatch(html, /geolocation|latitude|longitude|openstreetmap|navigator\.connection|effectiveType|SSID|BSSID/i);
});

test('dashboard inline JavaScript parses', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline dashboard script exists');
  assert.doesNotThrow(() => new vm.Script(script[1]));
});

test('dashboard does not persist device telemetry', () => {
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
