'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('SGPA and CGPA results expose share and download actions', () => {
  assert.match(html, /shareResultCard\\('sgpa'\\)/);
  assert.match(html, /shareResultCard\\('cgpa'\\)/);
  assert.match(html, /id=\\"sgpa-share-status\\" role=\\"status\\" aria-live=\\"polite\\"/);
  assert.match(html, /id=\\"cgpa-share-status\\" role=\\"status\\" aria-live=\\"polite\\"/);
});

test('result cards use a consistent 1200 by 630 PNG canvas', () => {
  assert.match(html, /canvas\\.width = 1200/);
  assert.match(html, /canvas\\.height = 630/);
  assert.match(html, /canvas\\.toBlob\\(async function\\(blob\\)/);
  assert.match(html, /}, 'image\\/png'\\)/);
});

test('result card attribution is present and private subject details are excluded', () => {
  assert.match(html, /Created with GradeCalc/);
  assert.match(html, /No personal or subject details included/);
  assert.match(html, /lastResultCardData = \\{ kind: 'sgpa'/);
  assert.match(html, /lastResultCardData = \\{ kind: 'cgpa'/);
  assert.doesNotMatch(html, /lastResultCardData = \\{[^}]*subjectName/);
});

test('native file sharing is feature-detected with PNG download fallback', () => {
  assert.match(html, /navigator\\.share && navigator\\.canShare/);
  assert.match(html, /navigator\\.canShare\\(\\{ files: \\[file\\] \\}\\)/);
  assert.match(html, /link\\.download = fileName/);
  assert.match(html, /URL\\.revokeObjectURL/);
});

test('result card typography and colors are explicit for readable light and dark app themes', () => {
  assert.match(html, /ctx\\.fillStyle = '#071A0D'/);
  assert.match(html, /ctx\\.fillStyle = '#FFFFFF'/);
  assert.match(html, /ctx\\.fillStyle = '#86EFAC'/);
  assert.match(html, /ctx\\.font = '700 112px Arial, sans-serif'/);
});
