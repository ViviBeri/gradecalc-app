'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync('monitor/index.html', 'utf8');

test('monitor is opt-in, local-only, and clears on background', () => {
  assert.match(html, /Start local monitoring/);
  assert.match(html, /Local preview only/);
  assert.match(html, /No data is uploaded, saved, or shared/);
  assert.match(html, /document\.hidden&&active\)stop\(\)/);
  assert.match(html, /window\.addEventListener\('pagehide',stop\)/);
  assert.match(html, /clearWatch\(watch\)/);
  assert.match(html, /session!==token/);
  assert.doesNotMatch(html, /fetch\(|sendBeacon\(|XMLHttpRequest|WebSocket|firebase\.firestore/);
});

test('monitor inline JavaScript parses', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline monitor script exists');
  assert.doesNotThrow(() => new vm.Script(script[1]));
});

test('monitor never captures camera or microphone media', () => {
  assert.doesNotMatch(html, /getUserMedia\s*\(/);
  assert.doesNotMatch(html, /MediaRecorder/);
  assert.match(html, /Permission status only/);
  assert.match(html, /permission\('camera'/);
  assert.match(html, /permission\('microphone'/);
});

test('monitor uses device geolocation only and has no network-location fallback', () => {
  assert.match(html, /navigator\.geolocation\.watchPosition/);
  assert.doesNotMatch(html, /ipapi|ipinfo|ipify|ipwho\.is|geoip|geolocation-db/i);
  assert.doesNotMatch(html, /navigator\.connection\.[^;]*(?:latitude|longitude)/i);
});

test('monitor does not persist device telemetry', () => {
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.match(html, /No data is uploaded, saved, or shared/);
});
