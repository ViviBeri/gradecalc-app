'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  canReadTelemetry,
  bindGrantToSessionTransaction,
  createInviteSecret,
  createPairingInviteTransaction,
  confirmPairingRequestTransaction,
  createSharingSessionTransaction,
  publishTelemetryTransaction,
  redeemInviteTransaction,
  revokeDeviceGrantTransaction,
  stopSharingSessionTransaction
} = require('./pairing-core.cjs');

function buildCallables({ db, onCallImpl = onCall, HttpsErrorClass = HttpsError }) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('A Firestore database is required');
  }
  const HttpsError = HttpsErrorClass;

function authenticatedUid(request) {
  const uid = request.auth && request.auth.uid;
  const provider = request.auth && request.auth.token &&
    request.auth.token.firebase && request.auth.token.firebase.sign_in_provider;
  if (!uid || provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Sign-in is required.');
  }
  return uid;
}

function requiredString(value, name, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpsError('invalid-argument', `Invalid ${name}.`);
  }
  return value;
}

function callable(handler) {
  return onCallImpl({ enforceAppCheck: true, consumeAppCheckToken: true }, async request => {
    try {
      const uid = authenticatedUid(request);
      return await handler(request, uid);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof TypeError) throw new HttpsError('invalid-argument', error.message);
      if (error && error.message === 'PAIRING_UNAVAILABLE') {
        throw new HttpsError('failed-precondition', 'Pairing is unavailable or expired.');
      }
      if (error && error.message === 'SHARING_UNAVAILABLE') {
        throw new HttpsError('failed-precondition', 'Sharing is unavailable or expired.');
      }
      throw new HttpsError('internal', 'The requested operation could not be completed.');
    }
  });
}

const createPairingInvite = callable(async (request, ownerUid) => {
  const deviceId = requiredString(request.data && request.data.deviceId, 'deviceId');
  const secret = createInviteSecret();
  const inviteId = db.collection('pairingInvites').doc().id;
  const result = await createPairingInviteTransaction({
    db, ownerUid, deviceId, inviteId, secret,
    scopes: request.data.scopes
  });
  return { ...result, secret };
});

const redeemPairingInvite = callable(async (request, viewerUid) => {
  const inviteId = requiredString(request.data && request.data.inviteId, 'inviteId');
  const secret = requiredString(request.data && request.data.secret, 'secret', 128);
  const requestId = db.collection('pairingRequests').doc().id;
  return redeemInviteTransaction({ db, inviteId, secret, viewerUid, requestId });
});

const confirmPairingRequest = callable(async (request, ownerUid) => {
  const requestId = requiredString(request.data && request.data.requestId, 'requestId');
  const grantId = db.collection('deviceGrants').doc().id;
  return confirmPairingRequestTransaction({ db, requestId, ownerUid, grantId });
});

const bindGrantToSession = callable(async (request, ownerUid) => {
  const grantId = requiredString(request.data && request.data.grantId, 'grantId');
  const sessionId = requiredString(request.data && request.data.sessionId, 'sessionId');
  return bindGrantToSessionTransaction({ db, grantId, ownerUid, sessionId });
});

const revokeDeviceGrant = callable(async (request, ownerUid) => {
  const grantId = requiredString(request.data && request.data.grantId, 'grantId');
  return revokeDeviceGrantTransaction({ db, grantId, ownerUid });
});

const startDeviceSharing = callable(async (request, ownerUid) => {
  const deviceId = requiredString(request.data && request.data.deviceId, 'deviceId');
  const sessionId = db.collection('deviceSessions').doc().id;
  return createSharingSessionTransaction({
    db, ownerUid, deviceId, sessionId, scopes: request.data.scopes
  });
});

const stopDeviceSharing = callable(async (request, ownerUid) => {
  const sessionId = requiredString(request.data && request.data.sessionId, 'sessionId');
  return stopSharingSessionTransaction({ db, ownerUid, sessionId });
});

const publishDeviceTelemetry = callable(async (request, ownerUid) => {
  const deviceId = requiredString(request.data && request.data.deviceId, 'deviceId');
  const sessionId = requiredString(request.data && request.data.sessionId, 'sessionId');
  return publishTelemetryTransaction({
    db, ownerUid, deviceId, sessionId, snapshot: request.data.snapshot
  });
});

const readDeviceTelemetry = callable(async (request, viewerUid) => {
  const grantId = requiredString(request.data && request.data.grantId, 'grantId');
  const sessionId = requiredString(request.data && request.data.sessionId, 'sessionId');
  const scope = requiredString(request.data && request.data.scope, 'scope', 32);
  const grantRef = db.collection('deviceGrants').doc(grantId);
  const sessionRef = db.collection('deviceSessions').doc(sessionId);

  return db.runTransaction(async transaction => {
    const [grantSnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(grantRef),
      transaction.get(sessionRef)
    ]);
    if (!grantSnapshot.exists || !sessionSnapshot.exists) {
      throw new HttpsError('permission-denied', 'Telemetry access denied.');
    }

    const grant = grantSnapshot.data();
    const session = sessionSnapshot.data();
    if (!canReadTelemetry({
      grant, session, viewerUid, ownerUid: grant.ownerUid,
      deviceId: grant.deviceId, scope, sessionId
    })) {
      throw new HttpsError('permission-denied', 'Telemetry access denied.');
    }

    const deviceRef = db.collection('users').doc(grant.ownerUid)
      .collection('devices').doc(grant.deviceId);
    const deviceSnapshot = await transaction.get(deviceRef);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false) {
      throw new HttpsError('permission-denied', 'Telemetry access denied.');
    }

    const telemetryRef = db.collection('deviceTelemetry')
      .doc(grant.ownerUid + '_' + grant.deviceId);
    const telemetrySnapshot = await transaction.get(telemetryRef);
    if (!telemetrySnapshot.exists) return { snapshot: null, updatedAt: null };

    const telemetry = telemetrySnapshot.data();
    if (!telemetry || telemetry.sessionId !== sessionId ||
        typeof telemetry.expiresAt !== 'number' || telemetry.expiresAt <= Date.now() ||
        !telemetry.snapshot || typeof telemetry.snapshot !== 'object' ||
        Array.isArray(telemetry.snapshot)) {
      return { snapshot: null, updatedAt: null };
    }

    return {
      snapshot: Object.prototype.hasOwnProperty.call(telemetry.snapshot, scope)
        ? { [scope]: telemetry.snapshot[scope] } : {},
      updatedAt: telemetry.updatedAt
    };
  });
});

  return {
    createPairingInvite, redeemPairingInvite, confirmPairingRequest,
    bindGrantToSession, revokeDeviceGrant, startDeviceSharing,
    stopDeviceSharing, publishDeviceTelemetry, readDeviceTelemetry
  };
}

module.exports = { buildCallables };
