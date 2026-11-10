'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

test('remote pairing and telemetry remain denied until the trusted client flow is complete', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rules, /Everything else, including pairing codes and location data, stays denied/);
});

test('remote design requires anonymous identity, one-time approval, expiry, and scoped grants', () => {
  const design = fs.readFileSync('docs/device-monitor-architecture.md', 'utf8');
  assert.match(design, /Firebase anonymous authentication/i);
  assert.match(design, /one-time pairing invitation/i);
  assert.match(design, /explicit owner approval/i);
  assert.match(design, /immediately/i);
  assert.match(design, /short-lived/i);
  assert.match(design, /scope/i);
  assert.match(design, /No location collection/i);
});
