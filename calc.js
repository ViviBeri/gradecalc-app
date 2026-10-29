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
  function calculateWeightedSGPA(rows) {
    var totalCredits = 0, totalPoints = 0;
    (rows || []).forEach(function (row) {
      var credits = Number(row.credits);
      var points = Number(row.gradePoint != null ? row.gradePoint : row.points);
      if (!Number.isFinite(credits) || credits <= 0) return;
      if (!Number.isFinite(points)) points = 0;
      totalCredits += credits;
      totalPoints += credits * points;
    });
    return { totalCredits: totalCredits, totalPoints: totalPoints, sgpa: totalCredits > 0 ? totalPoints / totalCredits : null };
  }
  var percentageFormulas = {
    anna: function (gpa) { return gpa * 9.5; },
    vtu: function (gpa) { return gpa * 10 - 7.5; },
    jntuh_ktu_nit: function (gpa) { return gpa * 10; },
    mumbai: function (gpa) { return gpa * 7.1 + 11; }
  };
  var reversePercentageFormulas = {
    anna: function (pct) { return pct / 9.5; },
    vtu: function (pct) { return (pct + 7.5) / 10; },
    jntuh_ktu_nit: function (pct) { return pct / 10; },
    mumbai: function (pct) { return (pct - 11) / 7.1; }
  };
  function convertGpaToPercentage(gpa, formula) {
    return percentageFormulas[formula || 'anna'](Number(gpa));
  }
  function convertPercentageToGpa(percentage, formula) {
    return reversePercentageFormulas[formula || 'anna'](Number(percentage));
  }
  var api = { marksToGrade: marksToGrade, pointsToGradeLetter: pointsToGradeLetter, calculateWeightedSGPA: calculateWeightedSGPA, percentageFormulas: percentageFormulas, reversePercentageFormulas: reversePercentageFormulas, convertGpaToPercentage: convertGpaToPercentage, convertPercentageToGpa: convertPercentageToGpa };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.marksToGrade = marksToGrade;
    root.pointsToGradeLetter = pointsToGradeLetter;
    root.calculateWeightedSGPA = calculateWeightedSGPA;
    root.gradeCalcPercentageFormulas = percentageFormulas;
    root.gradeCalcReversePercentageFormulas = reversePercentageFormulas;
    root.convertGpaToPercentage = convertGpaToPercentage;
    root.convertPercentageToGpa = convertPercentageToGpa;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
