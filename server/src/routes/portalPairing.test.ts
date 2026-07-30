import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import test from 'node:test';
import express from 'express';

import type { PortalOAuthClient } from '../services/portalOAuthClient.js';
import type { SharedStateRedis } from '../sharedStateStore.js';
import {
  createPortalPairingRoutes,
  createPortalPairingStateStore,
} from './portalPairing.js';

function portalStub(input?: {
  exchangeKind?: 'ok' | 'upstream_error';
  state?: string;
}) {
  const exchangeCalls: Array<{ code: string; verifier: string }> = [];
  const state = input?.state || 'pairing-state';
  const client: PortalOAuthClient = {
    createAuthorizationRequest() {
      return {
        authorizeUrl: `https://portal.nousresearch.com/oauth/authorize?state=${state}`,
        state,
        verifier: 'stored-verifier',
      };
    },
    async exchangeCode(exchange) {
      exchangeCalls.push(exchange);
      return input?.exchangeKind === 'upstream_error'
        ? { kind: 'upstream_error' }
        : {
            kind: 'ok',
            refreshToken: 'server-only-refresh',
            accountLabel: 'Portal account',
          };
    },
  };
  return { client, exchangeCalls };
}

function createFakeSharedStateRedis() {
  const values = new Map<string, string>();
  let beforeNextEval: ((key: string) => void) | null = null;
  const redis: SharedStateRedis = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      return 'OK';
    },
    async eval(_script, options) {
      const key = options.keys[0] ?? '';
      const [expected, next, missingSentinel] = options.arguments;
      if (beforeNextEval) {
        const mutate = beforeNextEval;
        beforeNextEval = null;
        mutate(key);
      }
      const current = values.get(key);
      if (
        (current === undefined && expected === missingSentinel) ||
        current === expected
      ) {
        values.set(key, next ?? '');
        return 1;
      }
      return 0;
    },
  };
  return {
    redis,
    values,
    beforeEvalOnce(mutate: (key: string) => void) {
      beforeNextEval = mutate;
    },
  };
}

async function withServer(
  input: {
    client: PortalOAuthClient;
    now?: () => number;
    redis?: SharedStateRedis;
    store?: ReturnType<typeof createPortalPairingStateStore>;
  },
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header('x-test-user');
    if (userId) {
      req.userId = userId;
    }
    next();
  });
  app.use(createPortalPairingRoutes({
    oauthClient: input.client,
    ...(input.redis ? { redis: input.redis } : {}),
    ...(input.now ? { now: input.now } : {}),
    store: input.store || createPortalPairingStateStore(`portal-pairing-test:${Math.random()}`),
  }));

  const server = await new Promise<Server>((resolveListen) => {
    const listening = app.listen(0, () => resolveListen(listening));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

function userHeaders(userId: string) {
  return {
    'content-type': 'application/json',
    'x-test-user': userId,
  };
}

async function startPairing(baseUrl: string, userId: string) {
  const response = await fetch(`${baseUrl}/mobile/portal-pairing/start`, {
    method: 'POST',
    headers: userHeaders(userId),
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ authorizeUrl: string }>;
}

async function completePairing(
  baseUrl: string,
  userId: string,
  state = 'pairing-state',
) {
  return fetch(`${baseUrl}/mobile/portal-pairing/complete`, {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify({ code: 'returned-code', state }),
  });
}

test('start and complete pair the verified user without returning Portal credentials', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client, now: () => 1_700_000_000_000 }, async (baseUrl) => {
    const started = await startPairing(baseUrl, 'user-a');
    assert.equal(
      started.authorizeUrl,
      'https://portal.nousresearch.com/oauth/authorize?state=pairing-state',
    );

    const completed = await completePairing(baseUrl, 'user-a');
    assert.equal(completed.status, 200);
    const body = await completed.json();
    assert.deepEqual(body, {
      paired: true,
      accountLabel: 'Portal account',
      pairedAt: '2023-11-14T22:13:20.000Z',
    });
    assert.doesNotMatch(JSON.stringify(body), /access|refresh|token/i);
    assert.deepEqual(stub.exchangeCalls, [{
      code: 'returned-code',
      verifier: 'stored-verifier',
    }]);

    const status = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      headers: userHeaders('user-a'),
    });
    assert.deepEqual(await status.json(), body);
  });
});

test('a pairing return is single-use', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');
    assert.equal((await completePairing(baseUrl, 'user-a')).status, 200);

    const replay = await completePairing(baseUrl, 'user-a');
    assert.equal(replay.status, 409);
    assert.match((await replay.json()).error.message, /already used/i);
    assert.equal(stub.exchangeCalls.length, 1);
  });
});

test('an expired pairing return is rejected before exchange', async () => {
  const stub = portalStub();
  let now = 1_000;
  await withServer({ client: stub.client, now: () => now }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');
    now += 5 * 60 * 1000 + 1;

    const expired = await completePairing(baseUrl, 'user-a');
    assert.equal(expired.status, 409);
    assert.match((await expired.json()).error.message, /expired/i);
    assert.equal(stub.exchangeCalls.length, 0);
  });
});

test('a foreign user cannot consume the rightful user pairing return', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');

    const wrongOwner = await completePairing(baseUrl, 'user-b');
    assert.equal(wrongOwner.status, 409);
    assert.match((await wrongOwner.json()).error.message, /different signed-in account/i);

    const rightfulOwner = await completePairing(baseUrl, 'user-a');
    assert.equal(rightfulOwner.status, 200);
    assert.equal(stub.exchangeCalls.length, 1);
  });
});

test('an exchange failure records no paired status', async () => {
  const stub = portalStub({ exchangeKind: 'upstream_error' });
  await withServer({ client: stub.client }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');

    const failed = await completePairing(baseUrl, 'user-a');
    assert.equal(failed.status, 502);
    await failed.json();
    const status = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      headers: userHeaders('user-a'),
    });
    assert.deepEqual(await status.json(), {
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });
  });
});

test('disconnect is idempotent and clears durable status', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');
    assert.equal((await completePairing(baseUrl, 'user-a')).status, 200);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${baseUrl}/mobile/portal-pairing`, {
        method: 'DELETE',
        headers: userHeaders('user-a'),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        paired: false,
        accountLabel: null,
        pairedAt: null,
      });
    }
  });
});

test('disconnect removes attempts that started before it', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');

    const disconnected = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      method: 'DELETE',
      headers: userHeaders('user-a'),
    });
    assert.equal(disconnected.status, 200);

    const completed = await completePairing(baseUrl, 'user-a');
    assert.equal(completed.status, 409);
    assert.equal(stub.exchangeCalls.length, 0);

    const status = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      headers: userHeaders('user-a'),
    });
    assert.equal((await status.json()).paired, false);
  });
});

test('disconnect prevents a delayed completion from restoring pairing', async () => {
  let exchangeStarted!: () => void;
  let finishExchange!: (
    result: Awaited<ReturnType<PortalOAuthClient['exchangeCode']>>,
  ) => void;
  const started = new Promise<void>((resolve) => {
    exchangeStarted = resolve;
  });
  const exchange = new Promise<
    Awaited<ReturnType<PortalOAuthClient['exchangeCode']>>
  >((resolve) => {
    finishExchange = resolve;
  });
  const stub = portalStub();
  let now = 1_000;
  stub.client.exchangeCode = async () => {
    exchangeStarted();
    return exchange;
  };

  await withServer({ client: stub.client, now: () => now }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');
    const completing = completePairing(baseUrl, 'user-a');
    await started;

    const disconnected = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      method: 'DELETE',
      headers: userHeaders('user-a'),
    });
    assert.equal(disconnected.status, 200);

    now += 10 * 60 * 1000;
    await startPairing(baseUrl, 'user-b');

    finishExchange({
      kind: 'ok',
      refreshToken: 'server-only-refresh',
      accountLabel: 'Portal account',
    });
    const completed = await completing;
    assert.equal(completed.status, 502);
    assert.equal((await completed.json()).error.code, 'PortalPairingFailed');

    const status = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      headers: userHeaders('user-a'),
    });
    assert.deepEqual(await status.json(), {
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });
  });
});

test('a consume CAS retry cannot recover an attempt removed by disconnect', async () => {
  const stub = portalStub();
  const fakeRedis = createFakeSharedStateRedis();
  const key = `portal-pairing-test:${Math.random()}`;
  const store = createPortalPairingStateStore(key);

  await withServer({
    client: stub.client,
    redis: fakeRedis.redis,
    store,
  }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-a');
    fakeRedis.beforeEvalOnce((redisKey) => {
      const state = JSON.parse(fakeRedis.values.get(redisKey) ?? '{}') as {
        pendingByState: Record<string, { userId: string }>;
        pairingGenerationByUser: Record<
          string,
          { value: string; updatedAt: number }
        >;
      };
      for (const [stateKey, pending] of Object.entries(state.pendingByState)) {
        if (pending.userId === 'user-a') {
          delete state.pendingByState[stateKey];
        }
      }
      state.pairingGenerationByUser['user-a'] = {
        value: 'disconnect-generation',
        updatedAt: Date.now(),
      };
      fakeRedis.values.set(redisKey, JSON.stringify(state));
    });

    const completed = await completePairing(baseUrl, 'user-a');
    assert.equal(completed.status, 409);
    assert.equal(stub.exchangeCalls.length, 0);

    const status = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      headers: userHeaders('user-a'),
    });
    assert.equal((await status.json()).paired, false);
  });
});

test('invalid stored records are pruned without removing valid pairings', async () => {
  const stub = portalStub();
  const store = createPortalPairingStateStore(
    `portal-pairing-test:${Math.random()}`,
  );
  await store.reset(null, {
    pendingByState: {
      invalid: {
        userId: '',
        verifier: 'verifier',
        expiresAt: 1,
        generation: 'invalid-generation',
      },
    },
    pairedByUser: {
      'user-valid': {
        refreshToken: 'valid-refresh',
        accountLabel: 'Valid account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      },
      'user-invalid': {
        refreshToken: '',
        accountLabel: null,
        pairedAt: 'not-a-date',
      },
    },
    pairingGenerationByUser: {
      'user-valid': {
        value: 'valid-generation',
        updatedAt: 1_700_000_000_000,
      },
      'user-invalid': {
        value: '',
        updatedAt: -1,
      },
    },
  } as never);

  await withServer({
    client: stub.client,
    now: () => 1_700_000_000_001,
    store,
  }, async (baseUrl) => {
    const status = await fetch(`${baseUrl}/mobile/portal-pairing`, {
      headers: userHeaders('user-valid'),
    });
    assert.deepEqual(await status.json(), {
      paired: true,
      accountLabel: 'Valid account',
      pairedAt: '2026-07-30T12:00:00.000Z',
    });

    await startPairing(baseUrl, 'user-other');
  });

  const normalized = await store.read(null);
  assert.equal(normalized.pairedByUser['user-valid']?.refreshToken, 'valid-refresh');
  assert.equal(normalized.pairedByUser['user-invalid'], undefined);
  assert.equal(normalized.pendingByState.invalid, undefined);
  assert.equal(
    normalized.pairingGenerationByUser['user-valid']?.value,
    'valid-generation',
  );
  assert.equal(normalized.pairingGenerationByUser['user-invalid'], undefined);
});

test('pairing generation pruning removes aged entries and keeps recent ones', async () => {
  const stub = portalStub();
  const store = createPortalPairingStateStore(
    `portal-pairing-test:${Math.random()}`,
  );
  const now = 30 * 60 * 1000;
  await store.reset(null, {
    pendingByState: {},
    pairedByUser: {},
    pairingGenerationByUser: {
      aged: {
        value: 'aged-generation',
        updatedAt: 1,
      },
      recent: {
        value: 'recent-generation',
        updatedAt: now - 10 * 60 * 1000,
      },
    },
  });

  await withServer({
    client: stub.client,
    now: () => now,
    store,
  }, async (baseUrl) => {
    await startPairing(baseUrl, 'user-other');
  });

  const normalized = await store.read(null);
  assert.equal(normalized.pairingGenerationByUser.aged, undefined);
  assert.equal(
    normalized.pairingGenerationByUser.recent?.value,
    'recent-generation',
  );
});

test('the public callback bounces only code and state to the fixed app route', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/oauth/callback?code=return-code&state=return-state&redirect=https://evil.example&token=secret`,
      { redirect: 'manual' },
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      'regentsmobile://portal-return?code=return-code&state=return-state',
    );
  });
});

test('pairing operations require a verified user', async () => {
  const stub = portalStub();
  await withServer({ client: stub.client }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mobile/portal-pairing`);
    assert.equal(response.status, 401);
  });
});
