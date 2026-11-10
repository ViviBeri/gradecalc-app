'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

let worker;
test.before(async () => {
  worker = await import('../worker/src/index.mjs');
});

test('D1 schema enforces a single owner and two-sided device approval', () => {
  const schema = fs.readFileSync('worker/migrations/0001_init.sql', 'utf8');
  assert.match(schema, /singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK\(singleton = 1\)/);
  assert.match(schema, /device_approved_at INTEGER/);
  assert.match(schema, /owner_approved_at INTEGER/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS media_objects/);
  assert.match(schema, /object_key TEXT NOT NULL UNIQUE/);
});

test('device scopes exclude location and network', () => {
  assert.deepEqual(worker.ALLOWED_SCOPES, ['battery', 'device', 'permissionStatus', 'appStatus', 'media']);
  assert.throws(() => worker.normalizeScopes(['location']), TypeError);
  assert.throws(() => worker.normalizeScopes(['network']), TypeError);
  assert.throws(() => worker.normalizeScopes(['battery', 'battery']), TypeError);
});

test('battery telemetry accepts bounded values only', () => {
  assert.equal(worker.validateSnapshot({
    battery: { level: 0.73, charging: true }
  }, ['battery']), true);
  assert.equal(worker.validateSnapshot({
    battery: { level: 1.1, charging: false }
  }, ['battery']), false);
  assert.equal(worker.validateSnapshot({
    battery: { level: 0.5, charging: false, serial: 'private' }
  }, ['battery']), false);
});

test('device telemetry excludes hardware identifiers', () => {
  assert.equal(worker.validateSnapshot({
    device: { platform: 'android', appVersion: '1.2.0' }
  }, ['device']), true);
  assert.equal(worker.validateSnapshot({
    device: { platform: 'android', appVersion: '1.2.0', serial: 'secret' }
  }, ['device']), false);
});

test('permission telemetry is status-only and app heartbeat is bounded', () => {
  assert.equal(worker.validateSnapshot({
    permissionStatus: { camera: 'granted', microphone: 'denied' },
    appStatus: { active: true }
  }, ['permissionStatus', 'appStatus']), true);
  assert.equal(worker.validateSnapshot({
    permissionStatus: { camera: 'granted', microphone: 'granted', audio: true }
  }, ['permissionStatus']), false);
  assert.equal(worker.validateSnapshot({
    appStatus: { active: false, hidden: true }
  }, ['appStatus']), false);
});

test('telemetry rejects location, network, media payloads and ungranted scopes', () => {
  assert.equal(worker.validateSnapshot({
    location: { latitude: 11.9, longitude: 79.8 }
  }, ['battery']), false);
  assert.equal(worker.validateSnapshot({
    network: { online: true }
  }, ['battery']), false);
  assert.equal(worker.validateSnapshot({
    media: { file: 'photo.jpg' }
  }, ['media']), false, 'media bytes never enter telemetry');
  assert.equal(worker.validateSnapshot({
    battery: { level: 0.5, charging: false },
    device: { platform: 'android', appVersion: '1.0' }
  }, ['battery']), false);
});

test('API path matching accepts only exact device and media identifiers', () => {
  const id = 'abcdefghijklmnopqrstuv';
  assert.equal(worker.pathId('/v1/devices/' + id + '/approve', '/v1/devices/', '/approve'), id);
  assert.equal(worker.pathId('/v1/media/' + id, '/v1/media/'), id);
  assert.equal(worker.pathId('/v1/devices/' + id + '/approve/extra', '/v1/devices/', '/approve'), null);
  assert.equal(worker.pathId('/v1/media/../../owners', '/v1/media/'), null);
});

test('random enrollment tokens have high entropy and URL-safe encoding', () => {
  const first = worker.randomToken();
  const second = worker.randomToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test('constant-time comparison handles equal, unequal, and empty inputs', () => {
  assert.equal(worker.constantTimeEqual('same', 'same'), true);
  assert.equal(worker.constantTimeEqual('same', 'diff'), false);
  assert.equal(worker.constantTimeEqual('', ''), true);
  assert.equal(worker.constantTimeEqual(null, 'x'), false);
});
