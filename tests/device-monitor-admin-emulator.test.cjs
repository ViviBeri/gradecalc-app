'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { buildCallables } = require('../functions/src/callable-factory.cjs');
const {
  createInviteSecret, createPairingInviteTransaction, redeemInviteTransaction,
  confirmPairingRequestTransaction, createSharingSessionTransaction,
  bindGrantToSessionTransaction, publishTelemetryTransaction,
  revokeDeviceGrantTransaction, stopSharingSessionTransaction, canReadTelemetry
} = require('../functions/src/pairing-core.cjs');

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = 'demo-gradecalc';
const ownerUid = 'emulator-owner';
const viewerUid = 'emulator-viewer';
const deviceId = 'emulator-phone';
const sessionId = 'session-emulator-123456';
const now = Date.now();

test('Admin SDK pairing, callable reads, and sharing lifecycle run against Firestore emulator', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId }, 'monitor-lifecycle-test');
  try {
    const db = getFirestore(app);
    const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(deviceId);
    await deviceRef.set({ deviceName: 'Emulator phone', platform: 'android', createdAt: new Date(), revoked: false });
    const secret = createInviteSecret();
    const inviteId = 'invite-emulator-1';
    const requestId = 'request-emulator-1';
    const grantId = 'grant-emulator-1';
    const scopes = ['battery'];
    const invite = await createPairingInviteTransaction({ db, ownerUid, deviceId, inviteId, secret, scopes, now });
    assert.equal(invite.inviteId, inviteId);
    await assert.rejects(redeemInviteTransaction({
      db, inviteId, secret: createInviteSecret(), viewerUid, requestId: 'wrong-secret', now: now + 1
    }), /PAIRING_UNAVAILABLE/);
    const pending = await redeemInviteTransaction({ db, inviteId, secret, viewerUid, requestId, now: now + 2 });
    assert.equal(pending.status, 'pending');
    await assert.rejects(confirmPairingRequestTransaction({
      db, requestId, ownerUid: 'other-owner', grantId: 'wrong-owner-grant', now: now + 3
    }), /PAIRING_UNAVAILABLE/);
    const approved = await confirmPairingRequestTransaction({ db, requestId, ownerUid, grantId, now: now + 3 });
    assert.equal(approved.viewerUid, viewerUid);
    const session = await createSharingSessionTransaction({
      db, ownerUid, deviceId, sessionId, scopes, now: now + 4
    });
    assert.equal(session.sessionId, sessionId);
    await deviceRef.update({ revoked: true });
    await assert.rejects(bindGrantToSessionTransaction({
      db, grantId, ownerUid, sessionId, now: now + 5
    }), /SHARING_UNAVAILABLE/);
    await deviceRef.update({ revoked: false });
    await bindGrantToSessionTransaction({ db, grantId, ownerUid, sessionId, now: now + 6 });
    const battery = { level: 0.6, charging: false };
    await publishTelemetryTransaction({
      db, ownerUid, deviceId, sessionId, snapshot: { battery }, now: now + 6
    });
    const grantRef = db.collection('deviceGrants').doc(grantId);
    const sessionRef = db.collection('deviceSessions').doc(sessionId);
    const telemetryRef = db.collection('deviceTelemetry').doc(ownerUid + '_' + deviceId);
    const grant = (await grantRef.get()).data();
    const liveSession = (await sessionRef.get()).data();
    assert.equal(canReadTelemetry({
      grant, session: liveSession, viewerUid, ownerUid, deviceId,
      sessionId, scope: 'battery', now: now + 7
    }), true);
    assert.equal(canReadTelemetry({
      grant, session: liveSession, viewerUid: 'other-viewer', ownerUid, deviceId,
      sessionId, scope: 'battery', now: now + 7
    }), false);
    assert.equal(canReadTelemetry({
      grant, session: liveSession, viewerUid, ownerUid, deviceId,
      sessionId, scope: 'location', now: now + 7
    }), false);
    assert.deepEqual((await telemetryRef.get()).data().snapshot, { battery });

    const handlers = [];
    class TestHttpsError extends Error {
      constructor(code, message) { super(message); this.code = code; }
    }
    const callables = buildCallables({
      db,
      HttpsErrorClass: TestHttpsError,
      onCallImpl: (_options, handler) => { handlers.push(handler); return handler; }
    });
    const readHandler = callables.readDeviceTelemetry;
    const readRequest = { auth: { uid: viewerUid, token: { firebase: { sign_in_provider: 'password' } } },
      data: { grantId, sessionId, scope: 'battery' } };
    const scopedRead = await readHandler(readRequest);
    assert.deepEqual(scopedRead.snapshot, { battery });
    await sessionRef.update({ grantIds: [] });
    await assert.rejects(readHandler(readRequest), error => error.code === 'permission-denied');
    await sessionRef.update({ grantIds: [grantId] });
    await assert.rejects(readHandler({
      ...readRequest,
      auth: { uid: 'other-viewer', token: { firebase: { sign_in_provider: 'password' } } }
    }), error => error.code === 'permission-denied');
    await assert.rejects(readHandler({
      ...readRequest, data: { ...readRequest.data, scope: 'location' }
    }), error => error.code === 'permission-denied');

    await telemetryRef.update({ expiresAt: Date.now() - 1 });
    const staleRead = await readHandler(readRequest);
    assert.deepEqual(staleRead.snapshot, null);
    await telemetryRef.update({ snapshot: { battery }, expiresAt: Date.now() + 60000 });

    await assert.rejects(publishTelemetryTransaction({
      db, ownerUid, deviceId, sessionId,
      snapshot: { location: { latitude: 11.9, longitude: 79.8, accuracy: 20 } },
      now: now + 8
    }), /SHARING_UNAVAILABLE/);
    await sessionRef.update({ expiresAt: Date.now() - 1 });
    await assert.rejects(readHandler(readRequest), error => error.code === 'permission-denied');
    await sessionRef.update({ expiresAt: Date.now() + 60000 });
    await revokeDeviceGrantTransaction({ db, grantId, ownerUid, now: now + 9 });
    assert.equal((await grantRef.get()).data().status, 'revoked');
    await assert.rejects(readHandler(readRequest), error => error.code === 'permission-denied');
    await stopSharingSessionTransaction({ db, ownerUid, sessionId, now: now + 10 });
    assert.equal((await sessionRef.get()).data().status, 'stopped');
    assert.equal((await telemetryRef.get()).exists, false);
    await assert.rejects(publishTelemetryTransaction({
      db, ownerUid, deviceId, sessionId, snapshot: { battery }, now: now + 11
    }), /SHARING_UNAVAILABLE/);
    await deviceRef.update({ revoked: true });
    await assert.rejects(createSharingSessionTransaction({
      db, ownerUid, deviceId, sessionId: 'session-revoked-device', scopes, now: Date.now() + 12
    }), /SHARING_UNAVAILABLE/);
  } finally {
    await deleteApp(app);
  }
});


test('concurrent owner approvals cannot create duplicate active grants', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId }, 'monitor-concurrency-test');
  try {
    const db = getFirestore(app);
    const deviceId = 'concurrent-phone';
    const ownerUid = 'concurrent-owner';
    const viewerUid = 'concurrent-viewer';
    await db.collection('users').doc(ownerUid).collection('devices').doc(deviceId)
      .set({ revoked: false, platform: 'android' });
    const requestData = {
      ownerUid, viewerUid, deviceId, scopes: ['battery'],
      status: 'pending', expiresAt: Date.now() + 60000
    };
    await Promise.all([
      db.collection('pairingRequests').doc('concurrent-request-a').set(requestData),
      db.collection('pairingRequests').doc('concurrent-request-b').set(requestData)
    ]);
    const outcomes = await Promise.allSettled([
      confirmPairingRequestTransaction({
        db, requestId: 'concurrent-request-a', ownerUid,
        grantId: 'concurrent-grant-a'
      }),
      confirmPairingRequestTransaction({
        db, requestId: 'concurrent-request-b', ownerUid,
        grantId: 'concurrent-grant-b'
      })
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected' &&
      result.reason.message === 'PAIRING_UNAVAILABLE').length, 1);
    const grants = await db.collection('deviceGrants')
      .where('ownerUid', '==', ownerUid)
      .where('viewerUid', '==', viewerUid)
      .where('deviceId', '==', deviceId)
      .where('status', '==', 'active').get();
    assert.equal(grants.size, 1);
  } finally {
    await deleteApp(app);
  }
});


test('revoking one viewer preserves other grants in the active session', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId }, 'monitor-revoke-one-grant-test');
  try {
    const db = getFirestore(app);
    const ownerUid = 'revoke-owner';
    const deviceId = 'revoke-phone';
    const sessionId = 'session-revoke-123456';
    const revokedGrantId = 'grant-revoke-one';
    const retainedGrantId = 'grant-retain-two';
    const relationshipId = viewerUid => require('node:crypto')
      .createHash('sha256')
      .update([ownerUid, viewerUid, deviceId].join(':'))
      .digest('hex');
    const sessionRef = db.collection('deviceSessions').doc(sessionId);
    const revokedGrantRef = db.collection('deviceGrants').doc(revokedGrantId);
    const retainedGrantRef = db.collection('deviceGrants').doc(retainedGrantId);
    await sessionRef.set({
      ownerUid, deviceId, sessionId, status: 'active',
      scopes: ['battery'], expiresAt: Date.now() + 60000,
      stoppedAt: null, grantIds: [revokedGrantId, retainedGrantId]
    });
    await revokedGrantRef.set({
      ownerUid, viewerUid: 'revoke-viewer', deviceId, sessionId,
      scopes: ['battery'], status: 'active', expiresAt: Date.now() + 60000,
      revokedAt: null
    });
    await retainedGrantRef.set({
      ownerUid, viewerUid: 'retained-viewer', deviceId, sessionId,
      scopes: ['battery'], status: 'active', expiresAt: Date.now() + 60000,
      revokedAt: null
    });
    await db.collection('activeDeviceGrantLocks').doc(relationshipId('revoke-viewer'))
      .set({ grantId: revokedGrantId, ownerUid, viewerUid: 'revoke-viewer', deviceId });
    await db.collection('activeDeviceGrantLocks').doc(relationshipId('retained-viewer'))
      .set({ grantId: retainedGrantId, ownerUid, viewerUid: 'retained-viewer', deviceId });

    await revokeDeviceGrantTransaction({
      db, grantId: revokedGrantId, ownerUid, now: Date.now()
    });

    assert.equal((await revokedGrantRef.get()).data().status, 'revoked');
    assert.equal((await retainedGrantRef.get()).data().status, 'active');
    assert.deepEqual((await sessionRef.get()).data().grantIds, [retainedGrantId]);
    assert.equal((await db.collection('activeDeviceGrantLocks').doc(relationshipId('revoke-viewer')).get()).exists, false);
    assert.equal((await db.collection('activeDeviceGrantLocks').doc(relationshipId('retained-viewer')).get()).data().grantId, retainedGrantId);
  } finally {
    await deleteApp(app);
  }
});


test('device revocation immediately blocks active viewer reads and telemetry writes', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId }, 'monitor-device-revocation-test');
  try {
    const db = getFirestore(app);
    const ownerUid = 'device-revoke-owner';
    const viewerUid = 'device-revoke-viewer';
    const deviceId = 'device-revoke-phone';
    const sessionId = 'session-device-revoke-123';
    const grantId = 'grant-device-revoke-123';
    const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(deviceId);
    const sessionRef = db.collection('deviceSessions').doc(sessionId);
    const grantRef = db.collection('deviceGrants').doc(grantId);
    await deviceRef.set({ revoked: false, platform: 'android' });
    await sessionRef.set({
      ownerUid, deviceId, sessionId, status: 'active',
      scopes: ['battery'], expiresAt: Date.now() + 60000,
      stoppedAt: null, grantIds: [grantId]
    });
    await grantRef.set({
      ownerUid, viewerUid, deviceId, sessionId, scopes: ['battery'],
      status: 'active', expiresAt: Date.now() + 60000, revokedAt: null
    });
    await db.collection('deviceTelemetry').doc(ownerUid + '_' + deviceId).set({
      ownerUid, deviceId, sessionId, snapshot: { battery: { level: 0.5, charging: false } },
      updatedAt: Date.now(), expiresAt: Date.now() + 60000
    });
    const callables = buildCallables({
      db,
      HttpsErrorClass: class TestHttpsError extends Error {
        constructor(code, message) { super(message); this.code = code; }
      },
      onCallImpl: (_options, handler) => handler
    });
    const request = {
      auth: { uid: viewerUid, token: { firebase: { sign_in_provider: 'password' } } },
      data: { grantId, sessionId, scope: 'battery' }
    };
    assert.deepEqual((await callables.readDeviceTelemetry(request)).snapshot, {
      battery: { level: 0.5, charging: false }
    });
    await deviceRef.update({ revoked: true });
    await assert.rejects(callables.readDeviceTelemetry(request),
      error => error.code === 'permission-denied');
    await assert.rejects(publishTelemetryTransaction({
      db, ownerUid, deviceId, sessionId,
      snapshot: { battery: { level: 0.4, charging: true } }
    }), /SHARING_UNAVAILABLE/);
  } finally {
    await deleteApp(app);
  }
});


test('session grant limit rejects the next viewer without changing existing bindings', { skip: !enabled }, async () => {
  const app = initializeApp({ projectId }, 'monitor-session-grant-limit-test');
  try {
    const db = getFirestore(app);
    const ownerUid = 'grant-limit-owner';
    const deviceId = 'grant-limit-phone';
    const sessionId = 'session-grant-limit-123';
    await db.collection('users').doc(ownerUid).collection('devices').doc(deviceId)
      .set({ revoked: false, platform: 'android' });
    const sessionRef = db.collection('deviceSessions').doc(sessionId);
    const grantIds = Array.from({ length: 20 }, (_, index) => 'limit-grant-' + index);
    await sessionRef.set({
      ownerUid, deviceId, sessionId, status: 'active', scopes: ['battery'],
      expiresAt: Date.now() + 60000, stoppedAt: null, grantIds
    });
    await db.collection('deviceGrants').doc('limit-grant-overflow').set({
      ownerUid, viewerUid: 'overflow-viewer', deviceId, scopes: ['battery'],
      status: 'active', createdAt: Date.now(), expiresAt: Date.now() + 60000,
      revokedAt: null, sessionId: null
    });

    await assert.rejects(bindGrantToSessionTransaction({
      db, grantId: 'limit-grant-overflow', ownerUid, sessionId
    }), /SHARING_UNAVAILABLE/);

    const session = (await sessionRef.get()).data();
    const grant = (await db.collection('deviceGrants').doc('limit-grant-overflow').get()).data();
    assert.deepEqual(session.grantIds, grantIds);
    assert.equal(grant.sessionId, null);
  } finally {
    await deleteApp(app);
  }
});
