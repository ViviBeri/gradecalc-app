'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../functions/src/callable-factory.cjs'), 'utf8');
const entrypoint = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');

test('callable factory enforces App Check and derives identity from verified authentication', () => {
  assert.match(source, /onCallImpl\(\{\s*enforceAppCheck:\s*true,\s*consumeAppCheckToken:\s*true\s*\}/);
  assert.match(source, /const uid = request\.auth && request\.auth\.uid/);
  assert.doesNotMatch(source, /provider === 'anonymous'/);
  assert.match(source, /handler\(request, uid\)/);
  assert.doesNotMatch(source, /request\.data\.(?:uid|ownerUid|viewerUid)/);
});

test('all privileged operations are created through the shared callable guard', () => {
  const operations = [
    'createPairingInvite', 'redeemPairingInvite', 'confirmPairingRequest',
    'bindGrantToSession', 'revokeDeviceGrant', 'startDeviceSharing',
    'stopDeviceSharing', 'publishDeviceTelemetry', 'readDeviceTelemetry'
  ];
  for (const operation of operations) {
    assert.match(source, new RegExp('const ' + operation + ' = callable\\('));
  }
});

test('viewer telemetry reads verify grant, session, device state, and expiry', () => {
  assert.match(source, /canReadTelemetry\(\{/);
  assert.match(source, /session\.grantIds\.includes\(grantId\)/);
  assert.match(source, /deviceSnapshot\.data\(\)\.revoked !== false/);
  assert.match(source, /telemetry\.expiresAt <= Date\.now\(\)/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(telemetry\.snapshot, scope\)/);
  assert.match(source, /\{ \[scope\]: telemetry\.snapshot\[scope\] \}/);
});

test('deployment entrypoint exports only the callable factory results', () => {
  assert.match(entrypoint, /Object\.assign\(exports, buildCallables\(\{ db \}\)\)/);
  assert.doesNotMatch(entrypoint, /exports\.buildCallables/);
});
