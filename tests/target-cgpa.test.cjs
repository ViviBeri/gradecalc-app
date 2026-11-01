'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'target.js'), 'utf8');

function loadCalculator() {
  const context = {
    document: { addEventListener() {}, getElementById() { return null; } },
    console
  };
  vm.runInNewContext(source, context, { filename: 'js/target.js' });
  return context.GradeCalcTarget.calculateRequiredSgpa;
}

test('calculates the credit-weighted SGPA required to reach a target CGPA', () => {
  const calculate = loadCalculator();
  const result = calculate({
    currentCgpa: 7.8,
    earnedCredits: 120,
    targetCgpa: 8.5,
    remainingCredits: 60
  });
  assert.equal(result.valid, true);
  assert.equal(result.requiredSgpa, 9.9);
  assert.equal(result.achievable, true);
  assert.equal(result.requiredWithinScale, true);
});

test('identifies targets that require more than the maximum SGPA', () => {
  const calculate = loadCalculator();
  const result = calculate({
    currentCgpa: 6,
    earnedCredits: 120,
    targetCgpa: 9,
    remainingCredits: 30
  });
  assert.equal(result.valid, true);
  assert.equal(result.requiredSgpa, 21);
  assert.equal(result.achievable, false);
});

test('rejects missing values, out-of-range CGPA, and invalid credit totals', () => {
  const calculate = loadCalculator();
  assert.equal(calculate({ currentCgpa: NaN, earnedCredits: 10, targetCgpa: 8, remainingCredits: 10 }).valid, false);
  assert.equal(calculate({ currentCgpa: 11, earnedCredits: 10, targetCgpa: 8, remainingCredits: 10 }).valid, false);
  assert.equal(calculate({ currentCgpa: 7, earnedCredits: -1, targetCgpa: 8, remainingCredits: 10 }).valid, false);
  assert.equal(calculate({ currentCgpa: 7, earnedCredits: 10, targetCgpa: 8, remainingCredits: 0 }).valid, false);
});

test('handles a student already at or above the target', () => {
  const calculate = loadCalculator();
  const result = calculate({
    currentCgpa: 8.7,
    earnedCredits: 90,
    targetCgpa: 8.5,
    remainingCredits: 30
  });
  assert.equal(result.valid, true);
  assert.equal(result.alreadyAboveTarget, true);
  assert.ok(result.requiredSgpa < 8.5);
});
