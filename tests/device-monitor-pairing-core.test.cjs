'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ALLOWED_SCOPES,
  bindGrantToSessionTransaction,
  INVITE_TTL_MS,
  PENDING_REQUEST_TTL_MS,
  GRANT_TTL_MS,
  REDEMPTION_WINDOW_MS,
  MAX_VIEWER_REDEMPTION_ATTEMPTS,
  MAX_INVITE_FAILED_ATTEMPTS,
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
  const records = new Map([
    ['pairingInvites/invite-a', invite],
    ['users/owner-a/devices/phone-a', { revoked: false }]
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

test('invite redemption rejects a device revoked after invite creation', async () => {
  const secret = createInviteSecret();
  const invite = {
    secretHash: hashInviteSecret(secret), ownerUid: 'owner-a', deviceId: 'phone-a',
    scopes: ['battery'], expiresAt: 900000, consumedAt: null, revokedAt: null
  };
  const records = new Map([
    ['pairingInvites/invite-a', invite],
    ['users/owner-a/devices/phone-a', { revoked: true }]
  ]);
  const db = {
    collection(name) {
      return { doc(id) {
        const key = name + '/' + id;
        return {
          key,
          collection(child) {
            return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } };
          }
        };
      } };
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
    db, inviteId: 'invite-a', secret, viewerUid: 'viewer-b',
    requestId: 'request-a', now: 100000
  }), /PAIRING_UNAVAILABLE/);
  assert.equal(records.get('pairingInvites/invite-a').consumedAt, null);
  assert.equal(records.has('pairingRequests/request-a'), false);
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
  const records = new Map([
    ['pairingInvites/invite-a', invite],
    ['users/owner-a/devices/phone-a', { revoked: false }]
  ]);
  const db = {
    collection(name) {
      return { doc(id) {
        const key = name + '/' + id;
        return {
          key,
          collection(child) {
            return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } };
          }
        };
      } };
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


test('pairing redemption throttles failed invite attempts and viewer accounts transactionally', async () => {
  const secret = createInviteSecret();
  const records = new Map([
    ['pairingInvites/invite-rate', {
      secretHash: hashInviteSecret(secret), ownerUid: 'owner-a', deviceId: 'phone-a',
      scopes: ['battery'], expiresAt: 900000, consumedAt: null, revokedAt: null
    }],
    ['users/owner-a/devices/phone-a', { revoked: false }]
  ]);
  const db = {
    collection(name) {
      return { doc(id) {
        const key = name + '/' + id;
        return { key, collection(child) {
          return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } };
        } };
      } };
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

  for (let attempt = 1; attempt <= MAX_INVITE_FAILED_ATTEMPTS; attempt++) {
    await assert.rejects(redeemInviteTransaction({
      db, inviteId: 'invite-rate', secret: createInviteSecret(), viewerUid: 'viewer-rate',
      requestId: 'bad-' + attempt, now: 100000
    }), /PAIRING_UNAVAILABLE/);
  }
  assert.equal(records.get('pairingInvites/invite-rate').failedAttempts, MAX_INVITE_FAILED_ATTEMPTS);
  await assert.rejects(redeemInviteTransaction({
    db, inviteId: 'invite-rate', secret, viewerUid: 'viewer-rate',
    requestId: 'blocked-invite', now: 100001
  }), /PAIRING_UNAVAILABLE/);
  const viewerKey = require('node:crypto').createHash('sha256').update('viewer-rate').digest('hex');
  const accountLimit = records.get('pairingRedemptionLimits/' + viewerKey + '_' + Math.floor(100000 / REDEMPTION_WINDOW_MS) * REDEMPTION_WINDOW_MS);
  assert.equal(accountLimit.attempts, MAX_INVITE_FAILED_ATTEMPTS + 1);

  for (let attempt = 2; attempt <= MAX_VIEWER_REDEMPTION_ATTEMPTS; attempt++) {
    await assert.rejects(redeemInviteTransaction({
      db, inviteId: 'missing-' + attempt, secret, viewerUid: 'viewer-account',
      requestId: 'missing-request-' + attempt, now: 200000
    }), /PAIRING_UNAVAILABLE/);
  }
  await assert.rejects(redeemInviteTransaction({
    db, inviteId: 'missing-final', secret, viewerUid: 'viewer-account',
    requestId: 'missing-final-request', now: 200001
  }), /PAIRING_UNAVAILABLE/);
  const accountKey = require('node:crypto').createHash('sha256').update('viewer-account').digest('hex');
  const accountWindow = Math.floor(200000 / REDEMPTION_WINDOW_MS) * REDEMPTION_WINDOW_MS;
  assert.equal(records.get('pairingRedemptionLimits/' + accountKey + '_' + accountWindow).attempts, MAX_VIEWER_REDEMPTION_ATTEMPTS);

  await assert.rejects(redeemInviteTransaction({
    db, inviteId: 'missing-new-window', secret, viewerUid: 'viewer-account',
    requestId: 'new-window-request', now: accountWindow + REDEMPTION_WINDOW_MS
  }), /PAIRING_UNAVAILABLE/);
  assert.equal(records.get('pairingRedemptionLimits/' + accountKey + '_' + (accountWindow + REDEMPTION_WINDOW_MS)).attempts, 1);
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
        update(ref, value) { writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value })); },
        set(ref, value) { writes.push(() => records.set(ref.key, value)); }
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
  assert.equal(records.get('deviceGrants/grant-a').expiresAt, 100000 + GRANT_TTL_MS);
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


test('owner binds an active viewer grant to one matching sharing session', async () => {
  const sessionId = 'session-identifier-1234';
  const records = new Map([
    ['deviceGrants/grant-a', {
      ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
      scopes: ['battery'], status: 'active', expiresAt: 500000, sessionId: null
    }],
    ['deviceSessions/' + sessionId, {
      ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
      scopes: ['battery', 'location'], status: 'active', expiresAt: 400000
    }]
  ]);
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
  await assert.rejects(bindGrantToSessionTransaction({
    db, grantId: 'grant-a', ownerUid: 'attacker', sessionId, now: 100000
  }), /SHARING_UNAVAILABLE/);
  const bound = await bindGrantToSessionTransaction({
    db, grantId: 'grant-a', ownerUid: 'owner-a', sessionId, now: 100000
  });
  assert.equal(bound.status, 'bound');
  assert.equal(records.get('deviceGrants/grant-a').sessionId, sessionId);
  await assert.rejects(bindGrantToSessionTransaction({
    db, grantId: 'grant-a', ownerUid: 'owner-a', sessionId, now: 100001
  }), /SHARING_UNAVAILABLE/);
});

test('viewer telemetry reads require an active matching grant, session, and scope', () => {
  const grant = {
    ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
    scopes: ['battery'], status: 'active', expiresAt: 500000, revokedAt: null,
    sessionId: 'session-identifier-1234'
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


test('pairing invite creation stores only a hash and requires an active owner device', async () => {
  const secret = createInviteSecret();
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
        create(ref, value) { writes.push(() => { if (records.has(ref.key)) throw new Error('already-exists'); records.set(ref.key, value); }); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };
  const { createPairingInviteTransaction } = require('../functions/src/pairing-core.cjs');
  const result = await createPairingInviteTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', inviteId: 'invite-a',
    secret, scopes: ['battery'], now: 100000
  });
  const stored = records.get('pairingInvites/invite-a');
  assert.equal(result.expiresAt, 100000 + INVITE_TTL_MS);
  assert.equal(stored.secretHash, hashInviteSecret(secret));
  assert.equal(Object.values(stored).includes(secret), false);
  assert.deepEqual(stored.scopes, ['battery']);
  await assert.rejects(createPairingInviteTransaction({
    db, ownerUid: 'attacker', deviceId: 'phone-a', inviteId: 'invite-b',
    secret: createInviteSecret(), scopes: ['battery'], now: 100001
  }), /PAIRING_UNAVAILABLE/);
});


test('full pairing lifecycle requires approval and session binding before scoped reads', async () => {
  const records = new Map([
    ['users/owner-a/devices/phone-a', { revoked: false }]
  ]);
  const db = {
    collection(name) {
      return { doc(id) {
        const key = name + '/' + id;
        return {
          key,
          collection(child) {
            return { doc(childId) { return { key: key + '/' + child + '/' + childId }; } };
          }
        };
      } };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) {
          const value = records.get(ref.key);
          return { exists: value !== undefined, data: () => value };
        },
        create(ref, value) {
          writes.push(() => {
            if (records.has(ref.key)) throw new Error('already-exists');
            records.set(ref.key, value);
          });
        },
        update(ref, value) {
          writes.push(() => records.set(ref.key, { ...records.get(ref.key), ...value }));
        },
        set(ref, value) { writes.push(() => records.set(ref.key, value)); },
        delete(ref) { writes.push(() => records.delete(ref.key)); }
      };
      const result = await callback(tx);
      writes.forEach(write => write());
      return result;
    }
  };

  const secret = createInviteSecret();
  await require('../functions/src/pairing-core.cjs').createPairingInviteTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', inviteId: 'invite-flow',
    secret, scopes: ['battery'], now: 100000
  });
  const redeemed = await redeemInviteTransaction({
    db, inviteId: 'invite-flow', secret, viewerUid: 'viewer-b',
    requestId: 'request-flow', now: 100001
  });
  assert.equal(redeemed.status, 'pending');
  assert.equal(records.has('deviceGrants/grant-flow'), false);
  assert.equal(records.get('pairingRequests/request-flow').expiresAt, 100001 + PENDING_REQUEST_TTL_MS);

  const approved = await confirmPairingRequestTransaction({
    db, requestId: 'request-flow', ownerUid: 'owner-a',
    grantId: 'grant-flow', now: 100002
  });
  assert.equal(approved.viewerUid, 'viewer-b');
  const sessionId = 'session-flow-identifier';
  await createSharingSessionTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    scopes: ['battery'], now: 100003
  });
  await bindGrantToSessionTransaction({
    db, grantId: 'grant-flow', ownerUid: 'owner-a', sessionId, now: 100004
  });
  await publishTelemetryTransaction({
    db, ownerUid: 'owner-a', deviceId: 'phone-a', sessionId,
    snapshot: { battery: { level: 0.7, charging: false } }, now: 100005
  });

  const authorization = {
    grant: records.get('deviceGrants/grant-flow'),
    session: records.get('deviceSessions/' + sessionId),
    viewerUid: 'viewer-b', ownerUid: 'owner-a', deviceId: 'phone-a',
    sessionId, scope: 'battery', now: 100006
  };
  assert.equal(canReadTelemetry(authorization), true);
  assert.equal(canReadTelemetry({ ...authorization, scope: 'location' }), false);

  records.set('pairingRequests/request-second-viewer', {
    ownerUid: 'owner-a', viewerUid: 'viewer-c', deviceId: 'phone-a',
    scopes: ['battery'], status: 'pending', expiresAt: 200000
  });
  await confirmPairingRequestTransaction({
    db, requestId: 'request-second-viewer', ownerUid: 'owner-a',
    grantId: 'grant-second-viewer', now: 100006
  });
  await bindGrantToSessionTransaction({
    db, grantId: 'grant-second-viewer', ownerUid: 'owner-a', sessionId, now: 100006
  });
  await assert.rejects(confirmPairingRequestTransaction({
    db, requestId: 'request-duplicate', ownerUid: 'owner-a',
    grantId: 'grant-duplicate', now: 100006
  }), /PAIRING_UNAVAILABLE/);
  records.set('pairingRequests/request-duplicate', {
    ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
    scopes: ['battery'], status: 'pending', expiresAt: 200000
  });
  await assert.rejects(confirmPairingRequestTransaction({
    db, requestId: 'request-duplicate', ownerUid: 'owner-a',
    grantId: 'grant-duplicate', now: 100006
  }), /PAIRING_UNAVAILABLE/);

  await revokeDeviceGrantTransaction({
    db, grantId: 'grant-flow', ownerUid: 'owner-a', now: 100007
  });
  assert.equal(canReadTelemetry({
    ...authorization, grant: records.get('deviceGrants/grant-flow'), now: 100008
  }), false);
  assert.equal(records.get('deviceGrants/grant-second-viewer').status, 'active');

  await stopSharingSessionTransaction({
    db, ownerUid: 'owner-a', sessionId, now: 100009
  });
  assert.equal(records.has('deviceTelemetry/owner-a_phone-a'), false);
  assert.equal(records.get('deviceSessions/' + sessionId).status, 'stopped');
});


test('callable backend keeps privileged operations authenticated and App Check protected', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
  for (const operation of [
    'createPairingInvite', 'redeemPairingInvite', 'confirmPairingRequest',
    'bindGrantToSession', 'revokeDeviceGrant', 'startDeviceSharing',
    'stopDeviceSharing', 'publishDeviceTelemetry', 'readDeviceTelemetry'
  ]) {
    assert.ok(source.includes(`exports.${operation} = callable(`));
  }
  assert.ok(source.includes('enforceAppCheck: true'));
  assert.ok(source.includes('consumeAppCheckToken: true'));
  assert.ok(source.includes('request.auth.uid'));
  assert.ok(source.includes("provider === 'anonymous'"));
  assert.ok(source.includes('db.runTransaction(async transaction'));
  assert.ok(source.includes("db.collection('users').doc(grant.ownerUid)"));
  assert.ok(source.includes("deviceSnapshot.data().revoked !== false"));
  assert.ok(!source.includes('request.data.ownerUid') && !source.includes('request.data.viewerUid'));
});


test('telemetry reads reject expired grants and sessions, wrong viewers, and stopped sessions', () => {
  const now = 500000;
  const grant = {
    ownerUid: 'owner-a', viewerUid: 'viewer-b', deviceId: 'phone-a',
    sessionId: 'session-identifier-1234', scopes: ['battery'],
    status: 'active', revokedAt: null, expiresAt: now + 1000
  };
  const session = {
    ownerUid: 'owner-a', deviceId: 'phone-a',
    sessionId: 'session-identifier-1234', scopes: ['battery'],
    status: 'active', stoppedAt: null, expiresAt: now + 1000
  };
  const base = {
    grant, session, viewerUid: 'viewer-b', ownerUid: 'owner-a',
    deviceId: 'phone-a', sessionId: 'session-identifier-1234',
    scope: 'battery', now
  };

  assert.equal(canReadTelemetry(base), true);
  assert.equal(canReadTelemetry({ ...base, viewerUid: 'viewer-c' }), false);
  assert.equal(canReadTelemetry({ ...base, deviceId: 'phone-other' }), false);
  assert.equal(canReadTelemetry({ ...base, now: grant.expiresAt }), false);
  assert.equal(canReadTelemetry({ ...base, now: session.expiresAt }), false);
  assert.equal(canReadTelemetry({
    ...base, session: { ...session, status: 'stopped', stoppedAt: now }
  }), false);
  assert.equal(canReadTelemetry({
    ...base, grant: { ...grant, status: 'revoked', revokedAt: now }
  }), false);
});
