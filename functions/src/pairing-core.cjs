'use strict';

const crypto = require('node:crypto');

const INVITE_TTL_MS = 5 * 60 * 1000;
const PENDING_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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


async function createPairingInviteTransaction({ db, ownerUid, deviceId, inviteId, secret, scopes, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) throw new TypeError('Invalid device');
  if (typeof inviteId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(inviteId)) throw new TypeError('Invalid invitation');
  const secretHash = hashInviteSecret(secret);
  const approvedScopes = normalizeScopes(scopes);
  const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(deviceId);
  const inviteRef = db.collection('pairingInvites').doc(inviteId);
  return db.runTransaction(async transaction => {
    const [deviceSnapshot, inviteSnapshot] = await Promise.all([
      transaction.get(deviceRef), transaction.get(inviteRef)
    ]);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false || inviteSnapshot.exists) {
      throw new Error('PAIRING_UNAVAILABLE');
    }
    const invite = {
      ownerUid, deviceId, secretHash, scopes: approvedScopes,
      createdAt: now, expiresAt: now + INVITE_TTL_MS,
      consumedAt: null, revokedAt: null
    };
    transaction.create(inviteRef, invite);
    return { inviteId, expiresAt: invite.expiresAt, scopes: approvedScopes };
  });
}

const REDEMPTION_WINDOW_MS = 15 * 60 * 1000;
const MAX_VIEWER_REDEMPTION_ATTEMPTS = 10;
const MAX_INVITE_FAILED_ATTEMPTS = 5;

async function redeemInviteTransaction({ db, inviteId, secret, viewerUid, requestId, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof inviteId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(inviteId)) throw new TypeError('Invalid invitation');
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new TypeError('Invalid request');
  if (typeof viewerUid !== 'string' || !viewerUid.trim() || viewerUid.length > 128) throw new TypeError('Authentication required');
  const suppliedHash = hashInviteSecret(secret);
  const inviteRef = db.collection('pairingInvites').doc(inviteId);
  const requestRef = db.collection('pairingRequests').doc(requestId);
  const windowStart = Math.floor(now / REDEMPTION_WINDOW_MS) * REDEMPTION_WINDOW_MS;
  const viewerKey = crypto.createHash('sha256').update(viewerUid, 'utf8').digest('hex');
  const limitRef = db.collection('pairingRedemptionLimits').doc(viewerKey + '_' + windowStart);

  const outcome = await db.runTransaction(async transaction => {
    const [snapshot, limitSnapshot] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(limitRef)
    ]);
    const limit = limitSnapshot.exists ? limitSnapshot.data() : { windowStart, attempts: 0 };
    if (limit.windowStart !== windowStart || !Number.isSafeInteger(limit.attempts) || limit.attempts < 0) {
      throw new Error('PAIRING_UNAVAILABLE');
    }
    if (limit.attempts >= MAX_VIEWER_REDEMPTION_ATTEMPTS) return { denied: true };
    const nextLimit = { windowStart, attempts: limit.attempts + 1 };
    const writeLimit = () => {
      if (limitSnapshot.exists) transaction.update(limitRef, nextLimit);
      else transaction.create(limitRef, nextLimit);
    };

    if (!snapshot.exists) {
      writeLimit();
      return { denied: true };
    }
    const invite = snapshot.data();
    const failedAttempts = Number.isSafeInteger(invite.failedAttempts) && invite.failedAttempts >= 0
      ? invite.failedAttempts : 0;
    const failInvite = () => {
      writeLimit();
      if (failedAttempts < MAX_INVITE_FAILED_ATTEMPTS) {
        transaction.update(inviteRef, { failedAttempts: failedAttempts + 1 });
      }
      return { denied: true };
    };
    if (!isInviteActive(invite, now) ||
      (Number.isSafeInteger(invite.failedAttempts) && invite.failedAttempts >= MAX_INVITE_FAILED_ATTEMPTS)) {
      return failInvite();
    }
    const stored = Buffer.from(invite.secretHash, 'hex');
    const supplied = Buffer.from(suppliedHash, 'hex');
    if (stored.length !== supplied.length || !crypto.timingSafeEqual(stored, supplied)) return failInvite();
    if (invite.ownerUid === viewerUid) return failInvite();
    if (typeof invite.ownerUid !== 'string' || typeof invite.deviceId !== 'string' ||
      !Array.isArray(invite.scopes)) return failInvite();
    let scopes;
    try { scopes = normalizeScopes(invite.scopes); } catch { return failInvite(); }
    const deviceRef = db.collection('users').doc(invite.ownerUid)
      .collection('devices').doc(invite.deviceId);
    const [deviceSnapshot, requestSnapshot] = await Promise.all([
      transaction.get(deviceRef),
      transaction.get(requestRef)
    ]);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false || requestSnapshot.exists) {
      return failInvite();
    }

    writeLimit();
    transaction.update(inviteRef, { consumedAt: now });
    transaction.create(requestRef, {
      inviteId,
      ownerUid: invite.ownerUid,
      deviceId: invite.deviceId,
      viewerUid,
      scopes,
      status: 'pending',
      createdAt: now,
      expiresAt: now + PENDING_REQUEST_TTL_MS
    });
    return { requestId, status: 'pending', scopes };
  });
  if (outcome.denied) throw new Error('PAIRING_UNAVAILABLE');
  return outcome;
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
      typeof request.expiresAt !== 'number' || request.expiresAt <= now) throw new Error('PAIRING_UNAVAILABLE');
    const scopes = normalizeScopes(request.scopes);
    const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(request.deviceId);
    const relationshipId = crypto.createHash('sha256').update([ownerUid, request.viewerUid, request.deviceId].join(':')).digest('hex');
    const relationshipRef = db.collection('activeDeviceGrantLocks').doc(relationshipId);
    const [deviceSnapshot, grantSnapshot, relationshipSnapshot] = await Promise.all([
      transaction.get(deviceRef), transaction.get(grantRef), transaction.get(relationshipRef)
    ]);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false || grantSnapshot.exists) throw new Error('PAIRING_UNAVAILABLE');
    if (relationshipSnapshot.exists) {
      const existingId = relationshipSnapshot.data().grantId;
      if (typeof existingId === 'string') {
        const existingRef = db.collection('deviceGrants').doc(existingId);
        const existingSnapshot = await transaction.get(existingRef);
        if (existingSnapshot.exists) {
          const existing = existingSnapshot.data();
          if (existing.status === 'active' && existing.revokedAt == null &&
            typeof existing.expiresAt === 'number' && existing.expiresAt > now) throw new Error('PAIRING_UNAVAILABLE');
        }
      }
    }
    transaction.create(grantRef, {
      ownerUid, viewerUid: request.viewerUid, deviceId: request.deviceId, scopes,
      status: 'active', createdAt: now, expiresAt: now + GRANT_TTL_MS,
      revokedAt: null, sessionId: null
    });
    transaction.set(relationshipRef, { grantId, ownerUid, viewerUid: request.viewerUid, deviceId: request.deviceId, expiresAt: now + GRANT_TTL_MS });
    transaction.update(requestRef, { status: 'approved', approvedAt: now, grantId });
    return { grantId, viewerUid: request.viewerUid, deviceId: request.deviceId, scopes };
  });
}



async function createSharingSessionTransaction({ db, ownerUid, deviceId, sessionId, scopes, now = Date.now(), sessionTtlMs = 15 * 60 * 1000 }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)) throw new TypeError('Invalid device');
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) throw new TypeError('Invalid session');
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 60000 || sessionTtlMs > 3600000) throw new TypeError('Invalid session TTL');
  const approvedScopes = normalizeScopes(scopes);
  const deviceRef = db.collection('users').doc(ownerUid).collection('devices').doc(deviceId);
  const sessionRef = db.collection('deviceSessions').doc(sessionId);
  return db.runTransaction(async transaction => {
    const deviceSnapshot = await transaction.get(deviceRef);
    if (!deviceSnapshot.exists || deviceSnapshot.data().revoked !== false) throw new Error('SHARING_UNAVAILABLE');
    const sessionSnapshot = await transaction.get(sessionRef);
    if (sessionSnapshot.exists) throw new Error('SHARING_UNAVAILABLE');
    const session = { ownerUid, deviceId, sessionId, scopes: approvedScopes, status: 'active', createdAt: now, expiresAt: now + sessionTtlMs, stoppedAt: null, grantIds: [] };
    transaction.create(sessionRef, session);
    return { sessionId, scopes: approvedScopes, expiresAt: session.expiresAt };
  });
}

async function stopSharingSessionTransaction({ db, ownerUid, sessionId, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) throw new TypeError('Invalid session');
  const sessionRef = db.collection('deviceSessions').doc(sessionId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) throw new Error('SHARING_UNAVAILABLE');
    const session = snapshot.data();
    if (session.ownerUid !== ownerUid || session.status !== 'active') throw new Error('SHARING_UNAVAILABLE');
    const ids = Array.isArray(session.grantIds) ? [...new Set(session.grantIds)] : [];
    const refs = ids.map(id => db.collection('deviceGrants').doc(id));
    const grantSnapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const telemetryRef = db.collection('deviceTelemetry').doc(ownerUid + '_' + session.deviceId);
    const telemetrySnapshot = await transaction.get(telemetryRef);
    const locks = [];
    for (let i = 0; i < grantSnapshots.length; i++) {
      if (!grantSnapshots[i].exists) continue;
      const grant = grantSnapshots[i].data();
      if (grant.ownerUid === ownerUid && grant.sessionId === sessionId && typeof grant.viewerUid === 'string') {
        const key = crypto.createHash('sha256').update([ownerUid, grant.viewerUid, grant.deviceId].join(':')).digest('hex');
        locks.push({ grantId: ids[i], ref: db.collection('activeDeviceGrantLocks').doc(key) });
      }
    }
    const lockSnapshots = await Promise.all(locks.map(lock => transaction.get(lock.ref)));
    transaction.update(sessionRef, { status: 'stopped', stoppedAt: now, expiresAt: now, grantIds: [] });
    for (let i = 0; i < grantSnapshots.length; i++) {
      if (grantSnapshots[i].exists) {
        const grant = grantSnapshots[i].data();
        if (grant.ownerUid === ownerUid && grant.sessionId === sessionId && grant.status === 'active') {
          transaction.update(refs[i], { status: 'revoked', revokedAt: now });
        }
      }
    }
    for (let i = 0; i < locks.length; i++) {
      if (lockSnapshots[i].exists && lockSnapshots[i].data().grantId === locks[i].grantId) transaction.delete(locks[i].ref);\n    }
    if (telemetrySnapshot.exists && telemetrySnapshot.data().sessionId === sessionId) transaction.delete(telemetryRef);
    return { sessionId, status: 'stopped', stoppedAt: now };
  });
}

async function bindGrantToSessionTransaction({ db, grantId, ownerUid, sessionId, now = Date.now() }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A transaction-capable database is required');
  if (typeof grantId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(grantId)) throw new TypeError('Invalid grant');
  if (typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid.length > 128) throw new TypeError('Authentication required');
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) throw new TypeError('Invalid session');
  const grantRef = db.collection('deviceGrants').doc(grantId);
  const sessionRef = db.collection('deviceSessions').doc(sessionId);
  return db.runTransaction(async transaction => {
    const [grantSnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(grantRef), transaction.get(sessionRef)
    ]);
    if (!grantSnapshot.exists || !sessionSnapshot.exists) throw new Error('SHARING_UNAVAILABLE');
    const grant = grantSnapshot.data();
    const session = sessionSnapshot.data();
    let grantScopes;
    let sessionScopes;
    try {
      grantScopes = normalizeScopes(grant.scopes);
      sessionScopes = normalizeScopes(session.scopes);
    } catch {
      throw new Error('SHARING_UNAVAILABLE');
    }
    if (grant.ownerUid !== ownerUid || grant.status !== 'active' ||
      typeof grant.viewerUid !== 'string' ||
      typeof grant.expiresAt !== 'number' || grant.expiresAt <= now ||
      grant.sessionId != null ||
      session.ownerUid !== ownerUid || session.status !== 'active' ||
      session.sessionId !== sessionId ||
      typeof session.expiresAt !== 'number' || session.expiresAt <= now ||
      session.deviceId !== grant.deviceId ||
      !grantScopes.every(scope => sessionScopes.includes(scope))) {
      throw new Error('SHARING_UNAVAILABLE');
    }
    const grantIds = Array.isArray(session.grantIds) ? session.grantIds : [];
    if (grantIds.includes(grantId)) throw new Error('SHARING_UNAVAILABLE');
    transaction.update(grantRef, { sessionId });
    transaction.update(sessionRef, { grantIds: [...grantIds, grantId] });
    return { grantId, sessionId, status: 'bound' };
  });
}

function canReadTelemetry({ grant, session, viewerUid, ownerUid, deviceId, scope, sessionId, now = Date.now() }) {
  if (!grant || typeof grant !== 'object' || grant.status !== 'active' ||
    grant.ownerUid !== ownerUid || grant.viewerUid !== viewerUid ||
    grant.deviceId !== deviceId || grant.sessionId !== sessionId || grant.revokedAt != null ||
    typeof grant.expiresAt !== 'number' || grant.expiresAt <= now ||
    !session || typeof session !== 'object' || session.status !== 'active' ||
    session.ownerUid !== ownerUid || session.deviceId !== deviceId ||
    session.sessionId !== sessionId || typeof sessionId !== 'string' ||
    typeof session.expiresAt !== 'number' || session.expiresAt <= now ||
    session.stoppedAt != null) return false;
  let grantScopes;
  let sessionScopes;
  try {
    grantScopes = normalizeScopes(grant.scopes);
    sessionScopes = normalizeScopes(session.scopes);
  } catch { return false; }
  return grantScopes.includes(scope) && sessionScopes.includes(scope);
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
      typeof grant.viewerUid !== 'string' || typeof grant.deviceId !== 'string') throw new Error('PAIRING_UNAVAILABLE');
    const key = crypto.createHash('sha256').update([ownerUid, grant.viewerUid, grant.deviceId].join(':')).digest('hex');
    const lockRef = db.collection('activeDeviceGrantLocks').doc(key);
    const sessionRef = typeof grant.sessionId === 'string' ? db.collection('deviceSessions').doc(grant.sessionId) : null;
    const [lockSnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(lockRef), sessionRef ? transaction.get(sessionRef) : Promise.resolve(null)
    ]);
    transaction.update(grantRef, { status: 'revoked', revokedAt: now });
    if (lockSnapshot.exists && lockSnapshot.data().grantId === grantId) transaction.delete(lockRef);
    if (sessionSnapshot && sessionSnapshot.exists) {
      const session = sessionSnapshot.data();
      transaction.update(sessionRef, { grantIds: (Array.isArray(session.grantIds) ? session.grantIds : []).filter(id => id !== grantId) });
    }
    return { grantId, status: 'revoked', revokedAt: now };
  });
}

module.exports = {
  ALLOWED_SCOPES,
  bindGrantToSessionTransaction,
  canReadTelemetry,
  createSharingSessionTransaction,
  createPairingInviteTransaction,
  INVITE_TTL_MS,
  PENDING_REQUEST_TTL_MS,
  GRANT_TTL_MS,
  REDEMPTION_WINDOW_MS,
  MAX_VIEWER_REDEMPTION_ATTEMPTS,
  MAX_INVITE_FAILED_ATTEMPTS,
  createInviteSecret,
  confirmPairingRequestTransaction,
  hashInviteSecret,
  isInviteActive,
  normalizeScopes,
  publishTelemetryTransaction,
  redeemInviteTransaction,
  revokeDeviceGrantTransaction,
  validateTelemetry,
  validateTelemetryEnvelope,
  stopSharingSessionTransaction
};
