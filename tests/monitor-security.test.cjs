'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

test('remote pairing and telemetry remain denied until the trusted client flow is complete', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rules, /Everything else, including pairing and telemetry data, stays denied/);
});

test('remote design requires bearer-token identity, dual approval, expiry, and scoped access', () => {
  const design = fs.readFileSync('docs/device-monitor-architecture.md', 'utf8');
  assert.match(design, /random owner\/device bearer tokens/i);
  assert.match(design, /one-time secret/i);
  assert.match(design, /explicit on-device approval.*separate dashboard-owner approval/i);
  assert.match(design, /immediately/i);
  assert.match(design, /short-lived/i);
  assert.match(design, /scope/i);
  assert.match(design, /No location collection/i);
});
