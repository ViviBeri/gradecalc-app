'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } = require('firebase/firestore');

const projectId = 'demo-gradecalc';
let testEnv;

test.before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return;
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

test('authenticated users can manage only their own valid device metadata', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const ref = doc(db, 'users/student-a/devices/phone-1');
  await assertSucceeds(setDoc(ref, {
    deviceName: 'My phone',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false
  }));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { deviceName: 'My Android', revoked: true }));
  await assertSucceeds(deleteDoc(ref));
});

test('one authenticated account cannot read, create, update, or delete another account device', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const dbA = testEnv.authenticatedContext('student-a').firestore();
  const dbB = testEnv.authenticatedContext('student-b').firestore();
  const ownRef = doc(dbB, 'users/student-b/devices/phone-2');
  await assertSucceeds(setDoc(ownRef, {
    deviceName: 'Student B phone',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false
  }));

  const otherRef = doc(dbA, 'users/student-b/devices/phone-2');
  await assertFails(getDoc(otherRef));
  await assertFails(setDoc(doc(dbA, 'users/student-b/devices/attacker'), {
    deviceName: 'Attacker',
    platform: 'web',
    createdAt: serverTimestamp(),
    revoked: false
  }));
  await assertFails(updateDoc(otherRef, { revoked: true }));
  await assertFails(deleteDoc(otherRef));
});

test('device metadata cannot be used to smuggle location fields or rewrite immutable fields', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const ref = doc(db, 'users/student-a/devices/phone-3');
  await assertFails(setDoc(ref, {
    deviceName: 'Phone',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false,
    latitude: 11.9,
    longitude: 79.8
  }));
  await assertSucceeds(setDoc(ref, {
    deviceName: 'Phone',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false
  }));
  await assertFails(updateDoc(ref, { platform: 'web' }));
  await assertFails(updateDoc(ref, { createdAt: serverTimestamp() }));
});

test('a revoked device record cannot be reactivated', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const ref = doc(db, 'users/student-a/devices/revoked-phone');
  await assertSucceeds(setDoc(ref, {
    deviceName: 'Old phone',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false
  }));
  await assertSucceeds(updateDoc(ref, { revoked: true }));
  await assertFails(updateDoc(ref, { revoked: false }));
});

test('device metadata rejects invalid names, platforms, and pre-revoked creation', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const base = {
    deviceName: 'Valid phone',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false
  };

  await assertFails(setDoc(doc(db, 'users/student-a/devices/empty-name'), {
    ...base,
    deviceName: ''
  }));
  await assertFails(setDoc(doc(db, 'users/student-a/devices/long-name'), {
    ...base,
    deviceName: 'x'.repeat(61)
  }));
  await assertFails(setDoc(doc(db, 'users/student-a/devices/invalid-platform'), {
    ...base,
    platform: 'desktop'
  }));
  await assertFails(setDoc(doc(db, 'users/student-a/devices/pre-revoked'), {
    ...base,
    revoked: true
  }));
});

test('device metadata can be renamed and revoked but cannot be unrevoked or have platform changed', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const db = testEnv.authenticatedContext('student-a').firestore();
  const ref = doc(db, 'users/student-a/devices/lifecycle-phone');
  await assertSucceeds(setDoc(ref, {
    deviceName: 'First name',
    platform: 'android',
    createdAt: serverTimestamp(),
    revoked: false
  }));

  await assertSucceeds(updateDoc(ref, { deviceName: 'Renamed phone' }));
  const renamed = await getDoc(ref);
  assert.equal(renamed.data().deviceName, 'Renamed phone');
  assert.equal(renamed.data().revoked, false);

  await assertSucceeds(updateDoc(ref, { revoked: true }));
  await assertSucceeds(updateDoc(ref, { deviceName: 'Archived phone' }));
  const revoked = await getDoc(ref);
  assert.equal(revoked.data().deviceName, 'Archived phone');
  assert.equal(revoked.data().revoked, true);
  await assertFails(updateDoc(ref, { platform: 'web' }));
  await assertFails(updateDoc(ref, { revoked: false }));
});
