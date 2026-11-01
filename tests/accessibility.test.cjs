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
  assert.ok(html.includes('function addSubject()'));
  assert.ok(html.includes('firstField.focus()'));
  assert.ok(html.includes('function removeSubject(id)'));
  assert.ok(html.includes('nextField.focus()'));
});

test('adding and removing semester rows moves focus predictably', () => {
  assert.ok(html.includes('function addSem()'));
  assert.ok(html.includes('field.focus()'));
  assert.ok(html.includes('function removeSem(id)'));
  assert.ok(html.includes('nextField.focus()'));
});


test('navigation tabs expose selected state and their controlled panels', () => {
  for (const tab of ['sgpa', 'cgpa', 'convert', 'analytics', 'target']) {
    assert.match(html, new RegExp('id="tab-' + tab + '"[^>]*role="tab"'));
    assert.match(html, new RegExp('id="tab-' + tab + '"[^>]*aria-selected="(?:true|false)"'));
    assert.match(html, new RegExp('id="tab-' + tab + '"[^>]*aria-controls="panel-' + tab + '"'));
    assert.match(html, new RegExp('id="panel-' + tab + '"'));
  }
  assert.match(html, /setAttribute\('aria-selected','false'\)/);
  assert.match(html, /setAttribute\('aria-selected','true'\)/);
});

test('grade editor toggle reports expanded state', () => {
  assert.match(html, /id="gradeToggle"[^>]*aria-expanded="false"[^>]*aria-controls="grade-editor"/);
  assert.match(html, /setAttribute\('aria-expanded', String\(open\)\)/);
});

test('dynamically generated subject and semester remove controls have descriptive names', () => {
  assert.match(html, /aria-label="Remove subject '\+\(i\+1\)/);
  assert.match(html, /aria-label="Remove semester '\+\(i\+1\)/);
  assert.match(html, /function renderSubjects\(\)/);
  assert.match(html, /function renderSems\(\)/);
});

test('subject and semester inputs have labels and numeric constraints', () => {
  assert.match(html, /aria-label="Subject name '\+\(i\+1\)/);
  assert.match(html, /aria-label="Marks for subject '\+\(i\+1\) out of 100" min="0" max="100"/);
  assert.match(html, /aria-label="Credits for subject '\+\(i\+1\)" min="1" max="6"/);
  assert.match(html, /aria-label="SGPA for '\+label\'" min="0" max="10"/);
});

test('calculation outputs and arrear tracker announce dynamic status updates', () => {
  assert.match(html, /id="sgpa-result"[^>]*aria-live="polite"[^>]*role="status"/);
  assert.match(html, /id="cgpa-result"[^>]*aria-live="polite"[^>]*role="status"/);
  assert.match(html, /id="arrears-tracker"[^>]*aria-live="polite"/);
  assert.match(html, /aria-live="polite"/);
});
