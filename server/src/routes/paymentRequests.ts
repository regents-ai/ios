import { Router, type Request, type Response } from 'express';
import type { Address, Hash } from 'viem';
import { z } from 'zod';

import {
  prepareUsdcTransfer,
  readBaseTransferReceipt,
  receiptPaysExactly,
  type TransferReceiptReader,
} from '../baseUsdcTransfers.js';
import { sendError } from '../httpResponses.js';
import { evmAddressSchema, MobileAgentsStateError, type MobileAgentsDeps, type MobileAgentsKv } from '../mobileAgents.js';
import {
  createPaymentRequests,
  declinePaymentRequest,
  formatUsdcAmount,
  listPaymentRequestsForUser,
  markPaymentRequestPaid,
  noteSchema,
  parseUsdcAmount,
  paymentRequestForAgent,
  paymentRequestForUser,
  txHashSchema,
  type PaymentRequestRecord,
} from '../paymentRequests.js';
import { verifySignedAgentRequest, type SignedAgentRequestVerifier } from '../services/siwaHttpVerifier.js';
import { readSignedAgentJson, readSignedAgentRead } from './signedAgentRequest.js';

export const PAYMENT_REQUEST_CATEGORY = 'payment_request';

export type PaymentRequestNotification = {
  title: string;
  body: string;
  category: typeof PAYMENT_REQUEST_CATEGORY;
  data: { type: typeof PAYMENT_REQUEST_CATEGORY; requestId: string };
};

/** Delivers a push to the user's registered device; throws when delivery fails. */
export type NotifyUser = (userId: string, notification: PaymentRequestNotification) => Promise<void>;

const agentRequestBodySchema = z
  .object({
    to: evmAddressSchema,
    amount: z.string().transform((value, ctx) => {
      const amountRaw = parseUsdcAmount(value);
      if (amountRaw === null) {
        ctx.addIssue({ code: 'custom', message: 'amount' });
        return z.NEVER;
      }
      return amountRaw;
    }),
    note: noteSchema,
  })
  .strict();

const walletBodySchema = z.object({ walletAddress: evmAddressSchema }).strict();
const paidBodySchema = z.object({ walletAddress: evmAddressSchema, txHash: txHashSchema }).strict();
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(100) });

const AGENT_BODY_MESSAGE =
  'Send a JSON body with to (a Base address), amount (USDC above zero with at most 6 decimals, for example "5.00") and note (1 to 140 characters).';
const NOT_FOUND_MESSAGE = 'This request is not in your list.';

function currentUserId(req: Request, res: Response) {
  if (req.userId) {
    return req.userId;
  }

  sendError(res, 401, 'Unauthorized', 'Sign in to see your requests.');
  return null;
}

function requestJson(request: PaymentRequestRecord) {
  const { userId: _userId, ...shown } = request;
  return { ...shown, amount: formatUsdcAmount(request.amountRaw) };
}

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** A stored value that no longer parses fails that request loudly and is never overwritten. */
function guarded(handler: Handler): Handler {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof MobileAgentsStateError) {
        console.error('❌ [PAYMENT REQUESTS] Stored state could not be read:', { key: error.key, issues: error.issues });
        return sendError(res, 500, 'PaymentRequestsUnavailable', "Requests couldn't be read right now. Please try again later.");
      }
      throw error;
    }
  };
}

export function createPaymentRequestRoutes(input: {
  kv: MobileAgentsKv;
  notifyUser: NotifyUser;
  now?: () => number;
  readReceipt?: TransferReceiptReader;
  verifySignedRequest?: SignedAgentRequestVerifier;
}) {
  const router = Router();
  const deps: MobileAgentsDeps = { kv: input.kv };
  if (input.now) {
    deps.now = input.now;
  }
  const readReceipt = input.readReceipt ?? readBaseTransferReceipt;
  const verifySignedRequest = input.verifySignedRequest ?? verifySignedAgentRequest;
  const unavailableMessage = "Payment requests aren't available on this server right now.";

  router.post('/agent/payment-requests', guarded(async (req, res) => {
    const signed = await readSignedAgentJson(req, res, {
      verify: verifySignedRequest,
      schema: agentRequestBodySchema,
      notJsonMessage: 'Send the payment request as JSON with content-type application/json.',
      bodyMessage: AGENT_BODY_MESSAGE,
      unavailableMessage,
    });
    if (!signed) {
      return;
    }

    const { to, amount, note } = signed.body;
    const result = await createPaymentRequests(signed.walletAddress, { to, amountRaw: amount, note }, deps);
    if (result.kind === 'not_paired') {
      return sendError(
        res,
        403,
        'AgentNotPaired',
        'This wallet is not paired with anyone yet. Pair with your person first using a code from their Regents app, then ask again.',
      );
    }

    await Promise.all(
      result.requests.map((request) =>
        input
          .notifyUser(request.userId, {
            title: `${request.agentName} asks for ${formatUsdcAmount(request.amountRaw)} USDC`,
            body: request.note,
            category: PAYMENT_REQUEST_CATEGORY,
            data: { type: PAYMENT_REQUEST_CATEGORY, requestId: request.id },
          })
          .catch((error: unknown) => {
            console.error('❌ [PAYMENT REQUESTS] Push delivery failed:', {
              requestId: request.id,
              name: error instanceof Error ? error.name : typeof error,
            });
          }),
      ),
    );

    return res.status(201).json({
      requestIds: result.requests.map((request) => request.id),
      message: 'Your request was sent. Your person can pay or decline it in their Regents app.',
    });
  }));

  router.get('/agent/payment-requests/:id', guarded(async (req, res) => {
    const walletAddress = await readSignedAgentRead(req, res, { verify: verifySignedRequest, unavailableMessage });
    if (walletAddress === null) {
      return;
    }
    const params = idParamsSchema.safeParse(req.params);
    const request = params.success ? await paymentRequestForAgent(walletAddress, params.data.id, deps) : null;
    if (!request) {
      return sendError(res, 404, 'PaymentRequestNotFound', 'No request with this id was made by your wallet.');
    }

    return res.json({ id: request.id, status: request.status, txHash: request.txHash });
  }));

  router.get('/mobile/payment-requests', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const requests = await listPaymentRequestsForUser(userId, deps);
    return res.json({ requests: requests.map(requestJson) });
  }));

  router.get('/mobile/payment-requests/:id', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = idParamsSchema.safeParse(req.params);
    const request = params.success ? await paymentRequestForUser(userId, params.data.id, deps) : null;
    if (!request) {
      return sendError(res, 404, 'PaymentRequestNotFound', NOT_FOUND_MESSAGE);
    }

    return res.json({ request: requestJson(request) });
  }));

  router.post('/mobile/payment-requests/:id/prepare', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = idParamsSchema.safeParse(req.params);
    const body = walletBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return sendError(res, 400, 'BadRequest', 'Open your wallet, then try again.');
    }
    const request = await paymentRequestForUser(userId, params.data.id, deps);
    if (!request) {
      return sendError(res, 404, 'PaymentRequestNotFound', NOT_FOUND_MESSAGE);
    }

    return res.json({
      wallet_action: prepareUsdcTransfer({
        requestId: request.id,
        walletAddress: body.data.walletAddress as Address,
        recipient: request.to as Address,
        amountRaw: BigInt(request.amountRaw),
      }),
    });
  }));

  router.post('/mobile/payment-requests/:id/paid', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = idParamsSchema.safeParse(req.params);
    const body = paidBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return sendError(res, 400, 'BadRequest', 'A wallet address and payment transaction are required.');
    }
    const request = await paymentRequestForUser(userId, params.data.id, deps);
    if (!request) {
      return sendError(res, 404, 'PaymentRequestNotFound', NOT_FOUND_MESSAGE);
    }

    const read = await readReceipt(body.data.txHash as Hash);
    if (read.kind === 'missing_rpc') {
      console.error(`❌ [PAYMENT REQUESTS] ${read.requiredEnv} is not set; payments cannot be checked.`);
      return sendError(res, 503, 'PaymentCheckUnavailable', 'Checking payments is unavailable right now.');
    }
    if (read.kind === 'rpc_error') {
      console.error('❌ [PAYMENT REQUESTS] Base receipt read failed:', { name: read.name });
      return sendError(res, 502, 'BaseRpcError', 'The payment could not be checked on Base right now. Try again in a moment.');
    }
    if (read.kind === 'not_found') {
      return sendError(res, 409, 'PaymentNotFound', 'Base does not show this payment yet. Try again in a moment.');
    }
    const pays = receiptPaysExactly(read.receipt, {
      from: body.data.walletAddress as Address,
      to: request.to as Address,
      amountRaw: BigInt(request.amountRaw),
    });
    if (!pays) {
      return sendError(res, 409, 'PaymentDoesNotMatch', 'This payment does not match the request, so it was not marked as paid.');
    }

    const paid = await markPaymentRequestPaid(userId, request.id, body.data.txHash, deps);
    if (!paid) {
      return sendError(res, 404, 'PaymentRequestNotFound', NOT_FOUND_MESSAGE);
    }
    return res.json({ request: requestJson(paid) });
  }));

  router.post('/mobile/payment-requests/:id/decline', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = idParamsSchema.safeParse(req.params);
    const result = params.success ? await declinePaymentRequest(userId, params.data.id, deps) : null;
    if (!result) {
      return sendError(res, 404, 'PaymentRequestNotFound', NOT_FOUND_MESSAGE);
    }
    if (result.kind === 'already_paid') {
      return sendError(res, 409, 'PaymentRequestPaid', 'This request is already paid.');
    }

    return res.json({ request: requestJson(result.request) });
  }));

  return router;
}
