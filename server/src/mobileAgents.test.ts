import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import {
  localMobileAgentsKv,
  MAX_AGENTS_PER_USER,
  PAIRING_CODE_LIFETIME_MS,
  type LocalEntries,
  type LocalEntriesStore,
} from './mobileAgents.js';
import { createMobileAgentRoutes } from './routes/mobileAgents.js';
import type { SignedAgentRequestVerifier } from './services/siwaHttpVerifier.js';

type RouteInput = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  userId?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
};

const PROOF_HEADERS = {
  signature: 'sig1=:abc:',
  'signature-input': 'sig1=("@method" "@path")',
  'content-digest': 'sha-256=:abc:',
  'x-siwa-receipt': 'receipt',
  'x-key-id': '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e',
  'x-timestamp': '1700000000',
  'x-agent-wallet-address': '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e',
  'x-agent-chain-id': '8453',
};

function memoryEntriesStore(): LocalEntriesStore & { state: LocalEntries } {
  const clone = (value: LocalEntries): LocalEntries => JSON.parse(JSON.stringify(value));
  const store = {
    state: { entries: {} } as LocalEntries,
    read: () => clone(store.state),
    update(mutator: (state: LocalEntries) => void) {
      const next = clone(store.state);
      mutator(next);
      store.state = next;
      return clone(next);
    },
  };
  return store;
}

function createHarness(input?: { verifier?: SignedAgentRequestVerifier; now?: () => number }) {
  const entries = memoryEntriesStore();
  const now = input?.now ?? Date.now;
  const router = createMobileAgentRoutes({
    kv: localMobileAgentsKv(entries, now),
    now,
    readUsdcBalances: async (addresses) => ({
      kind: 'ok',
      balances: Object.fromEntries(addresses.map((address) => [address.toLowerCase(), '0'])),
    }),
    verifySignedRequest: input?.verifier ?? (async () => ({ kind: 'rejected', status: 401 })),
  }) as unknown as {
    handle(request: Request, response: Response, next: (error?: unknown) => void): void;
  };

  const request = (call: RouteInput) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      let statusCode = 200;
      const headers = { 'content-type': 'application/json', ...(call.headers ?? {}) };
      const req = {
        method: call.method,
        url: call.url,
        originalUrl: call.url,
        path: call.url,
        headers,
        headersDistinct: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, [value]])),
        body: call.rawBody !== undefined ? Buffer.from(call.rawBody) : call.body,
        query: {},
        params: {},
        userId: call.userId,
        header() {
          return undefined;
        },
        get() {
          return undefined;
        },
      } as unknown as Request;
      const res = {
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
        req,
      } as unknown as Response;

      router.handle(req, res, (error?: unknown) => reject(error ?? new Error(`unhandled ${call.method} ${call.url}`)));
    });

  return { request, entries };
}

// Invariant: a pairing code links exactly the wallet the SIWA server verified
// to the user who created it, only once the user confirms it, works once,
// and dies after ten minutes.
test('a pairing code is redeemed once, confirmed by its owner, and expires', async () => {
  let currentTime = 1_700_000_000_000;
  const verifiedWallet = PROOF_HEADERS['x-agent-wallet-address'];
  const { request } = createHarness({
    now: () => currentTime,
    verifier: async () => ({ kind: 'verified', walletAddress: verifiedWallet }),
  });
  const redeem = (code: string) =>
    request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }), headers: PROOF_HEADERS });

  const issued = await request({ method: 'POST', url: '/mobile/agents/pairing-codes', userId: 'owner', body: { name: 'Muse', kind: 'muse' } });
  assert.equal(issued.status, 201);
  const code: string = issued.body.code;
  assert.equal((await request({ method: 'GET', url: `/mobile/agents/pairing-codes/${code}`, userId: 'owner' })).body.status, 'waiting');

  // A request missing a proof header, or carrying a stray agent header, never reaches the verifier.
  const { signature: _omitted, ...withoutSignature } = PROOF_HEADERS;
  assert.equal((await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }), headers: withoutSignature })).status, 400);
  assert.equal(
    (await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }), headers: { ...PROOF_HEADERS, 'x-agent-role': 'admin' } })).status,
    400,
  );
  assert.equal(
    (await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }), headers: { ...PROOF_HEADERS, 'content-type': 'text/plain' } })).status,
    415,
  );

  const redeemed = await redeem(code);
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.status, 'awaiting_confirmation');
  assert.deepEqual(await request({ method: 'GET', url: `/mobile/agents/pairing-codes/${code}`, userId: 'owner' }).then((r) => r.body), {
    status: 'needs_confirmation',
    walletAddress: verifiedWallet,
    expiresAt: new Date(currentTime + PAIRING_CODE_LIFETIME_MS).toISOString(),
  });
  // Nothing is listed until the owner confirms; a stranger sees the code as expired.
  assert.deepEqual((await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' })).body.agents, []);
  assert.equal((await request({ method: 'GET', url: `/mobile/agents/pairing-codes/${code}`, userId: 'stranger' })).body.status, 'expired');
  assert.equal((await request({ method: 'POST', url: `/mobile/agents/pairing-codes/${code}/confirm`, userId: 'stranger' })).status, 409);

  const reused = await redeem(code);
  assert.equal(reused.status, 409);
  assert.equal(reused.body.error.code, 'PairingCodeUsed');

  const confirmed = await request({ method: 'POST', url: `/mobile/agents/pairing-codes/${code}/confirm`, userId: 'owner' });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.agent.paired, true);
  const ownerList = await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' });
  assert.deepEqual(
    ownerList.body.agents.map((agent: any) => [agent.name, agent.kind, agent.walletAddress, agent.paired, agent.usdcBalance]),
    [['Muse', 'muse', verifiedWallet, true, '0']],
  );
  assert.equal(ownerList.body.balancesAvailable, true);
  assert.deepEqual((await request({ method: 'GET', url: '/mobile/agents', userId: 'stranger' })).body.agents, []);
  assert.equal((await request({ method: 'GET', url: `/mobile/agents/pairing-codes/${code}`, userId: 'owner' })).body.status, 'expired');
  assert.equal((await redeem(code)).body.error.code, 'PairingCodeExpired');

  // "Not mine" drops the recorded address; the list stays as it was.
  const second = await request({ method: 'POST', url: '/mobile/agents/pairing-codes', userId: 'owner', body: { name: 'Hermes', kind: 'hermes' } });
  await redeem(second.body.code);
  assert.deepEqual((await request({ method: 'DELETE', url: `/mobile/agents/pairing-codes/${second.body.code}`, userId: 'owner' })).body, { discarded: true });
  assert.equal((await request({ method: 'GET', url: `/mobile/agents/pairing-codes/${second.body.code}`, userId: 'owner' })).body.status, 'expired');
  assert.equal((await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' })).body.agents.length, 1);

  // Confirming before any agent redeemed, and after expiry, both fail plainly.
  const third = await request({ method: 'POST', url: '/mobile/agents/pairing-codes', userId: 'owner', body: { name: 'Grok Bot', kind: 'grok_bot' } });
  assert.equal((await request({ method: 'POST', url: `/mobile/agents/pairing-codes/${third.body.code}/confirm`, userId: 'owner' })).body.error.code, 'PairingNotReady');
  currentTime += PAIRING_CODE_LIFETIME_MS;
  assert.equal((await redeem(third.body.code)).body.error.code, 'PairingCodeExpired');
  assert.equal((await request({ method: 'GET', url: `/mobile/agents/pairing-codes/${third.body.code}`, userId: 'owner' })).body.status, 'expired');
  assert.equal((await request({ method: 'POST', url: `/mobile/agents/pairing-codes/${third.body.code}/confirm`, userId: 'owner' })).body.error.code, 'PairingCodeExpired');
});

// Invariant: the list is per signed-in user under its own key; another user
// cannot see, rename or remove an agent that is not theirs; a user holds at
// most fifty; and a damaged stored value fails the request without being
// replaced.
test('agents belong to the user who added them', async () => {
  const { request, entries } = createHarness();
  const added = await request({
    method: 'POST',
    url: '/mobile/agents',
    userId: 'owner',
    body: { name: 'Grok Bot', kind: 'grok_bot', walletAddress: '0x1111111111111111111111111111111111111111' },
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.agent.paired, false);
  const agentId: string = added.body.agent.id;
  assert.deepEqual(Object.keys(entries.state.entries), ['regents:mobile-agents:v1:user:owner']);

  const strangerRename = await request({ method: 'PATCH', url: `/mobile/agents/${agentId}`, userId: 'stranger', body: { name: 'Mine now' } });
  assert.equal(strangerRename.status, 404);
  const strangerRemove = await request({ method: 'DELETE', url: `/mobile/agents/${agentId}`, userId: 'stranger' });
  assert.equal(strangerRemove.status, 404);

  for (let index = 2; index <= MAX_AGENTS_PER_USER; index += 1) {
    const walletAddress = `0x${index.toString(16).padStart(40, '0')}`;
    assert.equal((await request({ method: 'POST', url: '/mobile/agents', userId: 'owner', body: { name: `Agent ${index}`, kind: 'other', walletAddress } })).status, 201);
  }
  const overLimit = await request({
    method: 'POST',
    url: '/mobile/agents',
    userId: 'owner',
    body: { name: 'One too many', kind: 'other', walletAddress: '0x00000000000000000000000000000000000000ff' },
  });
  assert.equal(overLimit.status, 409);
  assert.equal(overLimit.body.error.code, 'AgentLimitReached');

  const ownerList = await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' });
  assert.equal(ownerList.body.agents[0].name, 'Grok Bot');
  assert.equal(ownerList.body.agents.length, MAX_AGENTS_PER_USER);
  const ownerRemove = await request({ method: 'DELETE', url: `/mobile/agents/${agentId}`, userId: 'owner' });
  assert.equal(ownerRemove.status, 200);
  assert.equal((await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' })).body.agents.length, MAX_AGENTS_PER_USER - 1);

  const damagedKey = 'regents:mobile-agents:v1:user:damaged';
  entries.state.entries[damagedKey] = { value: '{"not":"a list"}', expiresAt: null };
  const damaged = await request({ method: 'GET', url: '/mobile/agents', userId: 'damaged' });
  assert.equal(damaged.status, 500);
  assert.equal(damaged.body.error.code, 'AgentsUnavailable');
  assert.equal((await request({ method: 'POST', url: '/mobile/agents', userId: 'damaged', body: { name: 'X', kind: 'other', walletAddress: '0x2222222222222222222222222222222222222222' } })).status, 500);
  assert.equal(entries.state.entries[damagedKey]?.value, '{"not":"a list"}');
});
