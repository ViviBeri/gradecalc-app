/* Pure calculation logic shared by the browser app and Node.js tests. */
(function (root) {
  'use strict';

  function marksToGrade(value) {
    var s = String(value).trim();
    if (s === '' || s === 'null' || s === 'undefined') {
      return { label: 'Ab', point: 0, cls: 'absent' };
    }
    var marks = parseFloat(s);
    if (isNaN(marks) || marks < 0 || marks > 100) {
      return { label: 'Ab', point: 0, cls: 'absent' };
    }
    if (marks >= 80) return { label: 'O', point: 10, cls: 'pass' };
    if (marks >= 71) return { label: 'A+', point: 9, cls: 'pass' };
    if (marks >= 66) return { label: 'A', point: 8, cls: 'pass' };
    if (marks >= 61) return { label: 'B+', point: 7, cls: 'pass' };
    if (marks >= 56) return { label: 'B', point: 6, cls: 'pass' };
    if (marks >= 50) return { label: 'C', point: 5, cls: 'pass' };
    if (marks >= 40) return { label: 'P', point: 4, cls: 'pass' };
    return { label: 'F', point: 0, cls: 'fail' };
  }

  function calculateSGPA(subjects) {
    var validSubjects = (subjects || [])
      .filter(function (subject) {
        var credits = parseFloat(subject.credits);
        return subject.credits !== '' && !isNaN(credits) && credits > 0;
      })
      .map(function (subject) {
        var grade = marksToGrade(subject.marks);
        return Object.assign({}, subject, {
          gradePoint: grade.point,
          gradeLabel: grade.label,
          gradeClass: grade.cls,
          numericCredits: parseFloat(subject.credits)
        });
      });

    if (validSubjects.length === 0) return null;

    var totalCredits = validSubjects.reduce(function (sum, subject) {
      return sum + subject.numericCredits;
    }, 0);
    var totalPoints = validSubjects.reduce(function (sum, subject) {
      return sum + subject.numericCredits * subject.gradePoint;
    }, 0);

    return {
      validSubjects: validSubjects,
      totalCredits: totalCredits,
      totalPoints: totalPoints,
      sgpa: totalPoints / totalCredits
    };
  }

  function calculateCGPA(semesters) {
    var validSemesters = (semesters || [])
      .map(function (semester, index) {
        return {
          sgpa: semester.sgpa,
          label: 'Semester ' + (index + 1)
        };
      })
      .filter(function (semester) {
        return semester.sgpa !== '' && !isNaN(parseFloat(semester.sgpa));
      })
      .map(function (semester) {
        return Object.assign({}, semester, { numericSGPA: parseFloat(semester.sgpa) });
      });

    if (validSemesters.length === 0) return null;

    var sum = validSemesters.reduce(function (total, semester) {
      return total + semester.numericSGPA;
    }, 0);

    return {
      validSemesters: validSemesters,
      sum: sum,
      cgpa: sum / validSemesters.length
    };
  }

  var api = {
    marksToGrade: marksToGrade,
    calculateSGPA: calculateSGPA,
    calculateCGPA: calculateCGPA
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GradeCalcCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
