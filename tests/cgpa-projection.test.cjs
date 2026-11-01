'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.slice(html.indexOf('// ── What-If CGPA Projection'), html.indexOf('// ── Converter'));

function loadCalculator() {
  const context = {
    document: { getElementById() { return { addEventListener() {} }; } },
    URL, URLSearchParams, navigator: {}, window: { location: { href: 'https://example.com/gradecalc-app/' } },
    console
  };
  vm.runInNewContext(source + String.fromCharCode(10) + 'globalThis.GradeCalcProjection = { calculateProjectedCgpa: calculateProjectedCgpa };', context, { filename: 'projection.js' });
  return context.GradeCalcProjection.calculateProjectedCgpa;
}

test('projects equal-semester CGPA using completed SGPAs and planned future SGPA', () => {
  const calculate = loadCalculator();
  const result = calculate([7, 8], 9, 2);
  assert.equal(result.valid, true);
  assert.equal(result.currentCgpa, 7.5);
  assert.equal(result.projectedCgpa, 8.25);
  assert.equal(result.totalSemesters, 4);
});

test('rejects missing completed semesters, invalid grades, and invalid future counts', () => {
  const calculate = loadCalculator();
  assert.equal(calculate([], 9, 2).valid, false);
  assert.equal(calculate([7, 11], 9, 2).valid, false);
  assert.equal(calculate([7, 8], -1, 2).valid, false);
  assert.equal(calculate([7, 8], 9, 0).valid, false);
  assert.equal(calculate([7, 8], 9, 2.5).valid, false);
  assert.equal(calculate([7, 8], 9, 21).valid, false);
});

test('live page contains the projection panel, share action, and URL restoration', () => {
  assert.match(html, /id="projection-future-sgpa"/);
  assert.match(html, /id="projection-share"/);
  assert.match(html, /function applyCgpaProjectionFromUrl/);
  assert.match(html, /searchParams\.set\('gcgpa'/);
  assert.match(html, /searchParams\.delete\('gcgpa'/);
});
