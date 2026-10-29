'use strict';
const assert = require('node:assert/strict');
const { marksToGrade, calculateWeightedSGPA, calculateCGPA, convertGpaToPercentage, convertPercentageToGpa } = require('./calc.js');
const cases = [
  ['', 'Ab', 0], [null, 'Ab', 0], [-1, 'Ab', 0], [101, 'Ab', 0],
  [0, 'F', 0], [39, 'F', 0], [39.99, 'F', 0], [40, 'P', 4], [49, 'P', 4], [49.99, 'P', 4],
  [50, 'C', 5], [55, 'C', 5], [55.99, 'C', 5], [56, 'B', 6], [60, 'B', 6], [60.99, 'B', 6],
  [61, 'B+', 7], [65, 'B+', 7], [65.99, 'B+', 7], [66, 'A', 8], [70, 'A', 8], [70.5, 'A', 8],
  [70.99, 'A', 8], [71, 'A+', 9], [79, 'A+', 9], [79.5, 'A+', 9], [79.99, 'A+', 9], [80, 'O', 10], [100, 'O', 10]
];
for (const [mark, label, point] of cases) {
  const got = marksToGrade(mark);
  assert.equal(got.label, label, 'grade for mark ' + JSON.stringify(mark));
  assert.equal(got.point, point, 'points for mark ' + JSON.stringify(mark));
}
const rows = [{credits:3, gradePoint:10}, {credits:4, gradePoint:8}, {credits:0, gradePoint:10}];
const weighted = calculateWeightedSGPA(rows);
assert.equal(weighted.totalCredits, 7);
assert.equal(weighted.totalPoints, 62);
assert.equal(weighted.sgpa, 62/7);
assert.deepEqual(calculateWeightedSGPA([{credits:0, gradePoint:10}, {credits:-1, gradePoint:8}]), {totalCredits:0,totalPoints:0,sgpa:null});

assert.equal(calculateCGPA([]), null, 'empty semester list');
assert.equal(calculateCGPA([{sgpa:''},{sgpa:null},{sgpa:'   '}]), null, 'blank semester entries');
assert.equal(calculateCGPA([{sgpa:8.25}]).cgpa, 8.25, 'single semester CGPA');
const cgpaDecimal = calculateCGPA([{sgpa:'8.25'},{sgpa:'7.5'},{sgpa:''},{sgpa:'9.1'}]);
assert.equal(cgpaDecimal.validSemesters.length, 3, 'blank semester excluded');
assert.ok(Math.abs(cgpaDecimal.cgpa - ((8.25 + 7.5 + 9.1) / 3)) < 1e-12, 'decimal SGPAs averaged');
assert.equal(calculateCGPA([{sgpa:11},{sgpa:-1},{sgpa:'not-a-number'}]), null, 'invalid semester SGPA values ignored');

for (const [formula, expected] of [['anna',76],['vtu',72.5],['jntuh_ktu_nit',80],['mumbai',67.8]]) {
  assert.equal(convertGpaToPercentage(8, formula), expected, formula + ' GPA-to-percentage');
  assert.ok(Math.abs(convertPercentageToGpa(expected, formula) - 8) < 1e-12, formula + ' percentage-to-GPA');
}
console.log('GradeCalc calculation tests passed (' + cases.length + ' grade cases + weighted SGPA + CGPA cases + 4 formulas).');
