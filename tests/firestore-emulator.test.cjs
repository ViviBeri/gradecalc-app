'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const projectId = 'demo-gradecalc';
let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
    }
  });
});

test.after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test('unauthenticated clients cannot read or write remote documents', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const ref = doc(db, 'users/anonymous-device');
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, { location: 'must-not-be-written' }));
});

test('authenticated clients are also denied until pairing authorization is implemented', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const ref = doc(db, 'users/student-a');
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, { location: 'must-not-be-written' }));
});

test('one authenticated account cannot access another account document', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const otherUser = doc(db, 'users/student-b');
  await assertFails(getDoc(otherUser));
  await assertFails(setDoc(otherUser, { location: 'must-not-be-written' }));
});
