'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'arrears.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function createTracker(saved) {
  const storage = new Map();
  if (saved !== undefined) storage.set('gradecalc_arrears_v1', saved);
  const context = {
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    document: null,
    confirm: () => true,
    Date,
    Math,
    Number,
    String,
    Array,
    JSON,
    Object,
    RegExp,
    isNaN,
    console
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'js/arrears.js' });
  return { api: context.GradeCalcArrears, storage };
}

test('detects F and Ab subjects with credits but ignores passed or invalid-credit rows', () => {
  const { api } = createTracker();
  api.syncSubjects([
    { id: 'f1', name: 'Mathematics', marks: '32', credits: '4' },
    { id: 'a1', name: 'Physics', marks: '', credits: '3' },
    { id: 'p1', name: 'English', marks: '75', credits: '2' },
    { id: 'z1', name: 'No credits', marks: '20', credits: '' },
    { id: 'bad', name: 'Bad credits', marks: '20', credits: '-2' }
  ], '2026-11-01');
  const records = api.getRecords();
  assert.equal(records.length, 2);
  assert.equal(JSON.stringify(Array.from(records, x => x.original.grade)), JSON.stringify(['F', 'Ab']));
  assert.equal(JSON.stringify(api.getSummary()), JSON.stringify({ pending: 2, cleared: 0, total: 2 }));
});

test('records later attempts without replacing the original attempt and updates status', () => {
  const { api } = createTracker();
  api.syncSubjects([{ id: 'm1', name: 'Mathematics', marks: '32', credits: '4' }], '2026-11-01');
  const record = api.getRecords()[0];
  const failed = api.addAttempt(record.id, { date: '2026-11-10', marks: '35', cleared: false });
  assert.equal(failed.valid, true);
  assert.equal(failed.status, 'Attempted / Not cleared');
  const cleared = api.addAttempt(record.id, { date: '2026-12-10', marks: '55', cleared: true });
  assert.equal(cleared.valid, true);
  assert.equal(cleared.status, 'Cleared');
  const saved = api.getRecords()[0];
  assert.equal(saved.original.marks, '32');
  assert.equal(saved.original.grade, 'F');
  assert.equal(saved.attempts.length, 2);
  assert.equal(JSON.stringify(api.getSummary()), JSON.stringify({ pending: 0, cleared: 1, total: 1 }));
});

test('rejects missing subject names, invalid marks, invalid dates, duplicates and impossible cleared grades', () => {
  const { api } = createTracker();
  api.syncSubjects([{ id: 's1', name: '', marks: '', credits: '3' }], '2026-11-01');
  const record = api.getRecords()[0];
  assert.equal(api.addAttempt(record.id, { date: '2026-11-02', marks: '50', cleared: true }).valid, false);
  record.subjectName = 'Chemistry';
  assert.equal(api.addAttempt(record.id, { date: '2026-11-02', marks: '', cleared: false }).valid, false);
  assert.equal(api.addAttempt(record.id, { date: '2026-11-02', marks: '101', cleared: false }).valid, false);
  assert.equal(api.addAttempt(record.id, { date: 'not-a-date', marks: '50', cleared: true }).valid, false);
  assert.equal(api.addAttempt(record.id, { date: '2026-11-02', marks: '39', cleared: true }).valid, false);
  assert.equal(api.addAttempt(record.id, { date: '2026-11-02', marks: '39', cleared: false }).valid, true);
  assert.equal(api.addAttempt(record.id, { date: '2026-11-02', marks: '39', cleared: false }).valid, false);
});

test('persists locally, reloads valid records and safely ignores malformed stored JSON', () => {
  const first = createTracker();
  first.api.syncSubjects([{ id: 'p1', name: 'Programming', marks: '20', credits: '4' }], '2026-11-01');
  const id = first.api.getRecords()[0].id;
  first.api.addAttempt(id, { date: '2026-11-12', marks: '62', cleared: true });
  const raw = first.storage.get('gradecalc_arrears_v1');
  const second = createTracker(raw);
  second.api.load();
  assert.equal(second.api.getRecords().length, 1);
  assert.equal(second.api.getSummary().cleared, 1);
  const malformed = createTracker('{not-json');
  assert.doesNotThrow(() => malformed.api.load());
  assert.equal(malformed.api.getRecords().length, 0);
});

test('removing a record removes its attempt history from local storage', () => {
  const { api, storage } = createTracker();
  api.syncSubjects([{ id: 'h1', name: 'History', marks: '30', credits: '3' }], '2026-11-01');
  const id = api.getRecords()[0].id;
  api.addAttempt(id, { date: '2026-11-05', marks: '45', cleared: true });
  assert.equal(api.removeRecord(id), true);
  assert.equal(api.getRecords().length, 0);
  assert.equal(JSON.parse(storage.get('gradecalc_arrears_v1')).length, 0);
});

test('app mounts the tracker and service worker precaches its module', () => {
  assert.match(html, /id="arrears-tracker"/);
  assert.match(html, /src="js\/arrears\.js"/);
  assert.match(html, /function setMarks[\s\S]*?GradeCalcArrears\.syncSubjects/);
  assert.match(serviceWorker, /'js\/arrears\.js'/);
});
