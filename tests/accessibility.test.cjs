'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('all static projection and target calculator inputs have accessible names', () => {
  const ids = [
    'projection-future-sgpa',
    'projection-future-count',
    'target-current-cgpa',
    'target-goal-cgpa',
    'target-earned-credits',
    'target-remaining-credits'
  ];
  for (const id of ids) {
    const input = html.match(new RegExp('<input\\b[^>]*id="' + id + '"[^>]*>'));
    assert.ok(input, 'expected input #' + id);
    assert.match(input[0], /aria-label=|aria-labelledby=/, id + ' must have an accessible name');
  }
  assert.match(html, /id="conv-formula"[^>]*>/);
  assert.match(html, /<label[^>]*for="conv-formula"/);
  assert.match(html, /id="themeToggle"[^>]*aria-label="Toggle color theme"/);
});

test('keyboard focus is visible in normal and forced-colors modes', () => {
  assert.ok(html.includes(':where(button,input,select,textarea,a,[tabindex]):focus-visible'));
  assert.ok(html.includes('@media (forced-colors:active)'));
  assert.match(html, /outline:3px solid Highlight/);
});

test('adding and removing subject rows moves focus predictably', () => {
  assert.match(html, /function addSubject\\(\\)[\\s\\S]*?firstField\\.focus\\(\\)/);
  assert.match(html, /function removeSubject\\(id\\)[\\s\\S]*?nextField\\.focus\\(\\)/);
});

test('adding and removing semester rows moves focus predictably', () => {
  assert.match(html, /function addSem\\(\\)[\\s\\S]*?field\\.focus\\(\\)/);
  assert.match(html, /function removeSem\\(id\\)[\\s\\S]*?nextField\\.focus\\(\\)/);
});
