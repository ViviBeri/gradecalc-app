'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('Firestore rules deny all remote access until pairing rules are tested', () => {
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match\s*\/\{document=\*\*\}/);
  assert.match(rules, /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/);
  assert.doesNotMatch(rules, /allow\s+(read|write)\s*:\s*if\s+request\.auth\s*!=\s*null/);
});
