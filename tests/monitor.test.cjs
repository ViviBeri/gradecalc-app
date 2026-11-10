'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync('monitor/index.html', 'utf8');
const dashboard = fs.readFileSync('js/monitor-dashboard.js', 'utf8');
const apiClient = fs.readFileSync('js/device-api-client.js', 'utf8');

test('dashboard exposes private setup, one-time enrollment and dual approval controls', () => {
  assert.match(html, /Private dashboard/);
  assert.match(html, /id="setup-form"/);
  assert.match(html, /id="create-invite"/);
  assert.match(html, /id="remote-devices"/);
  assert.match(html, /id="remote-media"/);
  assert.match(html, /data-device-scope value="media"/);
  assert.match(html, /on-device approval, and separate dashboard approval/i);
  assert.match(html, /device-api-client\.js/);
  assert.match(html, /monitor-dashboard\.js/);
});

test('dashboard and API client do not collect location or network data', () => {
  assert.doesNotMatch(html + dashboard + apiClient, /geolocation|latitude|longitude|openstreetmap|navigator\.connection|effectiveType|SSID|BSSID/i);
});

test('dashboard never activates local camera or microphone', () => {
  assert.doesNotMatch(html + dashboard, /getUserMedia\s*\(|MediaRecorder/);
  assert.match(html, /Camera is not opened/);
  assert.match(html, /Microphone is not opened/);
  assert.match(html, /permissions\.query/);
});

test('owner and device credentials use IndexedDB rather than localStorage', () => {
  assert.match(apiClient, /indexedDB\.open/);
  assert.match(apiClient, /ownerToken/);
  assert.match(apiClient, /deviceToken/);
  assert.doesNotMatch(apiClient, /localStorage|sessionStorage|document\.cookie/);
});

test('media upload requires an explicit API call and media file', () => {
  assert.match(apiClient, /async function uploadMedia\(file\)/);
  assert.match(apiClient, /\/v1\/media/);
  assert.match(dashboard, /create-invite/);
  assert.match(dashboard, /Delete permanently/);
});

test('dashboard inline JavaScript parses', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, 'inline browser preview script exists');
  scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script[1])));
});

test('dashboard does not store telemetry snapshots in browser storage', () => {
  assert.doesNotMatch(html + dashboard, /localStorage|sessionStorage|indexedDB/);
});
