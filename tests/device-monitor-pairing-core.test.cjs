'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ALLOWED_SCOPES,
  INVITE_TTL_MS,
  createInviteSecret,
  hashInviteSecret,
  isInviteActive,
  normalizeScopes,
  validateTelemetry
} = require('../functions/src/pairing-core.cjs');

test('pairing secrets use high-entropy URL-safe random material and hash deterministically', () => {
  const first = createInviteSecret();
  const second = createInviteSecret();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(hashInviteSecret(first), hashInviteSecret(first));
  assert.notEqual(hashInviteSecret(first), first);
  assert.throws(() => hashInviteSecret('short'), TypeError);
});

test('invite expiry, consumption, and revocation are enforced', () => {
  const now = 100000;
  const active = {
    secretHash: 'a'.repeat(64),
    expiresAt: now + INVITE_TTL_MS,
    consumedAt: null,
    revokedAt: null
  };
  assert.equal(isInviteActive(active, now), true);
  assert.equal(isInviteActive(active, active.expiresAt), false);
  assert.equal(isInviteActive({ ...active, consumedAt: now }, now), false);
  assert.equal(isInviteActive({ ...active, revokedAt: now }, now), false);
  assert.equal(isInviteActive(null, now), false);
});

test('sharing scopes accept only unique allowlisted values', () => {
  assert.deepEqual(normalizeScopes(['location', 'battery']), ['location', 'battery']);
  assert.deepEqual(ALLOWED_SCOPES, [
    'location', 'battery', 'network', 'device', 'permissionStatus', 'appStatus'
  ]);
  assert.throws(() => normalizeScopes(['location', 'location']), TypeError);
  assert.throws(() => normalizeScopes(['*']), TypeError);
  assert.throws(() => normalizeScopes([]), TypeError);
});

test('telemetry accepts bounded allowlisted values', () => {
  assert.equal(validateTelemetry({
    location: { latitude: 11.9, longitude: 79.8, accuracy: 12 },
    battery: { level: 0.75, charging: false },
    network: { online: true, effectiveType: '4g' },
    device: { platform: 'android', appVersion: '1.0.0' },
    permissionStatus: { camera: 'prompt', microphone: 'denied' },
    appStatus: { active: true }
  }), true);
});

test('telemetry rejects invalid coordinates, identifiers, and unknown fields', () => {
  assert.equal(validateTelemetry({ location: { latitude: 91, longitude: 0, accuracy: 1 } }), false);
  assert.equal(validateTelemetry({ location: { latitude: 0, longitude: 0, accuracy: 1, ip: '127.0.0.1' } }), false);
  assert.equal(validateTelemetry({ battery: { level: 2, charging: false } }), false);
  assert.equal(validateTelemetry({ network: { online: true, effectiveType: '4g', ssid: 'private' } }), false);
  assert.equal(validateTelemetry({ device: { platform: 'android', appVersion: '1', serial: 'secret' } }), false);
  assert.equal(validateTelemetry({ permissionStatus: { camera: 'granted', microphone: 'granted', audio: true } }), false);
  assert.equal(validateTelemetry({ appStatus: { active: true, hidden: true } }), false);
  assert.equal(validateTelemetry({ location: null }), false);
  assert.equal(validateTelemetry({ unexpected: true }), false);
});
