'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ALLOWED_SCOPES,
  INVITE_TTL_MS,
  createInviteSecret,
  confirmPairingRequestTransaction,
  canReadTelemetry,
  createSharingSessionTransaction,
  stopSharingSessionTransaction,
  publishTelemetryTransaction,
  hashInviteSecret,
  isInviteActive,
  normalizeScopes,
  redeemInviteTransaction,
  revokeDeviceGrantTransaction,
  validateTelemetry
} = require('../functions/src/pairing-core.cjs');

test('pairing secrets use high-entropy URL-safe random material and hash deterministically', () => {
  const first = createInviteSecret();
  const second = createInviteSecret();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(hashInviteSecret(first), hashInviteSecret(first));
  assert.notEqual(hashInviteSecret(first), first);
  assert.throws(() => hashInviteSecret('short'), TypeError);
});

test('invite expiry, consumption, and revocation are enforced', () => {
  const now = 100000;
  const active = {
    secretHash: 'a'.repeat(64),
    expiresAt: now + INVITE_TTL_MS,
    consumedAt: null,
    revokedAt: null
  };
  assert.equal(isInviteActive(active, now), true);
  assert.equal(isInviteActive(active, active.expiresAt), false);
  assert.equal(isInviteActive({ ...active, consumedAt: now }, now), false);
  assert.equal(isInviteActive({ ...active, revokedAt: now }, now), false);
  assert.equal(isInviteActive(null, now), false);
});

test('sharing scopes accept only unique allowlisted values', () => {
  assert.deepEqual(normalizeScopes(['location', 'battery']), ['location', 'battery']);
  assert.deepEqual(ALLOWED_SCOPES, [
    'location', 'battery', 'network', 'device', 'permissionStatus', 'appStatus'
  ]);
  assert.throws(() => normalizeScopes(['location', 'location']), TypeError);
  assert.throws(() => normalizeScopes(['*']), TypeError);
  assert.throws(() => normalizeScopes([]), TypeError);
});

test('telemetry accepts bounded allowlisted values', () => {
  assert.equal(validateTelemetry({
    location: { latitude: 11.9, longitude: 79.8, accuracy: 12 },
    battery: { level: 0.75, charging: false },
    network: { online: true, effectiveType: '4g' },
    device: { platform: 'android', appVersion: '1.0.0' },
    permissionStatus: { camera: 'prompt', microphone: 'denied' },
    appStatus: { active: true }
  }), true);
});

test('telemetry rejects invalid coordinates, identifiers, and unknown fields', () => {
  assert.equal(validateTelemetry({ location: { latitude: 91, longitude: 0, accuracy: 1 } }), false);
  assert.equal(validateTelemetry({ location: { latitude: 0, longitude: 0, accuracy: 1, ip: '127.0.0.1' } }), false);
  assert.equal(validateTelemetry({ battery: { level: 2, charging: false } }), false);
  assert.equal(validateTelemetry({ network: { online: true, effectiveType: '4g', ssid: 'private' } }), false);
  assert.equal(validateTelemetry({ device: { platform: 'android', appVersion: '1', serial: 'secret' } }), false);
  assert.equal(validateTelemetry({ permissionStatus: { camera: 'granted', microphone: 'granted', audio: true } }), false);
  assert.equal(validateTelemetry({ appStatus: { active: true, hidden: true } }), false);
  assert.equal(validateTelemetry({ location: null }), false);
  assert.equal(validateTelemetry({ unexpected: true }), false);
});


test('invite redemption atomically consumes a valid invite and creates a pending request', async () => {
  const secret = createInviteSecret();
  const invite = {
    secretHash: hashInviteSecret(secret),
    ownerUid: 'owner-a',
    deviceId: 'phone-a',
    scopes: ['battery', 'location'],
    expiresAt: 900000,
    consumedAt: null,
    revokedAt: null
  };
  const records = new Map([['pairingInvites/invite-a', invite]]);
  const db = {
    collection(name) {
      return {
        doc(id) {
          const key = name + '/' + id;
          return { key };
        }
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          const value = records.get(ref.key);
          return { exists: value !== undefined, data: () => value };
        },
        update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); },
        create(ref, value) {
          writes.push(() => {
            if (records.has(ref.key)) throw new Error('already-exists');
            records.set(ref.key, value);
          });
        }
      };
      const result = await callback(transaction);
      writes.forEach(write => write());
      return result;
    }
  };

  const result = await redeemInviteTransaction({
    db, inviteId: 'invite-a', secret, viewerUid: 'viewer-b',
    requestId: 'request-a', now: 100000
  });
  assert.equal(result.status, 'pending');
  assert.deepEqual(result.scopes, ['battery', 'location']);
  assert.equal(records.get('pairingInvites/invite-a').consumedAt, 100000);
  assert.equal(records.get('pairingRequests/request-a').viewerUid, 'viewer-b');
  assert.equal(records.get('pairingRequests/request-a').status, 'pending');
});

test('invite redemption rejects replay, wrong secrets, and self-pairing', async () => {
  const secret = createInviteSecret();
  const invite = {
    secretHash: hashInviteSecret(secret),
    ownerUid: 'owner-a',
    deviceId: 'phone-a',
    scopes: ['battery'],
    expiresAt: 900000,
    consumedAt: null,
    revokedAt: null
  };
  const records = new Map([['pairingInvites/invite-a', invite]]);
  const db = {
    collection(name) {
      return { doc(id) { return { key: name + '/' + id }; } };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) { const value = records.get(ref.key); return { exists: value !== undefined, data: () => value }; },
        update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); },
        create(ref, value) { writes.push(() => records.set(ref.key, value)); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };
  await assert.rejects(redeemInviteTransaction({
    db, inviteId: 'invite-a', secret: 'A'.repeat(43), viewerUid: 'viewer-b',
    requestId: 'wrong-secret', now: 100000
  }), /PAIRING_UNAVAILABLE/);
  await assert.rejects(redeemInviteTransaction({
    db, inviteId: 'invite-a', secret, viewerUid: 'owner-a',
    requestId: 'self-pair', now: 100000
  }), /PAIRING_UNAVAILABLE/);
  await redeemInviteTransaction({
    db, inviteId: 'invite-a', secret, viewerUid: 'viewer-b',
    requestId: 'first-redemption', now: 100000
  });
  await assert.rejects(redeemInviteTransaction({
    db, inviteId: 'invite-a', secret, viewerUid: 'viewer-c',
    requestId: 'replay', now: 100001
  }), /PAIRING_UNAVAILABLE/);
});


test('only the owning account can approve a pending request for an active device', async () => {
  const request = {
    ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
    scopes: ['battery'], status: 'pending', expiresAt: 500000
  };
  const device = { deviceName: 'Phone', revoked: false };
  const records = new Map([
    ['pairingRequests/request-a', request],
    ['users/owner-a/devices/phone-a', device]
  ]);
  const db = {
    collection(name) {
      return {
        doc(id) {
          const key = name + '/' + id;
          return {
            key,
            collection(child) {
              return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } };
            }
          };
        }
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) { const value = records.get(ref.key); return { exists: value !== undefined, data: () => value }; },
        create(ref, value) { writes.push(() => { if (records.has(ref.key)) throw new Error('already-exists'); records.set(ref.key, value); }); },
        update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };

  await assert.rejects(confirmPairingRequestTransaction({
    db, requestId: 'request-a', ownerUid: 'attacker', grantId: 'grant-b', now: 100000
  }), /PAIRING_UNAVAILABLE/);
  const approved = await confirmPairingRequestTransaction({
    db, requestId: 'request-a', ownerUid: 'owner-a', grantId: 'grant-a', now: 100000
  });
  assert.equal(approved.viewerUid, 'viewer-b');
  assert.deepEqual(approved.scopes, ['battery']);
  assert.equal(records.get('pairingRequests/request-a').status, 'approved');
  assert.equal(records.get('deviceGrants/grant-a').status, 'active');
  assert.equal(records.get('deviceGrants/grant-a').ownerUid, 'owner-a');
});

test('owner approval rejects expired, revoked-device, and already-approved requests', async () => {
  async function makeDb({ expiresAt = 500000, revoked = false, status = 'pending' } = {}) {
    const records = new Map([
      ['pairingRequests/request-a', {
        ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
        scopes: ['location'], status, expiresAt
      }],
      ['users/owner-a/devices/phone-a', { revoked }]
    ]);
    return {
      collection(name) {
        return { doc(id) { const key = name + '/' + id; return {
          key,
          collection(child) { return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } }; }
        }; } };
      },
      async runTransaction(callback) {
        const writes = [];
        const tx = {
          async get(ref) { const value = records.get(ref.key); return { exists: value !== undefined, data: () => value }; },
          create(ref, value) { writes.push(() => records.set(ref.key, value)); },
          update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); }
        };
        const result = await callback(tx);
        writes.forEach(write => write());
        return result;
      }
    };
  }
  for (const options of [
    { expiresAt: 100000 },
    { revoked: true },
    { status: 'approved' }
  ]) {
    await assert.rejects(confirmPairingRequestTransaction({
      db: await makeDb(options), requestId: 'request-a',
      ownerUid: 'owner-a', grantId: 'grant-a', now: 100000
    }), /PAIRING_UNAVAILABLE/);
  }
});


test('only the grant owner can revoke an active device grant', async () => {
  const records = new Map([['deviceGrants/grant-a', {
    ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
    status: 'active', revokedAt: null
  }]]);
  const db = {
    collection(name) {
      return { doc(id) { return { key: name + '/' + id }; } };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) { const value = records.get(ref.key); return { exists: value !== undefined, data: () => value }; },
        update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };

  await assert.rejects(revokeDeviceGrantTransaction({
    db, grantId: 'grant-a', ownerUid: 'attacker', now: 200000
  }), /PAIRING_UNAVAILABLE/);
  const result = await revokeDeviceGrantTransaction({
    db, grantId: 'grant-a', ownerUid: 'owner-a', now: 200000
  });
  assert.equal(result.status, 'revoked');
  assert.equal(records.get('deviceGrants/grant-a').status, 'revoked');
  assert.equal(records.get('deviceGrants/grant-a').revokedAt, 200000);
  await assert.rejects(revokeDeviceGrantTransaction({
    db, grantId: 'grant-a', ownerUid: 'owner-a', now: 200001
  }), /PAIRING_UNAVAILABLE/);
});


test('backend contract requires verified authentication context for owner identity', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const contract = fs.readFileSync(path.join(__dirname, '../docs/device-monitor-backend-contract.md'), 'utf8');
  assert.match(contract, /derive owner\/viewer UIDs only from verified auth context/i);
  assert.match(contract, /never accept a UID supplied by the client as authority/i);
  assert.match(contract, /Revocation and Stop must block subsequent reads\/writes immediately/i);
  assert.match(contract, /Viewer writes are always denied/i);
});


test('viewer telemetry reads require an active matching grant, session, and scope', () => {
  const grant = {
    ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
    scopes: ['battery'], status: 'active', expiresAt: 500000, revokedAt: null
  };
  const session = {
    ownerUid: 'owner-a', deviceId: 'phone-a', sessionId: 'session-identifier-1234',
    scopes: ['battery', 'location'], status: 'active', expiresAt: 400000, stoppedAt: null
  };
  const args = {
    grant, session, viewerUid: 'viewer-b', ownerUid: 'owner-a', deviceId: 'phone-a',
    sessionId: 'session-identifier-1234', scope: 'battery', now: 100000
  };
  assert.equal(canReadTelemetry(args), true);
  assert.equal(canReadTelemetry({ ...args, viewerUid: 'attacker' }), false);
  assert.equal(canReadTelemetry({ ...args, deviceId: 'other-device' }), false);
  assert.equal(canReadTelemetry({ ...args, scope: 'location' }), false);
  assert.equal(canReadTelemetry({ ...args, sessionId: 'old-session' }), false);
  assert.equal(canReadTelemetry({ ...args, now: 500000 }), false);
  assert.equal(canReadTelemetry({ ...args, grant: { ...grant, status: 'revoked' } }), false);
  assert.equal(canReadTelemetry({ ...args, session: { ...session, status: 'stopped' } }), false);
  assert.equal(canReadTelemetry({ ...args, session: { ...session, expiresAt: 100000 } }), false);
  assert.equal(canReadTelemetry({ ...args, session: { ...session, scopes: ['location'] } }), false);
});

test('telemetry publishing requires an active owner session and rejects ungranted fields', async () => {
  const sessionId = 'session-identifier-1234';
  const session = {
    ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    scopes: ['battery'], status: 'active', expiresAt: 500000, revokedAt: null
  };
  const records = new Map([
    ['users/owner-a/devices/phone-a', { revoked: false }],
    ['deviceSessions/' + sessionId, session]
  ]);
  const db = {
    collection(name) {
      return {
        doc(id) {
          const key = name + '/' + id;
          return {
            key,
            collection(child) {
              return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } };
            }
          };
        }
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) { const value = records.get(ref.key); return { exists: value !== undefined, data: () => value }; },
        set(ref, value) { writes.push(() => records.set(ref.key, value)); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };
  const snapshot = { battery: { level: 0.8, charging: true } };
  const result = await publishTelemetryTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    snapshot, now: 100000
  });
  assert.equal(result.updatedAt, 100000);
  assert.equal(records.get('deviceTelemetry/owner-a_phone-a').snapshot.battery.level, 0.8);
  await assert.rejects(publishTelemetryTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    snapshot: { battery: { level: 0.8, charging: true }, location: { latitude: 1, longitude: 2, accuracy: 3 } },
    now: 100001
  }), /SHARING_UNAVAILABLE/);
  await assert.rejects(publishTelemetryTransaction({
    db, ownerUid: 'attacker', deviceId: 'phone-a', sessionId,
    snapshot, now: 100001
  }), /SHARING_UNAVAILABLE/);
});


test('sharing session starts only for an active owner device and stops with telemetry cleanup', async () => {
  const sessionId = 'session-identifier-1234';
  const records = new Map([
    ['users/owner-a/devices/phone-a', { revoked: false }]
  ]);
  const db = {
    collection(name) {
      return { doc(id) {
        const key = name + '/' + id;
        return {
          key,
          collection(child) { return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } }; }
        };
      } };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) { const value = records.get(ref.key); return { exists: value !== undefined, data: () => value }; },
        create(ref, value) { writes.push(() => { if (records.has(ref.key)) throw new Error('already-exists'); records.set(ref.key, value); }); },
        update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); },
        delete(ref) { writes.push(() => records.delete(ref.key)); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };
  const started = await createSharingSessionTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    scopes: ['battery'], now: 100000
  });
  assert.equal(started.expiresAt, 100000 + 15 * 60 * 1000);
  records.set('deviceTelemetry/owner-a_phone-a', { sessionId, snapshot: { battery: { level: 1, charging: true } } });
  await assert.rejects(createSharingSessionTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    scopes: ['battery'], now: 100001
  }), /SHARING_UNAVAILABLE/);
  const stopped = await stopSharingSessionTransaction({
    db, ownerUid: 'owner-a', sessionId, now: 110000
  });
  assert.equal(stopped.status, 'stopped');
  assert.equal(records.get('deviceSessions/' + sessionId).status, 'stopped');
  assert.equal(records.has('deviceTelemetry/owner-a_phone-a'), false);
  await assert.rejects(stopSharingSessionTransaction({
    db, ownerUid: 'owner-a', sessionId, now: 110001
  }), /SHARING_UNAVAILABLE/);
});
