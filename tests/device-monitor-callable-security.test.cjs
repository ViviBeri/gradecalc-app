'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');

test('every callable enforces App Check and derives identity from verified authentication', () => {
  assert.match(source, /onCall\(\{\s*enforceAppCheck:\s*true,\s*consumeAppCheckToken:\s*true\s*\}/);
  assert.match(source, /const uid = request\.auth && request\.auth\.uid/);
  assert.match(source, /provider === 'anonymous'/);
  assert.match(source, /handler\(request, uid\)/);
  assert.doesNotMatch(source, /request\.data\.(?:uid|ownerUid|viewerUid)/);
});

test('all privileged pairing and telemetry operations use the shared callable guard', () => {
  const operations = [
    'createPairingInvite',
    'redeemPairingInvite',
    'confirmPairingRequest',
    'bindGrantToSession',
    'revokeDeviceGrant',
    'startDeviceSharing',
    'stopDeviceSharing',
    'publishDeviceTelemetry',
    'readDeviceTelemetry'
  ];
  for (const operation of operations) {
    assert.match(source, new RegExp('exports\\.' + operation + ' = callable\\('));
  }
});

test('viewer telemetry reads verify grant, session, device state, and expiry before returning data', () => {
  assert.match(source, /canReadTelemetry\(\{/);
  assert.match(source, /deviceSnapshot\.data\(\)\.revoked !== false/);
  assert.match(source, /telemetry\.expiresAt <= Date\.now\(\)/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(telemetry\.snapshot, scope\)/);
  assert.match(source, /\{ \[scope\]: telemetry\.snapshot\[scope\] \}/);
});
