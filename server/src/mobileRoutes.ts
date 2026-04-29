import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { verifyBaseReceipt } from './baseReceiptVerification.js';
import { sendError } from './httpResponses.js';
import {
  confirmPreparedWalletActionForUser,
  confirmRegentFundingIntentForUser,
  confirmRegentReturnRequestForUser,
  createRegentFundingIntentForUser,
  createRegentReturnRequestForUser,
  getBaseRegentSnapshotForUser,
  getRegentFundingIntentForUser,
  getRegentForUserFromPlatformProjection,
  getRegentManagerForUserFromPlatformProjection,
  getRegentReturnRequestForUser,
  hasRegentInPlatformProjection,
  listRegentsForUserFromPlatformProjection,
  prepareWalletActionForUser,
} from './mobileRegents.js';
import {
  createTerminalSession,
  getTerminalEvents,
  getTerminalSession,
  listTerminalSessions,
  postTerminalMessage,
  resolveTerminalApproval,
} from './mobileTerminal.js';
import {
  createPlatformProjectionClient,
  createPlatformRwrClient,
  type PlatformProjectionClient,
  type PlatformRequestAuth,
  type PlatformRwrClient,
} from './platformProjection.js';

const currentUserId = (userId?: string) => userId || '';

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const returnRequestParamsSchema = z.object({
  id: z.string().min(1),
  returnRequestId: z.string().min(1),
});

const fundingIntentParamsSchema = z.object({
  id: z.string().min(1),
  fundingIntentId: z.string().min(1),
});

const terminalSessionParamsSchema = z.object({
  id: z.string().min(1),
});

const terminalEventsQuerySchema = z.object({
  since_event_id: z.string().min(1).optional(),
});

const terminalApprovalParamsSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
});

const receiptSchema = z.object({
  txHash: z.string().min(1),
  chainId: z.number().int(),
  blockNumber: z.number().int().positive().optional(),
  status: z.literal('confirmed').optional(),
});

const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const decimalValueSchema = z.string().regex(/^\d+$/);
const hexDataSchema = z.string().regex(/^0x([a-fA-F0-9]{2})*$/);

const expectedBaseTransactionSchema = z.object({
  chainId: z.literal(8453),
  expectedSigner: evmAddressSchema,
  to: evmAddressSchema,
  value: decimalValueSchema,
  data: hexDataSchema,
});

export function createMobileRoutes(input?: {
  platformProjectionClient?: PlatformProjectionClient;
  platformRwrClient?: PlatformRwrClient;
}) {
  const router = Router();
  const platformProjectionClient = input?.platformProjectionClient || createPlatformProjectionClient();
  const platformRwrClient = input?.platformRwrClient || createPlatformRwrClient();

  function platformAuth(req: Request): PlatformRequestAuth {
    return {
      authorization: req.header('Authorization'),
      cookie: req.header('Cookie'),
    };
  }

  async function readPlatformProjection(req: Request, res: Response) {
    const projectionResult = await platformProjectionClient.fetchProjection({
      authorization: req.header('Authorization'),
      cookie: req.header('Cookie'),
    });

    if (projectionResult.kind === 'ok') {
      return projectionResult.projection;
    }

    if (projectionResult.kind === 'missing_config') {
      sendError(
        res,
        503,
        'PlatformProjectionMissing',
        `${projectionResult.requiredEnv} is required before mobile Regent state can be loaded from Platform.`
      );
      return null;
    }

    if (projectionResult.kind === 'unauthorized') {
      sendError(res, 401, 'Unauthorized', 'Sign in again before loading your Regents.');
      return null;
    }

    sendError(res, 502, 'PlatformProjectionUnavailable', projectionResult.message);
    return null;
  }

  router.get('/mobile/regents', async (req, res) => {
    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }

    res.json({
      regents: listRegentsForUserFromPlatformProjection(currentUserId(req.userId), projection),
    });
  });

  router.get('/mobile/regents/:id', async (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid agent ID is required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }

    const regent = getRegentForUserFromPlatformProjection(currentUserId(req.userId), parsed.data.id, projection);
    if (!regent) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.json(regent);
  });

  router.get('/mobile/regents/:id/manager', async (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid agent ID is required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }

    const regentManager = getRegentManagerForUserFromPlatformProjection(parsed.data.id, projection);
    if (!regentManager) {
      return sendError(res, 404, 'NotFound', 'That Regent Manager view could not be found.');
    }

    return res.json(regentManager);
  });

  router.post('/mobile/regents/:id/return-requests', async (req, res) => {
    const bodySchema = z.object({
      amount: z.string().min(1),
      currency: z.string().min(1),
      destinationWalletAddress: z.string().min(1),
    }).merge(expectedBaseTransactionSchema);
    const idempotencyKey = req.header('Idempotency-Key')?.trim();

    const parsedParams = agentIdParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID is required.');
    }

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'Amount, currency, and destination wallet address are required.');
    }

    if (!idempotencyKey) {
      return sendError(res, 400, 'BadRequest', 'An idempotency key is required for return requests.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }
    if (!hasRegentInPlatformProjection(parsedParams.data.id, projection)) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    const returnRequest = createRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey
    );
    if (!returnRequest) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ returnRequest });
  });

  router.get('/mobile/regents/:id/return-requests/:returnRequestId', (req, res) => {
    const parsed = returnRequestParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID and return request ID are required.');
    }

    const returnRequest = getRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.returnRequestId
    );
    if (!returnRequest) {
      return sendError(res, 404, 'NotFound', 'That return request could not be found.');
    }

    return res.json({ returnRequest });
  });

  router.post('/mobile/regents/:id/return-requests/:returnRequestId/confirm', async (req, res) => {
    const parsedParams = returnRequestParamsSchema.safeParse(req.params);
    const parsedBody = receiptSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID, return request ID, and chain receipt are required.');
    }

    const verification = await verifyBaseReceipt(parsedBody.data.txHash);
    if (verification.kind === 'missing_rpc') {
      return sendError(res, 503, 'BaseRpcMissing', `${verification.requiredEnv} is required before this receipt can be checked.`);
    }
    if (verification.kind === 'rpc_error') {
      return sendError(res, 502, 'BaseRpcError', verification.message);
    }
    if (verification.kind === 'not_confirmed') {
      return sendError(res, 409, 'ReceiptNotConfirmed', 'The chain receipt is not confirmed for this return yet.');
    }
    if (parsedBody.data.chainId !== verification.receipt.chainId) {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this return.');
    }

    const result = confirmRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.returnRequestId,
      verification.receipt
    );

    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That return request could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this return.');
    }

    return res.json({ returnRequest: result.returnRequest });
  });

  router.post('/mobile/regents/:id/funding-intents', async (req, res) => {
    const bodySchema = z.object({
      amount: z.string().min(1),
      currency: z.string().min(1),
      sourceWalletAddress: evmAddressSchema,
      destinationWalletAddress: evmAddressSchema,
      chainId: z.literal(8453),
      tokenAddress: evmAddressSchema,
      expectedSigner: evmAddressSchema,
      to: evmAddressSchema,
      value: decimalValueSchema,
      data: hexDataSchema,
    }).refine((input) => input.sourceWalletAddress.toLowerCase() === input.expectedSigner.toLowerCase(), {
      path: ['expectedSigner'],
    }).refine((input) => input.tokenAddress.toLowerCase() === input.to.toLowerCase(), {
      path: ['to'],
    });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    const parsedParams = agentIdParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success || !idempotencyKey) {
      return sendError(res, 400, 'BadRequest', 'Funding details and an idempotency key are required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }
    if (!hasRegentInPlatformProjection(parsedParams.data.id, projection)) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    const fundingIntent = createRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey
    );
    if (!fundingIntent) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ fundingIntent });
  });

  router.get('/mobile/regents/:id/funding-intents/:fundingIntentId', (req, res) => {
    const parsed = fundingIntentParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID and funding intent ID are required.');
    }

    const fundingIntent = getRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.fundingIntentId
    );
    if (!fundingIntent) {
      return sendError(res, 404, 'NotFound', 'That funding intent could not be found.');
    }

    return res.json({ fundingIntent });
  });

  router.post('/mobile/regents/:id/funding-intents/:fundingIntentId/confirm', async (req, res) => {
    const parsedParams = fundingIntentParamsSchema.safeParse(req.params);
    const parsedBody = receiptSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID, funding intent ID, and chain receipt are required.');
    }

    const verification = await verifyBaseReceipt(parsedBody.data.txHash);
    if (verification.kind === 'missing_rpc') {
      return sendError(res, 503, 'BaseRpcMissing', `${verification.requiredEnv} is required before this receipt can be checked.`);
    }
    if (verification.kind === 'rpc_error') {
      return sendError(res, 502, 'BaseRpcError', verification.message);
    }
    if (verification.kind === 'not_confirmed') {
      return sendError(res, 409, 'ReceiptNotConfirmed', 'The chain receipt is not confirmed for this funding yet.');
    }
    if (parsedBody.data.chainId !== verification.receipt.chainId) {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this funding.');
    }

    const result = confirmRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.fundingIntentId,
      verification.receipt
    );

    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That funding intent could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this funding.');
    }

    return res.json({ fundingIntent: result.fundingIntent });
  });

  router.get('/mobile/regents/:id/base-snapshot', async (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID is required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }
    if (!hasRegentInPlatformProjection(parsed.data.id, projection)) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    const snapshot = getBaseRegentSnapshotForUser(currentUserId(req.userId), parsed.data.id);
    return res.json({ snapshot });
  });

  router.post('/mobile/wallet-actions/:type/prepare', async (req, res) => {
    const paramsSchema = z.object({
      type: z.enum(['stake', 'claim', 'funding', 'return']),
    });
    const bodySchema = z.object({
      regentId: z.string().min(1),
      amount: z.string().optional(),
      currency: z.string().optional(),
    }).merge(expectedBaseTransactionSchema.omit({ chainId: true }));
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet action and Regent ID are required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }
    if (!hasRegentInPlatformProjection(parsedBody.data.regentId, projection)) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    const action = prepareWalletActionForUser(currentUserId(req.userId), parsedParams.data.type, {
      ...parsedBody.data,
    });
    if (!action) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ action });
  });

  router.post('/mobile/wallet-actions/:actionId/confirm', async (req, res) => {
    const paramsSchema = z.object({ actionId: z.string().min(1) });
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = receiptSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet action and chain receipt are required.');
    }

    const verification = await verifyBaseReceipt(parsedBody.data.txHash);
    if (verification.kind === 'missing_rpc') {
      return sendError(res, 503, 'BaseRpcMissing', `${verification.requiredEnv} is required before this receipt can be checked.`);
    }
    if (verification.kind === 'rpc_error') {
      return sendError(res, 502, 'BaseRpcError', verification.message);
    }
    if (verification.kind === 'not_confirmed') {
      return sendError(res, 409, 'ReceiptNotConfirmed', 'The chain receipt is not confirmed for this action yet.');
    }
    if (parsedBody.data.chainId !== verification.receipt.chainId) {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this action.');
    }

    const result = confirmPreparedWalletActionForUser(parsedParams.data.actionId, verification.receipt);
    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That wallet action could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this action.');
    }

    return res.json({ action: result.action });
  });

  function sendPlatformResult<T>(res: Response, result: Awaited<ReturnType<PlatformRwrClient['fetchAccount']>> | { kind: 'ok'; data: T } | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' } | { kind: 'unauthorized' } | { kind: 'not_found' } | { kind: 'conflict' } | { kind: 'upstream_error'; message: string }, render: (data: T) => unknown) {
    if (result.kind === 'ok') {
      return res.json(render(result.data as T));
    }

    if (result.kind === 'missing_config') {
      return sendError(res, 503, 'PlatformRwrMissing', `${result.requiredEnv} is required before Talk records can be loaded from Platform.`);
    }

    if (result.kind === 'unauthorized') {
      return sendError(res, 401, 'Unauthorized', 'Sign in again before loading Talk.');
    }

    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That Talk record could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ApprovalClosed', 'That review step is no longer open.');
    }

    return sendError(res, 502, 'PlatformRwrUnavailable', result.message);
  }

  router.get('/mobile/terminal/sessions', async (req, res) => {
    const result = await listTerminalSessions(platformRwrClient, platformAuth(req));
    return sendPlatformResult(res, result, (sessions) => ({ sessions }));
  });

  router.post('/mobile/terminal/sessions', async (req, res) => {
    const bodySchema = z.object({
      agentId: z.string().min(1),
      agentName: z.string().min(1),
    });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'An agent ID and agent name are required.');
    }

    const result = await createTerminalSession(platformRwrClient, platformAuth(req), parsedBody.data);
    if (result.kind === 'ok') {
      return res.status(201).json({ session: result.data });
    }

    return sendPlatformResult(res, result, (session) => ({ session }));
  });

  router.get('/mobile/terminal/sessions/:id', async (req, res) => {
    const parsed = terminalSessionParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid session ID is required.');
    }

    const result = await getTerminalSession(platformRwrClient, platformAuth(req), parsed.data.id);
    return sendPlatformResult(res, result, (session) => ({ session }));
  });

  router.get('/mobile/terminal/sessions/:id/events', async (req, res) => {
    const parsed = terminalSessionParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid session ID is required.');
    }

    const parsedQuery = terminalEventsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return sendError(res, 400, 'BadRequest', 'A valid event marker is required.');
    }

    const result = await getTerminalEvents(
      platformRwrClient,
      platformAuth(req),
      parsed.data.id,
      parsedQuery.data.since_event_id
    );
    return sendPlatformResult(res, result, (events) => ({
      events,
      latestEventId: events.at(-1)?.eventId || parsedQuery.data.since_event_id || '',
    }));
  });

  router.post('/mobile/terminal/sessions/:id/messages', async (req, res) => {
    const bodySchema = z.object({
      text: z.string().min(1),
    });
    const parsedParams = terminalSessionParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid session ID and message are required.');
    }

    const result = await postTerminalMessage(platformRwrClient, platformAuth(req), parsedParams.data.id, parsedBody.data.text);
    if (result.kind === 'ok') {
      return res.status(202).json({ session: result.data });
    }

    return sendPlatformResult(res, result, (session) => ({ session }));
  });

  router.post('/mobile/terminal/sessions/:id/approvals/:requestId', async (req, res) => {
    const bodySchema = z.object({
      decision: z.enum(['approved', 'denied']),
    });
    const parsedParams = terminalApprovalParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid session ID, request ID, and decision are required.');
    }

    const result = await resolveTerminalApproval(
      platformRwrClient,
      platformAuth(req),
      parsedParams.data.id,
      parsedParams.data.requestId,
      parsedBody.data.decision
    );
    return sendPlatformResult(res, result, (session) => ({ session }));
  });

  return router;
}
