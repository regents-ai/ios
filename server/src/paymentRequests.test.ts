import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  type Address,
  type Hash,
  type Log,
} from 'viem';

import type { TransferReceiptReadResult } from './baseUsdcTransfers.js';
import { localMobileAgentsKv } from './mobileAgents.js';
import { MAX_REQUESTS_PER_USER, markPaymentRequestPaid } from './paymentRequests.js';
import { BASE_USDC_ADDRESS } from './regentStaking.js';
import { AGENT_WALLET, memoryEntriesStore, PROOF_HEADERS, routeRequester } from './routeHarness.testing.js';
import { createMobileAgentRoutes } from './routes/mobileAgents.js';
import { createPaymentRequestRoutes, type PaymentRequestNotification } from './routes/paymentRequests.js';
import type { SignedAgentRequest } from './services/siwaHttpVerifier.js';

const PHONE_WALLET: Address = '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB';
const PARTNER_WALLET: Address = '0x3333333333333333333333333333333333333333';
const ELSEWHERE: Address = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'a1'.repeat(32)}` as Hash;
const OTHER_TX_HASH = `0x${'b2'.repeat(32)}` as Hash;
const { 'content-digest': _digest, ...BODYLESS_PROOF_HEADERS } = PROOF_HEADERS;

function transferLog(from: Address, to: Address, value: bigint): Log {
  return {
    address: BASE_USDC_ADDRESS,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }) as Log['topics'],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
    blockHash: `0x${'cd'.repeat(32)}`,
    blockNumber: 36_000_000n,
    logIndex: 4,
    transactionHash: TX_HASH,
    transactionIndex: 1,
    removed: false,
  };
}

function createHarness() {
  const entries = memoryEntriesStore();
  const kv = localMobileAgentsKv(entries);
  const pushes: { userId: string; notification: PaymentRequestNotification }[] = [];
  const receipts = new Map<string, TransferReceiptReadResult>();
  let verifiedWallet = AGENT_WALLET;
  let failPushes = false;
  let coinbaseDown = false;
  const signedRequests: SignedAgentRequest[] = [];
  const verifySignedRequest = async (signed: SignedAgentRequest) => {
    signedRequests.push(signed);
    return { kind: 'verified' as const, walletAddress: verifiedWallet };
  };

  const request = routeRequester(
    createMobileAgentRoutes({
      kv,
      readUsdcBalances: async () => ({ kind: 'ok', balances: {} }),
      verifySignedRequest,
    }),
    createPaymentRequestRoutes({
      kv,
      verifySignedRequest,
      readReceipt: async (txHash) => receipts.get(txHash) ?? { kind: 'not_found' },
      // A test wallet token is "<user id>|<smart account>"; an empty account means none.
      async validateWalletToken(token) {
        if (coinbaseDown) {
          throw new Error('coinbase down');
        }
        if (token === 'expired') {
          throw Object.assign(new Error('Invalid JWT'), { statusCode: 401, errorMessage: 'Token is expired.' });
        }
        if (token === 'unknown') {
          throw Object.assign(new Error('Not found'), { statusCode: 404, errorMessage: 'End user not found.' });
        }
        const [sub, wallet] = token.split('|');
        return { authenticationMethods: [{ type: 'jwt', kid: 'regents-mobile', sub: sub! }], evmSmartAccounts: wallet ? [wallet] : [] };
      },
      async notifyUser(userId, notification) {
        if (failPushes) {
          throw new Error('push service down');
        }
        pushes.push({ userId, notification });
      },
    }),
  );

  const pair = async (userId: string, name: string) => {
    const issued = await request({ method: 'POST', url: '/mobile/agents/pairing-codes', userId, body: { name, kind: 'muse' } });
    const code: string = issued.body.code;
    await request({ method: 'POST', url: '/agent/pair', rawBody: JSON.stringify({ code }), headers: PROOF_HEADERS });
    return (await request({ method: 'POST', url: `/mobile/agents/pairing-codes/${code}/confirm`, userId })).body.agent;
  };
  const ask = (body: unknown) =>
    request({ method: 'POST', url: '/agent/payment-requests', rawBody: JSON.stringify(body), headers: PROOF_HEADERS });
  const agentRead = (id: string) =>
    request({ method: 'GET', url: `/agent/payment-requests/${id}`, headers: BODYLESS_PROOF_HEADERS });
  // Checks a payment as `userId`, whose wallet token names `tokenUser`'s wallet `wallet`.
  const checkPaid = (userId: string, id: string, txHash: string, wallet: string = PHONE_WALLET, tokenUser = userId) =>
    request({
      method: 'POST',
      url: `/mobile/payment-requests/${id}/paid`,
      userId,
      body: { txHash, walletAccessToken: `${tokenUser}|${wallet}` },
    });

  return {
    request,
    entries,
    kv,
    pushes,
    receipts,
    signedRequests,
    pair,
    ask,
    agentRead,
    checkPaid,
    signAs(wallet: string) {
      verifiedWallet = wallet;
    },
    failPushes(fail: boolean) {
      failPushes = fail;
    },
    coinbaseDown(down: boolean) {
      coinbaseDown = down;
    },
  };
}

// Invariant: only a paired agent can ask, and it asks everyone who paired it.
test('a paired agent asks each person who paired it; an unpaired agent is told to pair first', async () => {
  const harness = createHarness();
  const { request, pushes, pair, ask } = harness;

  const unpaired = await ask({ to: AGENT_WALLET, amount: '5', note: 'API credits' });
  assert.equal(unpaired.status, 403);
  assert.equal(unpaired.body.error.code, 'AgentNotPaired');
  assert.match(unpaired.body.error.message, /Pair with your person first/);

  // Listing the wallet by address alone does not let it ask.
  await request({ method: 'POST', url: '/mobile/agents', userId: 'owner', body: { name: 'Muse', kind: 'muse', walletAddress: AGENT_WALLET } });
  assert.equal((await ask({ to: AGENT_WALLET, amount: '5', note: 'API credits' })).status, 403);

  await pair('owner', 'Muse');
  await pair('friend', 'Shared Muse');
  const asked = await ask({ to: AGENT_WALLET, amount: '5', note: '  API credits for this week  ' });
  assert.equal(asked.status, 201);
  assert.equal(asked.body.requestIds.length, 2);

  assert.deepEqual(
    pushes.map(({ userId, notification }) => [userId, notification.title, notification.body, notification.category, notification.data.type]),
    [
      ['owner', 'Muse asks for 5.00 USDC', 'API credits for this week', 'payment_request', 'payment_request'],
      ['friend', 'Shared Muse asks for 5.00 USDC', 'API credits for this week', 'payment_request', 'payment_request'],
    ],
  );
  assert.deepEqual(pushes.map(({ notification }) => notification.data.requestId), asked.body.requestIds);

  const ownerList = await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'owner' });
  assert.equal(ownerList.status, 200);
  assert.equal(ownerList.body.requests.length, 1);
  const shown = ownerList.body.requests[0];
  assert.deepEqual(
    [shown.agentName, shown.agentWallet, shown.to, shown.amount, shown.amountRaw, shown.note, shown.status, shown.txHash, shown.userId],
    ['Muse', AGENT_WALLET, AGENT_WALLET, '5.00', '5000000', 'API credits for this week', 'waiting', null, undefined],
  );
  assert.deepEqual((await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'stranger' })).body.requests, []);

  // After the owner removes the agent, it asks the friend alone.
  const ownerAgentId = (await request({ method: 'GET', url: '/mobile/agents', userId: 'owner' })).body.agents[0].id;
  await request({ method: 'DELETE', url: `/mobile/agents/${ownerAgentId}`, userId: 'owner' });
  assert.equal((await ask({ to: ELSEWHERE, amount: '0.25', note: 'Coffee' })).body.requestIds.length, 1);
  assert.equal((await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'friend' })).body.requests[0].amount, '0.25');
});

test('an ask must be a signed JSON body with an address, an amount and a short note', async () => {
  const { pair, ask, request } = createHarness();
  await pair('owner', 'Muse');

  for (const body of [
    { to: AGENT_WALLET, amount: '0', note: 'x' },
    { to: AGENT_WALLET, amount: '1.1234567', note: 'x' },
    { to: AGENT_WALLET, amount: '-1', note: 'x' },
    { to: AGENT_WALLET, amount: '1e6', note: 'x' },
    { to: AGENT_WALLET, amount: 5, note: 'x' },
    { to: 'not an address', amount: '5', note: 'x' },
    { to: AGENT_WALLET, amount: '5', note: '   ' },
    { to: AGENT_WALLET, amount: '5', note: 'n'.repeat(141) },
    { to: AGENT_WALLET, amount: '5', note: 'x', extra: true },
  ]) {
    const answer = await ask(body);
    assert.equal(answer.status, 400, JSON.stringify(body));
  }
  assert.equal((await ask({ to: AGENT_WALLET, amount: '1.123456', note: 'n'.repeat(140) })).status, 201);

  const raw = (headers: Record<string, string>) =>
    request({ method: 'POST', url: '/agent/payment-requests', rawBody: JSON.stringify({ to: AGENT_WALLET, amount: '5', note: 'x' }), headers });
  assert.equal((await raw({ ...PROOF_HEADERS, 'content-type': 'text/plain' })).status, 415);
  const { 'x-siwa-signature': _omitted, ...withoutSignature } = PROOF_HEADERS;
  assert.equal((await raw(withoutSignature)).status, 401);
  // An unsigned extra header is not refused and grants nothing beyond the verified agent.
  assert.equal((await raw({ ...PROOF_HEADERS, 'x-agent-role': 'admin' })).status, 201);
});

// Invariant: a push that cannot be delivered never loses the request.
test('a failed push still records the request', async () => {
  const { pair, ask, request, failPushes } = createHarness();
  await pair('owner', 'Muse');
  failPushes(true);

  const asked = await ask({ to: AGENT_WALLET, amount: '5', note: 'API credits' });
  assert.equal(asked.status, 201);
  assert.equal((await request({ method: 'GET', url: `/mobile/payment-requests/${asked.body.requestIds[0]}`, userId: 'owner' })).status, 200);
});

// Invariant: paying prepares one USDC transfer for the person's own wallet,
// and a request is marked paid only from a Base receipt that pays it exactly
// from the wallet Coinbase says is the signed-in person's.
test('paying a request is prepared for the wallet and confirmed from Base', async () => {
  const { pair, ask, request, receipts, agentRead, signAs, checkPaid } = createHarness();
  await pair('owner', 'Muse');
  const id: string = (await ask({ to: ELSEWHERE, amount: '12.5', note: 'Hosting' })).body.requestIds[0];

  assert.equal((await request({ method: 'GET', url: `/mobile/payment-requests/${id}`, userId: 'stranger' })).status, 404);
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${id}/prepare`, userId: 'stranger', body: { walletAddress: PHONE_WALLET } })).status, 404);

  const prepared = await request({ method: 'POST', url: `/mobile/payment-requests/${id}/prepare`, userId: 'owner', body: { walletAddress: PHONE_WALLET } });
  assert.equal(prepared.status, 200);
  const action = prepared.body.wallet_action;
  assert.deepEqual(
    [action.action, action.chain_id, action.request_id, action.to, action.value, action.expected_signer, action.recipient, action.amount_raw],
    ['pay', 8453, id, BASE_USDC_ADDRESS, '0', PHONE_WALLET, ELSEWHERE, '12500000'],
  );
  assert.deepEqual(decodeFunctionData({ abi: erc20Abi, data: action.data }).args, [ELSEWHERE, 12_500_000n]);

  const markPaid = (txHash: string, wallet: string = PHONE_WALLET) => checkPaid('owner', id, txHash, wallet);

  // Not on Base yet, then transactions that pay the wrong amount, the wrong
  // address, from the wrong wallet, or that failed: all refused.
  assert.equal((await markPaid(TX_HASH)).body.error.code, 'PaymentNotFound');
  for (const receipt of [
    { status: 'success' as const, logs: [transferLog(PHONE_WALLET, ELSEWHERE, 12_000_000n)] },
    { status: 'success' as const, logs: [transferLog(PHONE_WALLET, AGENT_WALLET, 12_500_000n)] },
    { status: 'success' as const, logs: [transferLog(AGENT_WALLET, ELSEWHERE, 12_500_000n)] },
    { status: 'reverted' as const, logs: [transferLog(PHONE_WALLET, ELSEWHERE, 12_500_000n)] },
  ]) {
    receipts.set(TX_HASH, { kind: 'ok', receipt });
    const refused = await markPaid(TX_HASH);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'PaymentDoesNotMatch');
  }
  assert.equal((await request({ method: 'GET', url: `/mobile/payment-requests/${id}`, userId: 'owner' })).body.request.status, 'waiting');

  receipts.set(TX_HASH, { kind: 'ok', receipt: { status: 'success', logs: [transferLog(PHONE_WALLET, ELSEWHERE, 12_500_000n)] } });
  // The same receipt is refused while the person's own wallet is another one.
  assert.equal((await markPaid(TX_HASH, AGENT_WALLET)).body.error.code, 'PaymentDoesNotMatch');
  const paid = await markPaid(TX_HASH);
  assert.equal(paid.status, 200);
  assert.deepEqual([paid.body.request.status, paid.body.request.txHash], ['paid', TX_HASH]);

  // Paying again still prepares and confirms; the latest payment is kept.
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${id}/prepare`, userId: 'owner', body: { walletAddress: PHONE_WALLET } })).status, 200);
  receipts.set(OTHER_TX_HASH, { kind: 'ok', receipt: { status: 'success', logs: [transferLog(PHONE_WALLET, ELSEWHERE, 12_500_000n)] } });
  assert.equal((await markPaid(OTHER_TX_HASH)).body.request.txHash, OTHER_TX_HASH);

  // The payment cannot also mark an identical request paid.
  await pair('partner', 'Muse');
  const [twinId, partnerId] = (await ask({ to: ELSEWHERE, amount: '12.5', note: 'Hosting' })).body.requestIds as [string, string];
  const reused = await checkPaid('owner', twinId, TX_HASH);
  assert.equal(reused.status, 409);
  assert.deepEqual([reused.body.error.code, reused.body.error.message], ['PaymentAlreadyUsed', 'This payment was already used for another request.']);

  // Someone else who paired the same agent cannot use it either: from their
  // own wallet it does not match, and the owner's wallet is not theirs.
  assert.equal((await checkPaid('partner', partnerId, TX_HASH, PARTNER_WALLET)).body.error.code, 'PaymentDoesNotMatch');
  const borrowed = await checkPaid('partner', partnerId, TX_HASH, PHONE_WALLET, 'owner');
  assert.equal(borrowed.status, 403);
  assert.equal(borrowed.body.error.code, 'WalletNotYours');
  for (const [userId, requestId] of [['owner', twinId], ['partner', partnerId]] as const) {
    assert.equal((await request({ method: 'GET', url: `/mobile/payment-requests/${requestId}`, userId })).body.request.status, 'waiting');
  }

  // A paid request cannot be declined.
  const decline = await request({ method: 'POST', url: `/mobile/payment-requests/${id}/decline`, userId: 'owner' });
  assert.equal(decline.status, 409);
  assert.equal(decline.body.error.code, 'PaymentRequestPaid');

  // The asking agent reads the outcome; any other wallet reads nothing.
  assert.deepEqual((await agentRead(id)).body, { id, status: 'paid', txHash: OTHER_TX_HASH });
  signAs(ELSEWHERE);
  assert.equal((await agentRead(id)).status, 404);
});

// Invariant: a transaction proves exactly one request, for good.
test('a transaction pays one request only', async () => {
  const { pair, ask, kv, entries } = createHarness();
  await pair('owner', 'Muse');
  await pair('partner', 'Muse');
  const [ownerId, partnerId] = (await ask({ to: ELSEWHERE, amount: '5', note: 'Hosting' })).body.requestIds as [string, string];
  const deps = { kv };
  const markPaid = async (userId: string, id: string, txHash: string) => {
    const result = await markPaymentRequestPaid(userId, id, txHash, deps);
    return result?.kind === 'paid' ? [result.kind, result.request.status, result.request.txHash] : result?.kind;
  };

  // The first claim wins, and the same request confirming it again is fine.
  assert.deepEqual(await markPaid('owner', ownerId, TX_HASH), ['paid', 'paid', TX_HASH]);
  assert.deepEqual(await markPaid('owner', ownerId, TX_HASH), ['paid', 'paid', TX_HASH]);
  assert.equal(entries.state.entries[`regents:payment-requests:v1:tx:${TX_HASH}`]?.value, ownerId);

  // Another request cannot use it, however the hash is written.
  assert.equal(await markPaid('partner', partnerId, TX_HASH), 'transaction_used');
  assert.equal(await markPaid('partner', partnerId, TX_HASH.toUpperCase().replace('0X', '0x')), 'transaction_used');
  const partnerRequest = JSON.parse(entries.state.entries[`regents:payment-requests:v1:request:${partnerId}`]!.value);
  assert.deepEqual([partnerRequest.status, partnerRequest.txHash], ['waiting', null]);

  // A different transaction pays the other request.
  assert.deepEqual(await markPaid('partner', partnerId, OTHER_TX_HASH), ['paid', 'paid', OTHER_TX_HASH]);
});

test('checking a payment without a Base connection is plainly unavailable', async () => {
  const { pair, ask, receipts, checkPaid } = createHarness();
  await pair('owner', 'Muse');
  const id: string = (await ask({ to: AGENT_WALLET, amount: '5', note: 'API credits' })).body.requestIds[0];

  receipts.set(TX_HASH, { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' });
  const missing = await checkPaid('owner', id, TX_HASH);
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error.message, 'Checking payments is unavailable right now.');

  receipts.set(TX_HASH, { kind: 'rpc_error', name: 'HttpRequestError' });
  assert.equal((await checkPaid('owner', id, TX_HASH)).status, 502);
});

// Invariant: a payment is checked only once Coinbase names the signed-in
// person's own wallet.
test('checking a payment needs the person\'s own wallet', async () => {
  const { pair, ask, request, receipts, checkPaid, coinbaseDown } = createHarness();
  await pair('owner', 'Muse');
  const id: string = (await ask({ to: AGENT_WALLET, amount: '5', note: 'API credits' })).body.requestIds[0];
  receipts.set(TX_HASH, { kind: 'ok', receipt: { status: 'success', logs: [transferLog(PHONE_WALLET, AGENT_WALLET, 5_000_000n)] } });

  const noToken = await request({ method: 'POST', url: `/mobile/payment-requests/${id}/paid`, userId: 'owner', body: { txHash: TX_HASH } });
  assert.equal(noToken.status, 400);

  const noWallet = await checkPaid('owner', id, TX_HASH, '');
  assert.equal(noWallet.body.error.code, 'WalletNotYours');

  const withToken = (walletAccessToken: string) =>
    request({ method: 'POST', url: `/mobile/payment-requests/${id}/paid`, userId: 'owner', body: { txHash: TX_HASH, walletAccessToken } });
  const expired = await withToken('expired');
  assert.equal(expired.status, 403);
  assert.deepEqual(
    [expired.body.error.code, expired.body.error.message],
    ['WalletSignInEnded', 'Your wallet sign-in has ended. Open your wallet, then check the payment again.'],
  );
  assert.equal((await withToken('unknown')).body.error.code, 'WalletNotYours');

  coinbaseDown(true);
  const down = await checkPaid('owner', id, TX_HASH);
  assert.equal(down.status, 502);
  assert.equal(down.body.error.code, 'WalletCheckFailed');

  coinbaseDown(false);
  assert.equal((await checkPaid('owner', id, TX_HASH)).body.request.status, 'paid');
});

test('declining a request is recorded and seen by the agent', async () => {
  const { pair, ask, request, agentRead } = createHarness();
  await pair('owner', 'Muse');
  const id: string = (await ask({ to: AGENT_WALLET, amount: '5', note: 'API credits' })).body.requestIds[0];
  assert.deepEqual((await agentRead(id)).body, { id, status: 'waiting', txHash: null });

  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${id}/decline`, userId: 'stranger' })).status, 404);
  const declined = await request({ method: 'POST', url: `/mobile/payment-requests/${id}/decline`, userId: 'owner' });
  assert.equal(declined.status, 200);
  assert.equal(declined.body.request.status, 'declined');
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${id}/decline`, userId: 'owner' })).status, 200);
  assert.deepEqual((await agentRead(id)).body, { id, status: 'declined', txHash: null });

  // A declined request can still be paid.
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${id}/prepare`, userId: 'owner', body: { walletAddress: PHONE_WALLET } })).status, 200);
});

// Invariant: each person keeps their newest hundred requests; the oldest
// drops out along with its stored request but its transaction stays used,
// and a damaged request is reported without being replaced.
test('a person keeps the newest hundred requests', async () => {
  const { pair, ask, request, entries, receipts, checkPaid } = createHarness();
  await pair('owner', 'Muse');

  const ids: string[] = [];
  for (let index = 1; index <= MAX_REQUESTS_PER_USER + 1; index += 1) {
    ids.push((await ask({ to: AGENT_WALLET, amount: String(index), note: `Request ${index}` })).body.requestIds[0]);
    if (index === 1) {
      receipts.set(TX_HASH, { kind: 'ok', receipt: { status: 'success', logs: [transferLog(PHONE_WALLET, AGENT_WALLET, 1_000_000n)] } });
      const paid = await checkPaid('owner', ids[0]!, TX_HASH);
      assert.equal(paid.status, 200);
    }
  }

  const list = (await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'owner' })).body.requests;
  assert.equal(list.length, MAX_REQUESTS_PER_USER);
  assert.equal(list[0].note, `Request ${MAX_REQUESTS_PER_USER + 1}`);
  assert.equal(list.at(-1).note, 'Request 2');
  assert.equal(entries.state.entries[`regents:payment-requests:v1:request:${ids[0]}`], undefined);
  assert.equal((await request({ method: 'GET', url: `/mobile/payment-requests/${ids[0]}`, userId: 'owner' })).status, 404);
  assert.equal(entries.state.entries[`regents:payment-requests:v1:tx:${TX_HASH}`]?.value, ids[0]);
  const again = (await ask({ to: AGENT_WALLET, amount: '1', note: 'Request 1 again' })).body.requestIds[0];
  const reused = await checkPaid('owner', again, TX_HASH);
  assert.equal(reused.body.error.code, 'PaymentAlreadyUsed');

  const damagedKey = `regents:payment-requests:v1:request:${ids[5]}`;
  entries.state.entries[damagedKey] = { value: '{"status":"lost"}', expiresAt: null };
  const damaged = await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'owner' });
  assert.equal(damaged.status, 500);
  assert.equal(damaged.body.error.code, 'PaymentRequestsUnavailable');
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${ids[5]}/decline`, userId: 'owner' })).status, 500);
  assert.equal(entries.state.entries[damagedKey]?.value, '{"status":"lost"}');
});

// Invariant: a status read carries no body, so the SIWA server is asked to
// check it without a digest; an ask is checked by the digest of its exact bytes.
test('the agent status read is checked without a body digest', async () => {
  const { pair, ask, agentRead, signedRequests } = createHarness();
  await pair('owner', 'Muse');
  const askBody = { to: AGENT_WALLET, amount: '5', note: 'API credits' };
  const id: string = (await ask(askBody)).body.requestIds[0];
  const askDigest = `sha-256=:${createHash('sha256').update(JSON.stringify(askBody)).digest('base64')}:`;
  assert.deepEqual(signedRequests.at(-1)?.body_digest, askDigest);

  assert.equal((await agentRead(id)).status, 200);
  const read = signedRequests.at(-1)!;
  assert.deepEqual([read.method, read.path, 'body_digest' in read], ['GET', `/agent/payment-requests/${id}`, false]);
});

// Invariant: when two people pair the same agent, each gets their own request
// and neither can see or act on the other's; it reads as not found.
test('people who pair the same agent each get their own request', async () => {
  const { pair, ask, request, receipts, agentRead, checkPaid, entries } = createHarness();
  await pair('owner', 'Muse');
  await pair('partner', 'Partner Muse');
  const [ownerId, partnerId] = (await ask({ to: ELSEWHERE, amount: '5', note: 'Hosting' })).body.requestIds as [string, string];

  const listed = async (userId: string) =>
    (await request({ method: 'GET', url: '/mobile/payment-requests', userId })).body.requests.map((shown: any) => [shown.id, shown.agentName]);
  assert.deepEqual(await listed('owner'), [[ownerId, 'Muse']]);
  assert.deepEqual(await listed('partner'), [[partnerId, 'Partner Muse']]);

  // Base shows a payment that would settle the partner's request from the owner's own wallet.
  receipts.set(TX_HASH, { kind: 'ok', receipt: { status: 'success', logs: [transferLog(PHONE_WALLET, ELSEWHERE, 5_000_000n)] } });
  for (const answer of [
    await request({ method: 'GET', url: `/mobile/payment-requests/${partnerId}`, userId: 'owner' }),
    await request({ method: 'POST', url: `/mobile/payment-requests/${partnerId}/prepare`, userId: 'owner', body: { walletAddress: PHONE_WALLET } }),
    await checkPaid('owner', partnerId, TX_HASH),
    await request({ method: 'POST', url: `/mobile/payment-requests/${partnerId}/decline`, userId: 'owner' }),
  ]) {
    assert.deepEqual([answer.status, answer.body.error.code], [404, 'PaymentRequestNotFound']);
  }
  assert.equal(entries.state.entries[`regents:payment-requests:v1:tx:${TX_HASH}`], undefined);
  assert.equal((await request({ method: 'GET', url: `/mobile/payment-requests/${partnerId}`, userId: 'partner' })).body.request.status, 'waiting');

  // The agent follows both of its requests.
  assert.equal((await agentRead(ownerId)).body.status, 'waiting');
  assert.equal((await agentRead(partnerId)).body.status, 'waiting');
});

// Invariant: removing an agent stops new asks reaching that person; requests
// already made stay in their list, can still be paid or declined, and the
// agent can still read how they ended.
test('removing an agent keeps the requests it already made', async () => {
  const { pair, ask, request, receipts, pushes, agentRead, checkPaid } = createHarness();
  const ownerAgent = await pair('owner', 'Muse');
  const friendAgent = await pair('friend', 'Shared Muse');
  const [toPay] = (await ask({ to: ELSEWHERE, amount: '5', note: 'Hosting' })).body.requestIds as [string, string];
  const [toDecline] = (await ask({ to: ELSEWHERE, amount: '1', note: 'Coffee' })).body.requestIds as [string, string];

  assert.equal((await request({ method: 'DELETE', url: `/mobile/agents/${ownerAgent.id}`, userId: 'owner' })).status, 200);

  const ownerList = (await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'owner' })).body.requests;
  assert.deepEqual(ownerList.map((shown: any) => [shown.id, shown.status]), [[toDecline, 'waiting'], [toPay, 'waiting']]);
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${toPay}/prepare`, userId: 'owner', body: { walletAddress: PHONE_WALLET } })).status, 200);
  receipts.set(TX_HASH, { kind: 'ok', receipt: { status: 'success', logs: [transferLog(PHONE_WALLET, ELSEWHERE, 5_000_000n)] } });
  assert.equal((await checkPaid('owner', toPay, TX_HASH)).body.request.status, 'paid');
  assert.equal((await request({ method: 'POST', url: `/mobile/payment-requests/${toDecline}/decline`, userId: 'owner' })).body.request.status, 'declined');
  assert.deepEqual((await agentRead(toPay)).body, { id: toPay, status: 'paid', txHash: TX_HASH });
  assert.equal((await agentRead(toDecline)).body.status, 'declined');

  // A new ask reaches only the friend, and nobody once the friend removes it too.
  pushes.length = 0;
  assert.equal((await ask({ to: ELSEWHERE, amount: '2', note: 'Later' })).body.requestIds.length, 1);
  assert.deepEqual(pushes.map((push) => push.userId), ['friend']);
  assert.equal((await request({ method: 'GET', url: '/mobile/payment-requests', userId: 'owner' })).body.requests.length, 2);
  assert.equal((await request({ method: 'DELETE', url: `/mobile/agents/${friendAgent.id}`, userId: 'friend' })).status, 200);
  assert.equal((await ask({ to: ELSEWHERE, amount: '2', note: 'Later' })).body.error.code, 'AgentNotPaired');
});
