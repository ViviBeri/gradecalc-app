'use strict';

const crypto = require('node:crypto');

const INVITE_TTL_MS = 5 * 60 * 1000;
const ALLOWED_SCOPES = Object.freeze([
  'location',
  'battery',
  'network',
  'device',
  'permissionStatus',
  'appStatus'
]);
const PLATFORMS = Object.freeze(['web', 'android', 'ios', 'unknown']);
const NETWORK_TYPES = Object.freeze(['slow-2g', '2g', '3g', '4g', 'unknown']);
const PERMISSION_STATES = Object.freeze(['granted', 'denied', 'prompt', 'unavailable']);

function createInviteSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashInviteSecret(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{40,}$/.test(secret)) {
    throw new TypeError('Invalid pairing secret');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function isInviteActive(invite, now = Date.now()) {
  return Boolean(
    invite &&
    typeof invite.secretHash === 'string' &&
    typeof invite.expiresAt === 'number' &&
    Number.isFinite(invite.expiresAt) &&
    invite.expiresAt > now &&
    invite.consumedAt == null &&
    invite.revokedAt == null
  );
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > ALLOWED_SCOPES.length) {
    throw new TypeError('Invalid sharing scopes');
  }
  const unique = [...new Set(scopes)];
  if (unique.length !== scopes.length || unique.some(scope => !ALLOWED_SCOPES.includes(scope))) {
    throw new TypeError('Invalid sharing scopes');
  }
  return unique;
}

function validateTelemetry(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const allowed = new Set([
    'location', 'battery', 'network', 'device', 'permissionStatus', 'appStatus'
  ]);
  if (Object.keys(snapshot).some(key => !allowed.has(key))) return false;

  if ('location' in snapshot) {
    const v = snapshot.location;
    if (!v || typeof v !== 'object' ||
      !Number.isFinite(v.latitude) || v.latitude < -90 || v.latitude > 90 ||
      !Number.isFinite(v.longitude) || v.longitude < -180 || v.longitude > 180 ||
      !Number.isFinite(v.accuracy) || v.accuracy < 0 || Object.keys(v).some(key => !['latitude', 'longitude', 'accuracy'].includes(key))) return false;
  }
  if ('battery' in snapshot) {
    const v = snapshot.battery;
    if (!v || typeof v !== 'object' ||
      !Number.isFinite(v.level) || v.level < 0 || v.level > 1 ||
      typeof v.charging !== 'boolean' || Object.keys(v).some(key => !['level', 'charging'].includes(key))) return false;
  }
  if ('network' in snapshot) {
    const v = snapshot.network;
    if (!v || typeof v !== 'object' || typeof v.online !== 'boolean' ||
      !NETWORK_TYPES.includes(v.effectiveType) ||
      Object.keys(v).some(key => !['online', 'effectiveType'].includes(key))) return false;
  }
  if ('device' in snapshot) {
    const v = snapshot.device;
    if (!v || typeof v !== 'object' || !PLATFORMS.includes(v.platform) ||
      typeof v.appVersion !== 'string' || v.appVersion.length > 32 ||
      Object.keys(v).some(key => !['platform', 'appVersion'].includes(key))) return false;
  }
  if ('permissionStatus' in snapshot) {
    const v = snapshot.permissionStatus;
    if (!v || typeof v !== 'object' ||
      !PERMISSION_STATES.includes(v.camera) ||
      !PERMISSION_STATES.includes(v.microphone) ||
      Object.keys(v).some(key => !['camera', 'microphone'].includes(key))) return false;
  }
  if ('appStatus' in snapshot) {
    const v = snapshot.appStatus;
    if (!v || typeof v !== 'object' || v.active !== true ||
      Object.keys(v).some(key => key !== 'active')) return false;
  }
  return true;
}


async function redeemInviteTransaction({ db, inviteId, secret, viewerUid, requestId, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof inviteId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(inviteId)) throw new TypeError('Invalid invitation');
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new TypeError('Invalid request');
  if (typeof viewerUid !== 'string' || !viewerUid.trim() || viewerUid.length > 128) throw new TypeError('Authentication required');
  const suppliedHash = hashInviteSecret(secret);
  const inviteRef = db.collection('pairingInvites').doc(inviteId);
  const requestRef = db.collection('pairingRequests').doc(requestId);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(inviteRef);
    if (!snapshot.exists) throw new Error('PAIRING_UNAVAILABLE');
    const invite = snapshot.data();
    if (!isInviteActive(invite, now)) throw new Error('PAIRING_UNAVAILABLE');
    const stored = Buffer.from(invite.secretHash, 'hex');
    const supplied = Buffer.from(suppliedHash, 'hex');
    if (stored.length !== supplied.length || !crypto.timingSafeEqual(stored, supplied)) {
      throw new Error('PAIRING_UNAVAILABLE');
    }
    if (invite.ownerUid === viewerUid) throw new Error('PAIRING_UNAVAILABLE');
    if (typeof invite.ownerUid !== 'string' || typeof invite.deviceId !== 'string' ||
      !Array.isArray(invite.scopes)) throw new Error('PAIRING_UNAVAILABLE');
    const scopes = normalizeScopes(invite.scopes);
    const requestSnapshot = await transaction.get(requestRef);
    if (requestSnapshot.exists) throw new Error('PAIRING_UNAVAILABLE');

    transaction.update(inviteRef, { consumedAt: now });
    transaction.create(requestRef, {
      inviteId,
      ownerUid: invite.ownerUid,
      deviceId: invite.deviceId,
      viewerUid,
      scopes,
      status: 'pending',
      createdAt: now,
      expiresAt: Math.min(invite.expiresAt, now + INVITE_TTL_MS)
    });
    return { requestId, status: 'pending', scopes };
  });
}


async function confirmPairingRequestTransaction({ db, requestId, ownerUid, grantId, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new TypeError('Invalid request');
  if (typeof grantId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(grantId)) throw new TypeError('Invalid grant');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  const requestRef = db.collection('pairingRequests').doc(requestId);
  const grantRef = db.collection('deviceGrants').doc(grantId);

  return db.runTransaction(async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new Error('PAIRING_UNAVAILABLE');
    const request = requestSnapshot.data();
    if (request.status !== 'pending' || request.ownerUid !== ownerUid ||
      typeof request.viewerUid !== 'string' || request.viewerUid === ownerUid ||
      typeof request.deviceId !== 'string' ||
      typeof request.expiresAt !== 'number' || request.expiresAt <= now) {
      throw new Error('PAIRING_UNAVAILABLE');
    }
    const scopes = normalizeScopes(request.scopes);
    const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(request.deviceId);
    const [deviceSnapshot, grantSnapshot] = await Promise.all([
      transaction.get(deviceRef),
      transaction.get(grantRef)
    ]);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false || grantSnapshot.exists) {
      throw new Error('PAIRING_UNAVAILABLE');
    }
    transaction.create(grantRef, {
      ownerUid,
      viewerUid: request.viewerUid,
      deviceId: request.deviceId,
      scopes,
      status: 'active',
      createdAt: now,
      expiresAt: Math.min(request.expiresAt, now + INVITE_TTL_MS),
      revokedAt: null
    });
    transaction.update(requestRef, { status: 'approved', approvedAt: now, grantId });
    return { grantId, viewerUid: request.viewerUid, deviceId: request.deviceId, scopes };
  });
}



function canReadTelemetry({ grant, viewerUid, ownerUid, deviceId, scope, sessionId, now = Date.now() }) {
  if (!grant || typeof grant !== 'object' || grant.status !== 'active' ||
    grant.ownerUid !== ownerUid || grant.viewerUid !== viewerUid ||
    grant.deviceId !== deviceId || typeof sessionId !== 'string' || !sessionId ||
    grant.sessionId !== sessionId ||
    typeof grant.expiresAt !== 'number' || grant.expiresAt <= now ||
    grant.revokedAt != null) return false;
  let scopes;
  try { scopes = normalizeScopes(grant.scopes); } catch { return false; }
  return scopes.includes(scope);
}

function validateTelemetryEnvelope({ snapshot, grant, ownerUid, deviceId, sessionId, now = Date.now() }) {
  if (!validateTelemetry(snapshot) || !grant || grant.status !== 'active' ||
    grant.ownerUid !== ownerUid || grant.deviceId !== deviceId ||
    grant.sessionId !== sessionId || grant.revokedAt != null ||
    typeof grant.expiresAt !== 'number' || grant.expiresAt <= now ||
    typeof sessionId !== 'string' || sessionId.length < 16 || sessionId.length > 128) return false;
  let scopes;
  try { scopes = normalizeScopes(grant.scopes); } catch { return false; }
  return Object.keys(snapshot).every(key => scopes.includes(key));
}

async function publishTelemetryTransaction({ db, ownerUid, deviceId, sessionId, snapshot, now = Date.now(), telemetryTtlMs = 2 * 60 * 1000 }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) throw new TypeError('Invalid device');
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) throw new TypeError('Invalid session');
  if (!Number.isSafeInteger(telemetryTtlMs) || telemetryTtlMs < 10000 || telemetryTtlMs > 300000) throw new TypeError('Invalid telemetry TTL');
  const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(deviceId);
  const sessionRef = db.collection('deviceSessions').doc(sessionId);
  const telemetryRef = db.collection('deviceTelemetry').doc(ownerUid + '_' + deviceId);

  return db.runTransaction(async transaction => {
    const [deviceSnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(deviceRef), transaction.get(sessionRef)
    ]);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false ||
      !sessionSnapshot.exists) throw new Error('SHARING_UNAVAILABLE');
    const session = sessionSnapshot.data();
    if (session.ownerUid !== ownerUid || session.deviceId !== deviceId ||
      session.status !== 'active' || session.sessionId !== sessionId ||
      typeof session.expiresAt !== 'number' || session.expiresAt <= now ||
      !validateTelemetryEnvelope({ snapshot, grant: session, ownerUid, deviceId, sessionId, now })) {
      throw new Error('SHARING_UNAVAILABLE');
    }
    transaction.set(telemetryRef, {
      ownerUid, deviceId, sessionId, snapshot,
      updatedAt: now, expiresAt: now + telemetryTtlMs
    });
    return { updatedAt: now, expiresAt: now + telemetryTtlMs };
  });
}

async function revokeDeviceGrantTransaction({ db, grantId, ownerUid, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof grantId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(grantId)) throw new TypeError('Invalid grant');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  const grantRef = db.collection('deviceGrants').doc(grantId);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(grantRef);
    if (!snapshot.exists) throw new Error('PAIRING_UNAVAILABLE');
    const grant = snapshot.data();
    if (grant.ownerUid !== ownerUid || grant.status !== 'active' ||
      typeof grant.viewerUid !== 'string' || typeof grant.deviceId !== 'string') {
      throw new Error('PAIRING_UNAVAILABLE');
    }
    transaction.update(grantRef, {
      status: 'revoked',
      revokedAt: now
    });
    return { grantId, status: 'revoked', revokedAt: now };
  });
}

module.exports = {
  ALLOWED_SCOPES,
  canReadTelemetry,
  INVITE_TTL_MS,
  createInviteSecret,
  confirmPairingRequestTransaction,
  hashInviteSecret,
  isInviteActive,
  normalizeScopes,
  publishTelemetryTransaction,
  redeemInviteTransaction,
  revokeDeviceGrantTransaction,
  validateTelemetry,
  validateTelemetryEnvelope
};
