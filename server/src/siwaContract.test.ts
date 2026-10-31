import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Request, Response } from 'express';
import { z } from 'zod';

import { readSignedAgentJson, readSignedAgentRead } from './routes/signedAgentRequest.js';
import { type SignedAgentRequest, verifySignedAgentRequest } from './services/siwaHttpVerifier.js';
import contract from './siwa/contract.json' with { type: 'json' };
import fixtures from './siwa/fixtures.json' with { type: 'json' };

/**
 * Conformance with the SIWA signing contract. The copies in src/siwa are generated from
 * elixir-utils at the commit siwa-contract.lock.json pins; every request the contract's
 * fixtures describe is run through this backend's signed-request check.
 */

type FixtureRequest = { method: string; path: string; authority: string; body: string | null; headers: string[][] };

const lock: { files: Record<string, { copy: string; sha256: string }> } = JSON.parse(
  readFileSync(new URL('../siwa-contract.lock.json', import.meta.url), 'utf8'),
);
const sha256 = (path: string) => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
const forwarded = new Set<string>(contract.forwarded_headers);
const contentDigest = (body: string) => `sha-256=:${createHash('sha256').update(body).digest('base64')}:`;

// Invariant: the contract this backend reads is the pinned, generated file, never a hand edit.
test('the SIWA contract copies are the pinned files', () => {
  for (const { copy, sha256: pinned } of Object.values(lock.files)) {
    assert.equal(sha256(copy), pinned, `${copy} is not the file siwa-contract.lock.json pins`);
  }
  assert.equal(sha256('src/siwa/contract.json'), fixtures.contract_id);
});

/** Runs a fixture request through the signed-request check the way Express hands it over. */
async function check(request: FixtureRequest) {
  const headersDistinct: Record<string, string[]> = {};
  // Node lowercases header names.
  for (const [name, value] of request.headers) {
    (headersDistinct[name!.toLowerCase()] ??= []).push(value!);
  }
  // An agent sends its JSON body as JSON; the content type is not part of the signature.
  if (request.method === 'POST') {
    headersDistinct['content-type'] = ['application/json'];
  }
  // The agent sent it to the host it signed.
  headersDistinct.host = [request.authority];
  const headers = Object.fromEntries(Object.entries(headersDistinct).map(([name, values]) => [name, values.join(', ')]));
  const req = {
    method: request.method,
    url: request.path,
    originalUrl: request.path,
    protocol: 'https',
    headers,
    headersDistinct,
    body: request.body === null ? undefined : Buffer.from(request.body),
    header: () => undefined,
  } as unknown as Request;
  let status = 200;
  let code: string | null = null;
  const res = {
    req,
    setHeader() {},
    status(code: number) {
      status = code;
      return res;
    },
    json(body: { error?: { code: string } }) {
      code = body.error?.code ?? null;
      return res;
    },
  } as unknown as Response;

  const sent: SignedAgentRequest[] = [];
  const verify = async (signed: SignedAgentRequest) => {
    sent.push(signed);
    return { kind: 'verified' as const, walletAddress: fixtures.principal.wallet_address };
  };
  const unavailableMessage = 'unavailable';
  const wallet =
    request.method === 'POST'
      ? (await readSignedAgentJson(req, res, { verify, schema: z.unknown(), notJsonMessage: '', bodyMessage: '', unavailableMessage }))
          ?.walletAddress
      : await readSignedAgentRead(req, res, { verify, unavailableMessage });
  return { status, code, sent, wallet: wallet ?? null };
}

/** What the SIWA server must be sent for a fixture request: its path, host and proof headers unchanged, and its body's digest. */
function forwardedAs(request: FixtureRequest): SignedAgentRequest {
  const headers = request.headers.map(([name, value]) => [name!.toLowerCase(), value!]);
  return {
    method: request.method,
    path: request.path,
    authority: request.authority,
    headers: Object.fromEntries(headers.filter(([name]) => forwarded.has(name!))),
    ...(request.body === null ? {} : { body_digest: contentDigest(request.body) }),
  };
}

// Invariant: a request this backend takes reaches the SIWA server exactly as the agent
// signed it, its body as the digest of the bytes received; one it cannot take is refused
// before the SIWA server is asked.
test('every signed fixture reaches the SIWA server as signed, or is refused here when it signs a query', async () => {
  for (const { name, query, request } of fixtures.signed) {
    const result = await check(request);
    if (query === 'signed') {
      // This backend signs no query string, so a request with one is refused here.
      assert.equal(result.status, 401, name);
      assert.equal(result.code, 'unsupported_query', name);
      assert.deepEqual(result.sent, [], name);
    } else {
      assert.deepEqual(result.sent, [forwardedAs(request)], name);
      assert.deepEqual(Object.entries(result.sent[0]!.headers).sort(), [...request.headers].sort(), name);
      assert.equal(result.wallet, fixtures.principal.wallet_address, name);
    }
  }
});

// Invariant: the host goes to the SIWA server the way the agent signs it, lowercase and
// without the scheme's default port, and a request addressed to no host is refused here.
test('the host the request reached is sent as the agent signs it', async () => {
  const { request } = fixtures.signed[0]!;
  const sent = await check({ ...request, authority: `${request.authority.toUpperCase()}:443` });
  assert.deepEqual(sent.sent, [forwardedAs(request)]);

  const unaddressed = await check({ ...request, authority: `${request.authority}/elsewhere` });
  assert.deepEqual([unaddressed.status, unaddressed.code, unaddressed.sent], [400, 'BadRequest', []]);
});

// Invariant: every refused fixture is refused, here or by the SIWA server, which this
// backend asks with the request unchanged (its body as the digest of the bytes received)
// so the tampering is what it checks.
test('every refused fixture is refused here or sent unchanged to the SIWA server', async () => {
  for (const { name, query, request, checked_by, reason } of fixtures.refused) {
    const result = await check(request);
    if (checked_by === 'site_plug' || query === 'signed') {
      assert.equal(result.status, 401, name);
      assert.equal(result.code, checked_by === 'site_plug' ? reason : 'unsupported_query', name);
      assert.deepEqual(result.sent, [], name);
    } else {
      assert.deepEqual(result.sent, [forwardedAs(request)], name);
    }
  }
});

// Invariant (founder rule, 8 Oct 2026): an extra unsigned header, or a platform's own bot
// signature alongside, is neither refused nor sent on, and grants nothing.
test('every accepted fixture is taken, with only the proof headers sent on', async () => {
  for (const { name, request } of fixtures.accepted) {
    const result = await check(request);
    assert.equal(result.wallet, fixtures.principal.wallet_address, name);
    assert.deepEqual(result.sent, [forwardedAs(request)], name);
    assert.ok(Object.keys(result.sent[0]!.headers).every((header) => forwarded.has(header)), name);
  }
});

// Invariant: each refusal the SIWA server can give reaches the agent as the matching answer:
// a replay as a replay, a server fault as "try again", any other refusal as not accepted.
test('every refusal in the contract is read as the SIWA server means it', async () => {
  const request = forwardedAs(fixtures.signed[0]!.request);
  for (const { status, code } of contract.refusals) {
    const answer = await verifySignedAgentRequest(request, {
      siwaServerUrl: 'http://siwa.test',
      fetchImpl: async () => Response.json({ error: { code } }, { status }),
    });
    const expected = status === 409 ? 'replayed' : status >= 500 ? 'unavailable' : 'rejected';
    assert.equal(answer.kind, expected, code);
  }
});
