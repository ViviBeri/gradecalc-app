'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCallables } = require('../functions/src/callable-factory.cjs');

class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function harness() {
  const registrations = [];
  const db = {
    runTransaction() { throw new Error('test transaction reached'); },
    collection() {
      return { doc() { return { id: 'generated-id', collection() { return { doc() { return { id: 'nested-id' }; } }; } }; } };
    }
  };
  const callables = buildCallables({
    db,
    HttpsErrorClass: TestHttpsError,
    onCallImpl(options, handler) {
      registrations.push({ options, handler });
      return handler;
    }
  });
  return { callables, registrations };
}

test('callable registrations require App Check and consume tokens', () => {
  const { registrations } = harness();
  assert.equal(registrations.length, 9);
  for (const registration of registrations) {
    assert.deepEqual(registration.options, {
      enforceAppCheck: true,
      consumeAppCheckToken: true
    });
  }
});

test('callables reject missing authentication but accept a Firebase anonymous session', async () => {
  const { callables } = harness();
  await assert.rejects(
    callables.createPairingInvite({ data: { deviceId: 'phone-a', scopes: ['battery'] } }),
    error => error instanceof TestHttpsError && error.code === 'unauthenticated'
  );
  await assert.rejects(
    callables.createPairingInvite({
      auth: { uid: 'anonymous-device', token: { firebase: { sign_in_provider: 'anonymous' } } },
      data: { deviceId: 'phone-a', scopes: ['battery'] }
    }),
    error => error instanceof TestHttpsError && error.code === 'internal'
  );
});

test('callables reject malformed arguments after authentication', async () => {
  const { callables } = harness();
  await assert.rejects(
    callables.createPairingInvite({
      auth: { uid: 'owner-a', token: { firebase: { sign_in_provider: 'password' } } },
      data: { deviceId: '', scopes: ['battery'] }
    }),
    error => error instanceof TestHttpsError && error.code === 'invalid-argument'
  );
});

test('client-supplied identity fields do not override authenticated identity', async () => {
  const { callables } = harness();
  await assert.rejects(
    callables.createPairingInvite({
      auth: { uid: 'owner-a', token: { firebase: { sign_in_provider: 'password' } } },
      data: { uid: 'attacker', ownerUid: 'attacker', deviceId: 'phone-a', scopes: ['battery'] }
    }),
    error => error instanceof TestHttpsError && error.code === 'internal'
  );
});
