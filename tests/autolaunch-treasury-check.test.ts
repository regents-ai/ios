import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { checkAutolaunchTreasury } from '../utils/autolaunch/treasuryCheck';

const AUCTION_ID = '3f2c6c1e-9d3a-4a1f-8c2e-1b6f0d9e7a11';
const CHECK_URL = `https://autolaunch.sh/api/v1/auctions/${AUCTION_ID}/treasury-check`;

const realFetch = globalThis.fetch;
const requests: { url: string; method: string | undefined }[] = [];

function answerWith(...responses: (() => Promise<Response>)[]) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), method: init?.method });
    const next = responses.shift();
    assert.ok(next, 'the check asked the website more often than expected');
    return next();
  }) as typeof fetch;
}

function json(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  requests.length = 0;
});

test('a successful answer with ok true passes, read from the auction treasury check on autolaunch.sh', async () => {
  answerWith(json(200, { ok: true }));

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: true });
  assert.deepEqual(requests, [{ url: CHECK_URL, method: 'GET' }]);
});

test('an answer with ok false carries the website reason', async () => {
  answerWith(json(200, { ok: false, reason: 'treasury_source_reorged' }));

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'treasury_source_reorged' });
});

test('anything other than ok true does not pass', async () => {
  answerWith(json(200, { ok: 'true' }), json(200, {}), json(200, null), json(200, { ok: false }));

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
});

test('a missing check on the website (404) does not pass', async () => {
  answerWith(
    json(404, { error: { message: 'Not found' } }),
    async () => new Response('<html>Not Found</html>', { status: 404 })
  );

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
});

test('an error status does not pass, even with ok true in the body', async () => {
  answerWith(json(500, { ok: true }));

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
});

test('a dropped connection does not pass', async () => {
  answerWith(async () => {
    throw new TypeError('Network request failed');
  });

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
});

test('a reply that is not JSON does not pass', async () => {
  answerWith(async () => new Response('{"ok": tru', { status: 200 }));

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'check_unavailable' });
});

test('every check asks the website again, so a pass is never reused', async () => {
  answerWith(json(200, { ok: true }), json(200, { ok: false, reason: 'treasury_safe_changed' }));

  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: true });
  assert.deepEqual(await checkAutolaunchTreasury(AUCTION_ID), { ok: false, reason: 'treasury_safe_changed' });
  assert.equal(requests.length, 2);
});
