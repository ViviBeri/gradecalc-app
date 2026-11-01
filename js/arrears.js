(function (root) {
  'use strict';

  var STORAGE_KEY = 'gradecalc_arrears_v1';
  var records = [];
  var initialized = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function gradeForMarks(value) {
    var text = String(value == null ? '' : value).trim();
    if (text === '') return 'Ab';
    var marks = Number(text);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) return 'Invalid';
    if (marks >= 80) return 'O';
    if (marks >= 71) return 'A+';
    if (marks >= 66) return 'A';
    if (marks >= 61) return 'B+';
    if (marks >= 56) return 'B';
    if (marks >= 50) return 'C';
    if (marks >= 40) return 'P';
    return 'F';
  }

  function isArrear(subject) {
    if (!subject || !String(subject.credits == null ? '' : subject.credits).trim()) return false;
    var credits = Number(subject.credits);
    if (!Number.isFinite(credits) || credits <= 0) return false;
    var grade = gradeForMarks(subject.marks);
    return grade === 'F' || grade === 'Ab';
  }

  function normalizeRecord(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.subjectId !== 'string' || !item.subjectId ||
        !item.original || typeof item.original !== 'object' || !Array.isArray(item.attempts)) return null;
    var attempts = item.attempts.filter(function (attempt) {
      if (!attempt || typeof attempt !== 'object') return false;
      var marks = Number(attempt.marks);
      return typeof attempt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(attempt.date) &&
        Number.isFinite(marks) && marks >= 0 && marks <= 100;
    }).map(function (attempt) {
      return {
        id: typeof attempt.id === 'string' && attempt.id ? attempt.id : makeId(),
        date: attempt.date,
        marks: String(attempt.marks),
        grade: gradeForMarks(attempt.marks),
        cleared: attempt.cleared === true && Number(attempt.marks) >= 40
      };
    });
    return {
      id: typeof item.id === 'string' && item.id ? item.id : makeId(),
      subjectId: item.subjectId,
      subjectName: String(item.subjectName == null ? '' : item.subjectName).slice(0, 120),
      original: {
        marks: String(item.original.marks == null ? '' : item.original.marks),
        grade: item.original.grade === 'F' ? 'F' : 'Ab',
        credits: String(item.original.credits == null ? '' : item.original.credits),
        detectedAt: typeof item.original.detectedAt === 'string' ? item.original.detectedAt : ''
      },
      attempts: attempts
    };
  }

  function makeId() {
    return 'ar_' + Math.random().toString(36).slice(2, 11);
  }

  function load() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      records = Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(Boolean) : [];
    } catch (error) {
      records = [];
    }
    return records;
  }

  function save() {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      return false;
    }
  }

  function syncSubjects(subjects, now) {
    (Array.isArray(subjects) ? subjects : []).forEach(function (subject, index) {
      if (!isArrear(subject) || !subject.id) return;
      var existing = records.find(function (record) { return record.subjectId === String(subject.id); });
      if (existing) {
        if (String(subject.name || '').trim()) existing.subjectName = String(subject.name).trim().slice(0, 120);
        return;
      }
      records.push({
        id: makeId(),
        subjectId: String(subject.id),
        subjectName: String(subject.name || '').trim().slice(0, 120) || ('Subject ' + (index + 1)),
        original: {
          marks: String(subject.marks == null ? '' : subject.marks),
          grade: gradeForMarks(subject.marks),
          credits: String(subject.credits),
          detectedAt: now || new Date().toISOString().slice(0, 10)
        },
        attempts: []
      });
    });
    save();
    return records;
  }

  function getStatus(record) {
    if (!record || !record.attempts.length) return 'Pending';
    return record.attempts[record.attempts.length - 1].cleared ? 'Cleared' : 'Attempted / Not cleared';
  }

  function getSummary() {
    return records.reduce(function (summary, record) {
      if (getStatus(record) === 'Cleared') summary.cleared += 1;
      else summary.pending += 1;
      return summary;
    }, {pending: 0, cleared: 0, total: records.length});
  }

  function addAttempt(recordId, data) {
    var record = records.find(function (item) { return item.id === recordId; });
    if (!record) return {valid: false, reason: 'Arrear record not found.'};
    if (!String(record.subjectName || '').trim() || /^Subject \d+$/.test(record.subjectName)) {
      return {valid: false, reason: 'Enter a subject name in the SGPA subject list before recording an attempt.'};
    }
    var date = String(data && data.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00'))) {
      return {valid: false, reason: 'Enter a valid attempt date.'};
    }
    var rawMarks = String(data && data.marks != null ? data.marks : '').trim();
    if (!rawMarks) return {valid: false, reason: 'Enter marks for the later attempt.'};
    var marks = Number(rawMarks);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
      return {valid: false, reason: 'Marks must be between 0 and 100.'};
    }
    if (record.attempts.some(function (attempt) { return attempt.date === date && Number(attempt.marks) === marks; })) {
      return {valid: false, reason: 'This date and marks combination is already recorded.'};
    }
    var cleared = data.cleared === true;
    if (cleared && marks < 40) return {valid: false, reason: 'An attempt below 40 marks cannot be marked cleared.'};
    record.attempts.push({id: makeId(), date: date, marks: String(marks), grade: gradeForMarks(marks), cleared: cleared});
    save();
    return {valid: true, record: record, status: getStatus(record)};
  }

  function removeRecord(recordId) {
    var before = records.length;
    records = records.filter(function (record) { return record.id !== recordId; });
    if (records.length !== before) save();
    return records.length !== before;
  }

  function render() {
    var mount = root.document && root.document.getElementById('arrears-tracker');
    if (!mount) return;
    var summary = getSummary();
    var cards = records.map(function (record) {
      var status = getStatus(record);
      var attempts = record.attempts.map(function (attempt, index) {
        return '<li class="arrear-history-item"><span>Attempt ' + (index + 1) + ' · ' + escapeHtml(attempt.date) +
          ' · ' + escapeHtml(attempt.marks) + '/100 (' + escapeHtml(attempt.grade) + ')</span><strong>' +
          (attempt.cleared ? 'Cleared' : 'Not cleared') + '</strong></li>';
      }).join('');
      var canAdd = !/^Subject \d+$/.test(record.subjectName);
      return '<article class="arrear-card" data-arrear-id="' + escapeHtml(record.id) + '">' +
        '<div class="arrear-card-head"><div><h4>' + escapeHtml(record.subjectName) + '</h4>' +
        '<p>Original: ' + escapeHtml(record.original.grade) + ' · ' + escapeHtml(record.original.marks || 'Absent') +
        (record.original.marks ? '/100' : '') + ' · ' + escapeHtml(record.original.credits) + ' credits</p></div>' +
        '<span class="arrear-status ' + (status === 'Cleared' ? 'is-cleared' : 'is-pending') + '">' + escapeHtml(status) + '</span></div>' +
        (attempts ? '<ol class="arrear-history">' + attempts + '</ol>' : '<p class="arrear-empty">No later attempts recorded.</p>') +
        (canAdd ? '<form class="arrear-attempt-form" data-arrear-form="' + escapeHtml(record.id) + '">' +
          '<label>Attempt date<input type="date" name="date" required /></label>' +
          '<label>Marks (0–100)<input type="number" name="marks" min="0" max="100" step="0.01" required inputmode="decimal" /></label>' +
          '<label class="arrear-check"><input type="checkbox" name="cleared" /> Mark this attempt as cleared</label>' +
          '<button class="btn-secondary" type="submit">Save attempt</button><p class="arrear-form-message" aria-live="polite"></p></form>' :
          '<p class="arrear-empty">Add a subject name in the SGPA list to record a later attempt.</p>') +
        '<button class="arrear-remove" type="button" data-remove-arrear="' + escapeHtml(record.id) + '">Remove record</button></article>';
    }).join('');
    mount.innerHTML = '<div class="card arrear-tracker-card"><div class="arrear-title-row"><div><div class="card-title">Backlog &amp; arrear tracker</div>' +
      '<p class="arrear-intro">F and Ab subjects are listed here automatically. Later attempts are stored only in this browser.</p></div></div>' +
      '<div class="arrear-summary"><div><strong>' + summary.pending + '</strong><span>Pending / not cleared</span></div>' +
      '<div><strong>' + summary.cleared + '</strong><span>Cleared</span></div><div><strong>' + summary.total + '</strong><span>Total records</span></div></div>' +
      (cards || '<p class="arrear-empty">No backlogs or arrears detected. Subjects with credits and an F or Ab grade will appear here.</p>') +
      '<p class="arrear-policy">GPA policy varies by institution. The original attempt remains in your SGPA history; this tracker does not replace grades or recalculate SGPA/CGPA using later attempts.</p></div>';
    mount.querySelectorAll('[data-arrear-form]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var result = addAttempt(form.getAttribute('data-arrear-form'), {
          date: data.get('date'), marks: data.get('marks'), cleared: data.get('cleared') === 'on'
        });
        var message = form.querySelector('.arrear-form-message');
        if (!result.valid) {
          message.textContent = result.reason;
          message.className = 'arrear-form-message is-error';
          return;
        }
        render();
        var updated = mount.querySelector('[data-arrear-id="' + result.record.id + '"] .arrear-form-message');
        if (updated) {
          updated.textContent = 'Attempt saved. Current status: ' + result.status + '.';
          updated.className = 'arrear-form-message is-success';
        }
      });
    });
    mount.querySelectorAll('[data-remove-arrear]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!root.confirm || root.confirm('Remove this arrear record and its attempt history?')) {
          removeRecord(button.getAttribute('data-remove-arrear'));
          render();
        }
      });
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    load();
    syncSubjects(root.subjects || []);
    render();
  }

  root.GradeCalcArrears = {
    load: load,
    save: save,
    syncSubjects: syncSubjects,
    addAttempt: addAttempt,
    removeRecord: removeRecord,
    getStatus: getStatus,
    getSummary: getSummary,
    gradeForMarks: gradeForMarks,
    isArrear: isArrear,
    render: render,
    init: init,
    getRecords: function () { return records.slice(); }
  };

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
