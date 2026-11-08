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
