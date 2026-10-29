'use strict';
const assert = require('node:assert/strict');
const { marksToGrade, percentageFormulas } = require('./calc.js');
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
const rows = [{credits:3, points:10}, {credits:4, points:8}, {credits:0, points:10}];
const credits = rows.reduce((s,r)=>s+(r.credits>0?r.credits:0),0);
const weighted = rows.reduce((s,r)=>s+(r.credits>0?r.credits*r.points:0),0)/credits;
assert.equal(credits, 7);
assert.equal(weighted, 62/7);
assert.equal(percentageFormulas.anna(8), 76);
assert.equal(percentageFormulas.vtu(8), 72.5);
assert.equal(percentageFormulas.jntuh_ktu_nit(8), 80);
assert.equal(percentageFormulas.mumbai(8), 67.8);
console.log('GradeCalc calculation tests passed (' + cases.length + ' grade cases + weighted SGPA + 4 formulas).');
