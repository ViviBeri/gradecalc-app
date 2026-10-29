/* Pure calculation helpers shared by the browser app and Node tests. */
(function (root) {
  'use strict';
  function marksToGrade(val) {
    var s = String(val == null ? '' : val).trim();
    if (s === '' || s === 'null' || s === 'undefined') return {label:'Ab', point:0, cls:'absent'};
    var m = Number(s);
    if (!Number.isFinite(m) || m < 0 || m > 100) return {label:'Ab', point:0, cls:'absent'};
    // Inclusive lower bounds: 71 <= m < 80 is A+, 66 <= m < 71 is A, etc.
    if (m >= 80) return {label:'O', point:10, cls:'pass'};
    if (m >= 71) return {label:'A+', point:9, cls:'pass'};
    if (m >= 66) return {label:'A', point:8, cls:'pass'};
    if (m >= 61) return {label:'B+', point:7, cls:'pass'};
    if (m >= 56) return {label:'B', point:6, cls:'pass'};
    if (m >= 50) return {label:'C', point:5, cls:'pass'};
    if (m >= 40) return {label:'P', point:4, cls:'pass'};
    return {label:'F', point:0, cls:'fail'};
  }
  function pointsToGradeLetter(points) {
    if (points >= 9.5) return 'O (10)';
    if (points >= 8.5) return 'A+ (9)';
    if (points >= 7.5) return 'A (8)';
    if (points >= 6.5) return 'B+ (7)';
    if (points >= 5.5) return 'B (6)';
    if (points >= 4.5) return 'C (5)';
    if (points >= 3.5) return 'P (4)';
    return 'F (0) — Needs improvement';
  }
  var percentageFormulas = {
    anna: function (gpa) { return gpa * 9.5; },
    vtu: function (gpa) { return gpa * 10 - 7.5; },
    jntuh_ktu_nit: function (gpa) { return gpa * 10; },
    mumbai: function (gpa) { return gpa * 7.1 + 11; }
  };
  var api = { marksToGrade: marksToGrade, pointsToGradeLetter: pointsToGradeLetter, percentageFormulas: percentageFormulas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.marksToGrade = marksToGrade;
    root.pointsToGradeLetter = pointsToGradeLetter;
    root.gradeCalcPercentageFormulas = percentageFormulas;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
