'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { marksToGrade, calculateSGPA, calculateCGPA } = require('../gradecalc-core.js');

test('marks map to the documented SGC grade-point boundaries', () => {
  const cases = [
    [100, 'O', 10], [80, 'O', 10], [79, 'A+', 9], [71, 'A+', 9],
    [70, 'A', 8], [66, 'A', 8], [65, 'B+', 7], [61, 'B+', 7],
    [60, 'B', 6], [56, 'B', 6], [55, 'C', 5], [50, 'C', 5],
    [49, 'P', 4], [40, 'P', 4], [39, 'F', 0], [0, 'F', 0]
  ];
  for (const [marks, label, point] of cases) {
    assert.deepEqual(
      { label: marksToGrade(marks).label, point: marksToGrade(marks).point },
      { label, point },
      'marks: ' + marks
    );
  }
});

test('blank, non-numeric, and out-of-range marks are absent with zero points', () => {
  for (const marks of ['', 'not a mark', -1, 101]) {
    assert.deepEqual(
      { label: marksToGrade(marks).label, point: marksToGrade(marks).point },
      { label: 'Ab', point: 0 },
      'marks: ' + String(marks)
    );
  }
});

test('SGPA uses credit-weighted grade points, not a simple grade average', () => {
  const result = calculateSGPA([
    { name: 'A', marks: 80, credits: '4' }, // 10 × 4
    { name: 'B', marks: 70, credits: '2' }, // 8 × 2
    { name: 'C', marks: 45, credits: '1' }  // 4 × 1
  ]);
  assert.equal(result.totalCredits, 7);
  assert.equal(result.totalPoints, 60);
  assert.equal(result.sgpa, 60 / 7);
});

test('SGPA counts failed and absent subjects with credits as zero-point subjects', () => {
  const result = calculateSGPA([
    { marks: 39, credits: '3' },
    { marks: '', credits: '1' },
    { marks: 90, credits: '2' }
  ]);
  assert.equal(result.totalCredits, 6);
  assert.equal(result.totalPoints, 20);
  assert.equal(result.sgpa, 20 / 6);
  assert.deepEqual(result.validSubjects.map((s) => s.gradeLabel), ['F', 'Ab', 'O']);
});

test('SGPA ignores subjects with missing, zero, negative, or invalid credits', () => {
  const result = calculateSGPA([
    { marks: 100, credits: '' },
    { marks: 100, credits: '0' },
    { marks: 100, credits: '-2' },
    { marks: 100, credits: 'abc' },
    { marks: 60, credits: '2' }
  ]);
  assert.equal(result.totalCredits, 2);
  assert.equal(result.totalPoints, 12);
  assert.equal(result.sgpa, 6);
});

test('SGPA returns null when no subject has positive numeric credits', () => {
  assert.equal(calculateSGPA([{ marks: 80, credits: '' }, { marks: 80, credits: 0 }]), null);
});

test('CGPA averages entered semester SGPAs and ignores blank or non-numeric entries', () => {
  const result = calculateCGPA([
    { sgpa: '8.5' },
    { sgpa: '' },
    { sgpa: '7.5' },
    { sgpa: 'not entered' }
  ]);
  assert.equal(result.sum, 16);
  assert.equal(result.cgpa, 8);
  assert.equal(result.validSemesters.length, 2);
});

test('CGPA includes zero and preserves original semester labels after blanks', () => {
  const result = calculateCGPA([
    { sgpa: '' },
    { sgpa: '0' },
    { sgpa: '9' }
  ]);
  assert.equal(result.cgpa, 4.5);
  assert.deepEqual(result.validSemesters.map((s) => s.label), ['Semester 2', 'Semester 3']);
});

test('CGPA returns null when no semester has a numeric SGPA', () => {
  assert.equal(calculateCGPA([{ sgpa: '' }, { sgpa: 'x' }]), null);
});
