'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('SGPA and CGPA results expose share and download actions', () => {
  assert.ok(html.includes('shareResultCard'));
  assert.ok(html.includes('sgpa-share-status'));
  assert.ok(html.includes('cgpa-share-status'));
  assert.ok(html.includes('Share / Download PNG'));
});

test('result cards use a consistent 1200 by 630 PNG canvas', () => {
  assert.ok(html.includes('canvas.width = 1200'));
  assert.ok(html.includes('canvas.height = 630'));
  assert.ok(html.includes('canvas.toBlob(async function(blob)'));
  assert.ok(html.includes("}, 'image/png')"));
});

test('result card attribution is present and private subject details are excluded', () => {
  assert.ok(html.includes('Created with GradeCalc'));
  assert.ok(html.includes('No personal or subject details included'));
  assert.ok(html.includes("lastResultCardData = { kind: 'sgpa'"));
  assert.ok(html.includes("lastResultCardData = { kind: 'cgpa'"));
  assert.ok(!html.includes('lastResultCardData.subjectName'));
});

test('native file sharing is feature-detected with PNG download fallback', () => {
  assert.ok(html.includes('navigator.share && navigator.canShare'));
  assert.ok(html.includes('navigator.canShare({ files: [file] })'));
  assert.ok(html.includes('link.download = fileName'));
  assert.ok(html.includes('URL.revokeObjectURL'));
});

test('result card typography and colors are explicit for readable light and dark app themes', () => {
  assert.ok(html.includes("ctx.fillStyle = '#071A0D'"));
  assert.ok(html.includes("ctx.fillStyle = '#FFFFFF'"));
  assert.ok(html.includes("ctx.fillStyle = '#86EFAC'"));
  assert.ok(html.includes("ctx.font = '700 112px Arial, sans-serif'"));
});
