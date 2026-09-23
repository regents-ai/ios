import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import { createMobileAgentsStore, PAIRING_CODE_LIFETIME_MS } from './mobileAgents.js';
import { createMobileAgentRoutes } from './routes/mobileAgents.js';
import type { SignedAgentRequestVerifier } from './services/siwaHttpVerifier.js';

type RouteInput = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  userId?: string;
  body?: unknown;
  rawBody?: string;
};

function createHarness(input?: { verifier?: SignedAgentRequestVerifier; now?: () => number }) {
  const store = createMobileAgentsStore('test:mobile-agents');
  const router = createMobileAgentRoutes({
    store,
    now: input?.now ?? Date.now,
    readUsdcBalances: async (addresses) => ({
      kind: 'ok',
      balances: Object.fromEntries(addresses.map((address) => [address.toLowerCase(), '0'])),
    }),
    verifySignedRequest: input?.verifier ?? (async () => ({ kind: 'rejected', status: 401 })),
  }) as unknown as {
    handle(request: Request, response: Response, next: (error?: unknown) => void): void;
  };

  return (call: RouteInput) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      let statusCode = 200;
      const params: Record<string, string> = {};
      const request = {
        method: call.method,
        url: call.url,
        originalUrl: call.url,
        path: call.url,
        headers: { 'content-type': 'application/json' },
        body: call.rawBody !== undefined ? Buffer.from(call.rawBody) : call.body,
        query: {},
        params,
        userId: call.userId,
        header() {
          return undefined;
        },
        get() {
          return undefined;
        },
      } as unknown as Request;
      const response = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          resolve({ status: statusCode, body: payload });
          return this;
        },
        setHeader() {
          return this;
        },
        req: request,
      } as unknown as Response;

      router.handle(request, response, (error?: unknown) => reject(error ?? new Error(`unhandled ${call.method} ${call.url}`)));
    });
}

// Invariant: a pairing code links exactly the wallet the SIWA server verified
// to the user who created the code, works once, and dies after ten minutes.
test('a pairing code pairs the verified wallet to its owner once and expires', async () => {
  let currentTime = 1_700_000_000_000;
  const verifiedWallet = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';
  const request = createHarness({
    now: () => currentTime,
    verifier: async () => ({ kind: 'verified', walletAddress: verifiedWallet }),
  });

  const issued = await request({
    method: 'POST',
    url: '/mobile/agents/pairing-codes',
    userId: 'owner',
    body: { name: 'Muse', kind: 'muse' },
  });
  assert.equal(issued.status, 201);
  const code: string = issued.body.code;

  const paired = await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }) });
  assert.equal(paired.status, 200);
  assert.equal(paired.body.agent.walletAddress, verifiedWallet);

  const ownerList = await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' });
  assert.deepEqual(
    ownerList.body.agents.map((agent: any) => [agent.name, agent.kind, agent.walletAddress, agent.paired, agent.usdcBalance]),
    [['Muse', 'muse', verifiedWallet, true, '0']],
  );
  const strangerList = await request({ method: 'GET', url: '/mobile/agents', userId: 'stranger' });
  assert.deepEqual(strangerList.body.agents, []);

  const reused = await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }) });
  assert.equal(reused.status, 409);

  const late = await request({
    method: 'POST',
    url: '/mobile/agents/pairing-codes',
    userId: 'owner',
    body: { name: 'Hermes', kind: 'hermes' },
  });
  currentTime += PAIRING_CODE_LIFETIME_MS;
  const expired = await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code: late.body.code }) });
  assert.equal(expired.status, 409);
  assert.equal(expired.body.error.code, 'PairingCodeExpired');
});

// Invariant: the list is per signed-in user; another user cannot see, rename
// or remove an agent that is not theirs.
test('agents belong to the user who added them', async () => {
  const request = createHarness();
  const added = await request({
    method: 'POST',
    url: '/mobile/agents',
    userId: 'owner',
    body: { name: 'Grok Bot', kind: 'grok_bot', walletAddress: '0x1111111111111111111111111111111111111111' },
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.agent.paired, false);
  const agentId: string = added.body.agent.id;

  const strangerRename = await request({
    method: 'PATCH',
    url: `/mobile/agents/${agentId}`,
    userId: 'stranger',
    body: { name: 'Mine now' },
  });
  assert.equal(strangerRename.status, 404);
  const strangerRemove = await request({ method: 'DELETE', url: `/mobile/agents/${agentId}`, userId: 'stranger' });
  assert.equal(strangerRemove.status, 404);

  const ownerList = await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' });
  assert.equal(ownerList.body.agents[0].name, 'Grok Bot');
  const ownerRemove = await request({ method: 'DELETE', url: `/mobile/agents/${agentId}`, userId: 'owner' });
  assert.equal(ownerRemove.status, 200);
  const afterRemove = await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' });
  assert.deepEqual(afterRemove.body.agents, []);
});
