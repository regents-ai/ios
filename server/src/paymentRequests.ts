import { randomUUID } from 'node:crypto';
import { formatUnits, maxUint256, parseUnits } from 'viem';
import { z } from 'zod';

import {
  compareAndSwapUpdate,
  evmAddressSchema,
  pairedAgentsForWallet,
  parseStored,
  type MobileAgentsDeps,
  type MobileAgentsKv,
} from './mobileAgents.js';

/**
 * Payment requests: a paired agent asks the person who paired it for Base
 * USDC, and the person pays it from their phone wallet or declines it.
 *
 * Storage is one key per request and one key per user holding that user's
 * request ids, newest first, capped at the newest hundred; the oldest
 * request drops out with its key. Requests never expire. They live in the
 * same key-value store as the agents list, and a damaged value is reported,
 * never replaced.
 *
 * Nothing here gates paying. Status only records what happened: a request
 * becomes paid when Base shows the payment, and paying again, or paying a
 * declined request, goes to the wallet like any other payment.
 */

export const MAX_REQUESTS_PER_USER = 100;
export const USDC_DECIMALS = 6;
export const NOTE_MAX_LENGTH = 140;

const KEY_PREFIX = 'regents:payment-requests:v1';

export const PAYMENT_REQUEST_STATUSES = ['waiting', 'paid', 'declined'] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const noteSchema = z.string().trim().min(1).max(NOTE_MAX_LENGTH);
export const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const paymentRequestSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    agentId: z.string().min(1),
    agentName: z.string().min(1),
    agentWallet: evmAddressSchema,
    to: evmAddressSchema,
    amountRaw: z.string().regex(/^[1-9][0-9]*$/),
    note: noteSchema,
    createdAt: z.string().datetime(),
    status: z.enum(PAYMENT_REQUEST_STATUSES),
    txHash: txHashSchema.nullable(),
  })
  .strict();
const requestIdsSchema = z.array(z.string().min(1));

export type PaymentRequestRecord = z.infer<typeof paymentRequestSchema>;

const requestKey = (id: string) => `${KEY_PREFIX}:request:${id}`;
const userRequestsKey = (userId: string) => `${KEY_PREFIX}:user:${userId}`;

/** A positive USDC amount with at most six decimal places, in atomic units that fit a transfer. */
export function parseUsdcAmount(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    return null;
  }
  const atomic = parseUnits(value, USDC_DECIMALS);
  return atomic > 0n && atomic <= maxUint256 ? atomic : null;
}

/** "5.00", "0.25", "1.234567": always at least two decimal places. */
export function formatUsdcAmount(amountRaw: string): string {
  const [whole, fraction = ''] = formatUnits(BigInt(amountRaw), USDC_DECIMALS).split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

async function readRequest(kv: MobileAgentsKv, id: string): Promise<PaymentRequestRecord | null> {
  const key = requestKey(id);
  const raw = await kv.get(key);
  return raw === null ? null : parseStored(paymentRequestSchema, key, raw);
}

/** Puts a new id at the front of the user's list; returns the ids that fell off the end. */
function prependUserRequest(kv: MobileAgentsKv, userId: string, id: string): Promise<string[]> {
  const key = userRequestsKey(userId);
  return compareAndSwapUpdate(
    kv,
    key,
    (raw) => (raw === null ? [] : parseStored(requestIdsSchema, key, raw)),
    (ids) => {
      ids.unshift(id);
      return { write: true, result: ids.splice(MAX_REQUESTS_PER_USER) };
    },
  );
}

export type CreatePaymentRequestsResult =
  | { kind: 'created'; requests: PaymentRequestRecord[] }
  | { kind: 'not_paired' };

/**
 * One request for each user who paired the agent's wallet. The request key
 * is written before the user's list names it, and a dropped request's key is
 * deleted only after the list stopped naming it.
 */
export async function createPaymentRequests(
  agentWallet: string,
  input: { to: string; amountRaw: bigint; note: string },
  deps: MobileAgentsDeps,
): Promise<CreatePaymentRequestsResult> {
  const now = deps.now ?? Date.now;
  const pairings = await pairedAgentsForWallet(agentWallet, deps);
  if (pairings.length === 0) {
    return { kind: 'not_paired' };
  }

  const requests: PaymentRequestRecord[] = [];
  for (const { userId, agent } of pairings) {
    const request: PaymentRequestRecord = {
      id: randomUUID(),
      userId,
      agentId: agent.id,
      agentName: agent.name,
      agentWallet: agent.walletAddress,
      to: input.to,
      amountRaw: input.amountRaw.toString(),
      note: input.note,
      createdAt: new Date(now()).toISOString(),
      status: 'waiting',
      txHash: null,
    };
    if (!(await deps.kv.compareAndSwap(requestKey(request.id), null, JSON.stringify(request)))) {
      throw new Error(`Payment request ${request.id} already exists.`);
    }
    const dropped = await prependUserRequest(deps.kv, userId, request.id);
    await Promise.all(dropped.map((id) => deps.kv.del(requestKey(id))));
    requests.push(request);
  }
  return { kind: 'created', requests };
}

/** The user's requests, newest first. */
export async function listPaymentRequestsForUser(userId: string, deps: MobileAgentsDeps): Promise<PaymentRequestRecord[]> {
  const key = userRequestsKey(userId);
  const raw = await deps.kv.get(key);
  const ids = raw === null ? [] : parseStored(requestIdsSchema, key, raw);
  const requests = await Promise.all(ids.map((id) => readRequest(deps.kv, id)));
  return requests.filter((request) => request !== null);
}

/** Someone else's request reads as missing. */
export async function paymentRequestForUser(userId: string, id: string, deps: MobileAgentsDeps) {
  const request = await readRequest(deps.kv, id);
  return request && request.userId === userId ? request : null;
}

/** Only the agent that asked can read its request. */
export async function paymentRequestForAgent(agentWallet: string, id: string, deps: MobileAgentsDeps) {
  const request = await readRequest(deps.kv, id);
  return request && request.agentWallet.toLowerCase() === agentWallet.toLowerCase() ? request : null;
}

function updateRequestForUser<R>(
  userId: string,
  id: string,
  deps: MobileAgentsDeps,
  mutate: (request: PaymentRequestRecord) => { write: boolean; result: R },
): Promise<R | null> {
  const key = requestKey(id);
  return compareAndSwapUpdate(
    deps.kv,
    key,
    (raw) => (raw === null ? null : parseStored(paymentRequestSchema, key, raw)),
    (request) => (request && request.userId === userId ? mutate(request) : { write: false, result: null }),
  );
}

/** Records a payment Base has shown; the latest payment's transaction is kept. */
export function markPaymentRequestPaid(userId: string, id: string, txHash: string, deps: MobileAgentsDeps) {
  return updateRequestForUser(userId, id, deps, (request) => {
    request.status = 'paid';
    request.txHash = txHash;
    return { write: true, result: request };
  });
}

export type DeclinePaymentRequestResult = { kind: 'declined'; request: PaymentRequestRecord } | { kind: 'already_paid' };

export function declinePaymentRequest(userId: string, id: string, deps: MobileAgentsDeps) {
  return updateRequestForUser<DeclinePaymentRequestResult>(userId, id, deps, (request) => {
    if (request.status === 'paid') {
      return { write: false, result: { kind: 'already_paid' } };
    }
    const write = request.status !== 'declined';
    request.status = 'declined';
    return { write, result: { kind: 'declined', request } };
  });
}
