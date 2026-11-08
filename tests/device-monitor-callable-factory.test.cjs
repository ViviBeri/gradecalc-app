'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCallables } = require('../functions/index.js');

class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function harness() {
  const registrations = [];
  const db = {
    collection() {
      return { doc() { return { id: 'generated-id' }; } };
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

test('callables reject missing and anonymous authentication before invoking handlers', async () => {
  const { callables } = harness();
  for (const auth of [undefined, { uid: 'anon', token: { firebase: { sign_in_provider: 'anonymous' } } }]) {
    await assert.rejects(
      callables.createPairingInvite({ auth, data: { deviceId: 'phone-a', scopes: ['battery'] } }),
      error => error instanceof TestHttpsError && error.code === 'unauthenticated'
    );
  }
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
