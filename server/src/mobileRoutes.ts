import { Router, type Request, type Response } from 'express';
import { decodeFunctionData, parseUnits, type Hex } from 'viem';
import { z } from 'zod';

import { verifyBaseReceipt } from './baseReceiptVerification.js';
import { sendError } from './httpResponses.js';
import {
  confirmPreparedWalletActionForUser,
  confirmRegentFundingIntentForUser,
  confirmRegentReturnRequestForUser,
  createRegentFundingIntentForUser,
  createRegentReturnRequestForUser,
  getRegentBaseSnapshotForUserFromPlatformProjection,
  getRegentFundingIntentForUser,
  getRegentForUserFromPlatformProjection,
  getRegentManagerForUserFromPlatformProjection,
  getRegentReturnRequestForUser,
  hasRegentInPlatformProjection,
  listRegentsForUserFromPlatformProjection,
  prepareWalletActionForUser,
} from './mobileRegents.js';
import {
  createMessageThread,
  getMessageThreadEvents,
  getMessageThread,
  listMessageThreads,
  postMessageThreadMessage,
  resolveMessageThreadApproval,
} from './mobileMessageThreads.js';
import {
  createPlatformAgentLinkClient,
  createPlatformProjectionClient,
  createPlatformRwrClient,
  createPlatformStakingClient,
  type PlatformAgentLinkClient,
  type PlatformProjectionClient,
  type PlatformRequestAuth,
  type PlatformRwrClient,
  type PlatformRwrClientResult,
  type PlatformStakingClient,
} from './platformProjection.js';
import { createMobileVoiceRoutes } from './routes/mobileVoice.js';
import { createHermesVoiceClient, type HermesVoiceClient } from './services/hermesVoiceClient.js';
import type { SharedStateRedis } from './sharedStateStore.js';

const currentUserId = (userId?: string) => userId || '';

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const returnRequestParamsSchema = z.object({
  id: z.string().min(1),
  return_request_id: z.string().min(1),
});

const fundingIntentParamsSchema = z.object({
  id: z.string().min(1),
  funding_intent_id: z.string().min(1),
});

const messageThreadParamsSchema = z.object({
  thread_id: z.string().min(1),
});

const messageThreadEventsQuerySchema = z.object({
  since_event_id: z.string().min(1).optional(),
});

const messageThreadApprovalParamsSchema = z.object({
  thread_id: z.string().min(1),
  approval_id: z.string().min(1),
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
const erc20TransferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const expectedBaseTransactionSchema = z.object({
  chainId: z.literal(8453),
  expectedSigner: evmAddressSchema,
  to: evmAddressSchema,
  value: decimalValueSchema,
  data: hexDataSchema,
});

const stakingWalletBodySchema = z.object({
  walletAddress: evmAddressSchema,
});

function sameAddress(first: string, second: string) {
  return first.toLowerCase() === second.toLowerCase();
}

function zeroAddress(value: string) {
  return sameAddress(value, '0x0000000000000000000000000000000000000000');
}

function fundingTransferMatchesIntent(input: {
  amount: string;
  destinationWalletAddress: string;
  tokenDecimals: number;
  value: string;
  data: string;
}) {
  try {
    const decoded = decodeFunctionData({
      abi: erc20TransferAbi,
      data: input.data as Hex,
    });

    const [recipient, amount] = decoded.args;

    return (
      decoded.functionName === 'transfer' &&
      sameAddress(recipient, input.destinationWalletAddress) &&
      amount === parseUnits(input.amount, input.tokenDecimals) &&
      input.value === '0'
    );
  } catch {
    return false;
  }
}

const stakingAmountBodySchema = stakingWalletBodySchema.extend({
  amount: z.string().min(1),
});

const stakingStakeBodySchema = stakingAmountBodySchema.extend({
  receiver: z.string().min(1).optional(),
});

const agentLinkClaimBodySchema = z.object({
  code: z.string().min(1),
});

export function createMobileRoutes(input?: {
  platformProjectionClient?: PlatformProjectionClient;
  platformRwrClient?: PlatformRwrClient;
  platformStakingClient?: PlatformStakingClient;
  platformAgentLinkClient?: PlatformAgentLinkClient;
  hermesVoiceClient?: HermesVoiceClient;
  redis?: SharedStateRedis | null;
}) {
  const router = Router();
  const redis = input?.redis || null;
  const platformProjectionClient = input?.platformProjectionClient || createPlatformProjectionClient();
  const platformRwrClient = input?.platformRwrClient || createPlatformRwrClient();
  const platformStakingClient = input?.platformStakingClient || createPlatformStakingClient();
  const platformAgentLinkClient = input?.platformAgentLinkClient || createPlatformAgentLinkClient();
  const hermesVoiceClient = input?.hermesVoiceClient || createHermesVoiceClient();

  function platformAuth(req: Request): PlatformRequestAuth {
    return {
      authorization: req.header('Authorization'),
    };
  }

  function queryValue(req: Request, name: string) {
    const rawValue = req.query[name];
    if (typeof rawValue === 'string') {
      return rawValue;
    }

    const requestUrl = req.originalUrl || req.url;
    return new URL(requestUrl, 'http://localhost').searchParams.get(name) || undefined;
  }

  async function readPlatformProjection(req: Request, res: Response) {
    const projectionResult = await platformProjectionClient.fetchProjection({
      authorization: req.header('Authorization'),
    });

    if (projectionResult.kind === 'ok') {
      return projectionResult.projection;
    }

    if (projectionResult.kind === 'missing_config') {
      sendError(
        res,
        503,
        'PlatformProjectionMissing',
        `${projectionResult.requiredEnv} is required before mobile Regent state can be loaded from Platform.`,
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
      regents: await listRegentsForUserFromPlatformProjection(currentUserId(req.userId), projection, redis),
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

    const regent = await getRegentForUserFromPlatformProjection(currentUserId(req.userId), parsed.data.id, projection, redis);
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

  router.get('/mobile/regents/:id/base-snapshot', async (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID is required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }

    const snapshot = await getRegentBaseSnapshotForUserFromPlatformProjection(
      currentUserId(req.userId),
      parsed.data.id,
      projection,
      redis,
    );
    if (!snapshot) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.json(snapshot);
  });

  router.post('/mobile/regents/:id/return-requests', async (req, res) => {
    const bodySchema = z
      .object({
        amount: z.string().min(1),
        currency: z.string().min(1),
        destinationWalletAddress: evmAddressSchema,
      })
      .merge(expectedBaseTransactionSchema)
      .refine((body) => body.destinationWalletAddress.toLowerCase() === body.to.toLowerCase(), {
        path: ['destinationWalletAddress'],
      });
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

    const returnRequest = await createRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey,
      redis,
    );
    if (!returnRequest) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ returnRequest });
  });

  router.get('/mobile/regents/:id/return-requests/:return_request_id', async (req, res) => {
    const parsed = returnRequestParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID and return request ID are required.');
    }

    const returnRequest = await getRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.return_request_id,
      redis,
    );
    if (!returnRequest) {
      return sendError(res, 404, 'NotFound', 'That return request could not be found.');
    }

    return res.json({ returnRequest });
  });

  router.post('/mobile/regents/:id/return-requests/:return_request_id/confirm', async (req, res) => {
    const parsedParams = returnRequestParamsSchema.safeParse(req.params);
    const parsedBody = receiptSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID, return request ID, and chain receipt are required.');
    }

    const verification = await verifyBaseReceipt(parsedBody.data.txHash);
    if (verification.kind === 'missing_rpc') {
      return sendError(
        res,
        503,
        'BaseRpcMissing',
        `${verification.requiredEnv} is required before this receipt can be checked.`,
      );
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

    const result = await confirmRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.return_request_id,
      verification.receipt,
      redis,
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
    const bodySchema = z
      .object({
        amount: z.string().min(1),
        currency: z.string().min(1),
        sourceWalletAddress: evmAddressSchema,
        destinationWalletAddress: evmAddressSchema,
        chainId: z.literal(8453),
        tokenAddress: evmAddressSchema,
        tokenDecimals: z.number().int().min(0).max(255),
        expectedSigner: evmAddressSchema,
        to: evmAddressSchema,
        value: decimalValueSchema,
        data: hexDataSchema,
      })
      .refine((input) => input.sourceWalletAddress.toLowerCase() === input.expectedSigner.toLowerCase(), {
        path: ['expectedSigner'],
      })
      .refine((input) => input.tokenAddress.toLowerCase() === input.to.toLowerCase(), {
        path: ['to'],
      });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    const parsedParams = agentIdParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success || !idempotencyKey) {
      return sendError(res, 400, 'BadRequest', 'Funding details and an idempotency key are required.');
    }

    if (!fundingTransferMatchesIntent(parsedBody.data)) {
      return sendError(res, 400, 'BadRequest', 'Funding transaction details must match the recipient and amount.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }
    const regent = await getRegentForUserFromPlatformProjection(
      currentUserId(req.userId),
      parsedParams.data.id,
      projection,
      redis,
    );
    if (!regent) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }
    if (zeroAddress(regent.walletAddress)) {
      return sendError(res, 409, 'RegentFundingUnavailable', 'That Regent wallet is not ready for funding.');
    }
    if (!sameAddress(regent.walletAddress, parsedBody.data.destinationWalletAddress)) {
      return sendError(res, 400, 'BadRequest', 'Funding destination must match this Regent wallet.');
    }

    const fundingIntent = await createRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey,
      redis,
    );
    if (!fundingIntent) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ fundingIntent });
  });

  router.get('/mobile/regents/:id/funding-intents/:funding_intent_id', async (req, res) => {
    const parsed = fundingIntentParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID and funding intent ID are required.');
    }

    const fundingIntent = await getRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.funding_intent_id,
      redis,
    );
    if (!fundingIntent) {
      return sendError(res, 404, 'NotFound', 'That funding intent could not be found.');
    }

    return res.json({ fundingIntent });
  });

  router.post('/mobile/regents/:id/funding-intents/:funding_intent_id/confirm', async (req, res) => {
    const parsedParams = fundingIntentParamsSchema.safeParse(req.params);
    const parsedBody = receiptSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID, funding intent ID, and chain receipt are required.');
    }

    const verification = await verifyBaseReceipt(parsedBody.data.txHash);
    if (verification.kind === 'missing_rpc') {
      return sendError(
        res,
        503,
        'BaseRpcMissing',
        `${verification.requiredEnv} is required before this receipt can be checked.`,
      );
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

    const result = await confirmRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.funding_intent_id,
      verification.receipt,
      redis,
    );

    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That funding intent could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this funding.');
    }

    return res.json({ fundingIntent: result.fundingIntent });
  });

  function sendPlatformStakingResult<T>(
    res: Response,
    result: PlatformRwrClientResult<T>,
    render: (data: T) => unknown,
  ) {
    if (result.kind === 'ok') {
      return res.json(render(result.data));
    }

    if (result.kind === 'missing_config') {
      return sendError(
        res,
        503,
        'PlatformStakingMissing',
        `${result.requiredEnv} is required before staking can be loaded.`,
      );
    }

    if (result.kind === 'unauthorized') {
      return sendError(res, 401, 'Unauthorized', 'Sign in again before loading staking.');
    }

    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'Staking could not be found.');
    }

    return sendError(res, 502, 'PlatformStakingUnavailable', result.message);
  }

  router.get('/mobile/regent/staking', async (req, res) => {
    const parsed = stakingWalletBodySchema.safeParse({
      walletAddress: queryValue(req, 'walletAddress'),
    });

    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet address is required.');
    }

    const result = await platformStakingClient.fetchStaking(platformAuth(req), parsed.data.walletAddress);
    return sendPlatformStakingResult(res, result, (data) => data);
  });

  router.post('/mobile/regent/staking/stake', async (req, res) => {
    const parsed = stakingStakeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A wallet address and amount are required.');
    }

    const result = await platformStakingClient.stake(platformAuth(req), parsed.data);
    return sendPlatformStakingResult(res, result, (data) => data);
  });

  router.post('/mobile/regent/staking/unstake', async (req, res) => {
    const parsed = stakingAmountBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A wallet address and amount are required.');
    }

    const result = await platformStakingClient.unstake(platformAuth(req), parsed.data);
    return sendPlatformStakingResult(res, result, (data) => data);
  });

  router.post('/mobile/regent/staking/claim-usdc', async (req, res) => {
    const parsed = stakingWalletBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet address is required.');
    }

    const result = await platformStakingClient.claimUsdc(platformAuth(req), parsed.data.walletAddress);
    return sendPlatformStakingResult(res, result, (data) => data);
  });

  router.post('/mobile/regent/staking/claim-regent', async (req, res) => {
    const parsed = stakingWalletBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet address is required.');
    }

    const result = await platformStakingClient.claimRegent(platformAuth(req), parsed.data.walletAddress);
    return sendPlatformStakingResult(res, result, (data) => data);
  });

  router.post('/mobile/regent/staking/claim-and-restake-regent', async (req, res) => {
    const parsed = stakingWalletBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet address is required.');
    }

    const result = await platformStakingClient.claimAndRestakeRegent(platformAuth(req), parsed.data.walletAddress);
    return sendPlatformStakingResult(res, result, (data) => data);
  });

  router.post('/mobile/agent-links/claim', async (req, res) => {
    const parsed = agentLinkClaimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A pairing code is required to connect your agent.');
    }

    const result = await platformAgentLinkClient.claim(platformAuth(req), parsed.data.code);

    if (result.kind === 'ok') {
      return res.status(201).json(result.data);
    }

    if (result.kind === 'missing_config') {
      return sendError(
        res,
        503,
        'PlatformAgentLinkMissing',
        `${result.requiredEnv} is required before agents can be connected.`,
      );
    }

    if (result.kind === 'unauthorized') {
      return sendError(res, 401, 'Unauthorized', 'Sign in again before connecting your agent.');
    }

    if (result.kind === 'not_found') {
      return sendError(
        res,
        404,
        'AgentLinkNotFound',
        "That code wasn't recognized. Generate a fresh one on your agent and scan it again.",
      );
    }

    // Expired code or agent already connected elsewhere: Platform's message
    // is already written for the person — relay it verbatim.
    if (result.kind === 'conflict') {
      return sendError(res, 409, 'AgentLinkConflict', result.message);
    }

    return sendError(res, 502, 'PlatformAgentLinkUnavailable', result.message);
  });

  router.post('/mobile/wallet-actions/:type/prepare', async (req, res) => {
    const paramsSchema = z.object({
      type: z.enum(['funding', 'return']),
    });
    const bodySchema = z
      .object({
        regentId: z.string().min(1),
        amount: z.string().optional(),
        currency: z.string().optional(),
        riskCopy: z
          .string()
          .min(1)
          .max(200)
          .transform((value) =>
            value
              // Strip markup tags and control characters before the copy is
              // stored and echoed into audit logs.
              .replace(/<[^>]*>/g, ' ')
              .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
          .refine((value) => value.length > 0),
      })
      .merge(expectedBaseTransactionSchema.omit({ chainId: true }));
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);
    const idempotencyKey = req.header('Idempotency-Key')?.trim();

    if (!parsedParams.success || !parsedBody.success || !idempotencyKey) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet action, Regent ID, and idempotency key are required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }
    if (!hasRegentInPlatformProjection(parsedBody.data.regentId, projection)) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    const action = await prepareWalletActionForUser(currentUserId(req.userId), parsedParams.data.type, {
      ...parsedBody.data,
      idempotencyKey,
    }, redis);
    if (!action) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ wallet_action: action });
  });

  router.post('/mobile/wallet-actions/:action_id/confirm', async (req, res) => {
    const paramsSchema = z.object({ action_id: z.string().min(1) });
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = receiptSchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet action and chain receipt are required.');
    }

    const verification = await verifyBaseReceipt(parsedBody.data.txHash);
    if (verification.kind === 'missing_rpc') {
      return sendError(
        res,
        503,
        'BaseRpcMissing',
        `${verification.requiredEnv} is required before this receipt can be checked.`,
      );
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

    const result = await confirmPreparedWalletActionForUser(
      parsedParams.data.action_id,
      verification.receipt,
      new Date(),
      redis,
    );
    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That wallet action could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ReceiptMismatch', 'The chain receipt does not match this action.');
    }

    if (result.kind === 'expired') {
      return sendError(
        res,
        410,
        'WalletActionExpired',
        'This wallet action has expired. Start it again before signing.',
      );
    }

    return res.json({ wallet_action: result.action });
  });

  function sendPlatformResult<T>(
    res: Response,
    result:
      | Awaited<ReturnType<PlatformRwrClient['fetchAccount']>>
      | { kind: 'ok'; data: T }
      | { kind: 'bad_request' }
      | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
      | { kind: 'unauthorized' }
      | { kind: 'not_found' }
      | { kind: 'conflict' }
      | { kind: 'upstream_error'; message: string },
    render: (data: T) => unknown,
  ) {
    if (result.kind === 'ok') {
      return res.json(render(result.data as T));
    }

    if (result.kind === 'missing_config') {
      return sendError(
        res,
        503,
        'PlatformRwrMissing',
        `${result.requiredEnv} is required before messages can be loaded from Platform.`,
      );
    }

    if (result.kind === 'unauthorized') {
      return sendError(res, 401, 'Unauthorized', 'Sign in again before loading messages.');
    }

    if (result.kind === 'bad_request') {
      return sendError(res, 400, 'BadRequest', 'A valid message thread ID is required.');
    }

    if (result.kind === 'not_found') {
      return sendError(res, 404, 'NotFound', 'That message thread could not be found.');
    }

    if (result.kind === 'conflict') {
      return sendError(res, 409, 'ApprovalClosed', 'That review step is no longer open.');
    }

    return sendError(res, 502, 'PlatformRwrUnavailable', result.message);
  }

  router.get('/mobile/message/threads', async (req, res) => {
    const result = await listMessageThreads(platformRwrClient, platformAuth(req));
    return sendPlatformResult(res, result, (threads) => ({ threads }));
  });

  router.post('/mobile/message/threads', async (req, res) => {
    const bodySchema = z.object({
      agentId: z.string().min(1),
      agentName: z.string().min(1),
    });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'An agent ID and agent name are required.');
    }

    const result = await createMessageThread(platformRwrClient, platformAuth(req), parsedBody.data);
    if (result.kind === 'ok') {
      return res.status(201).json({ thread: result.data });
    }

    return sendPlatformResult(res, result, (thread) => ({ thread }));
  });

  router.get('/mobile/message/threads/:thread_id', async (req, res) => {
    const parsed = messageThreadParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid message thread ID is required.');
    }

    const result = await getMessageThread(platformRwrClient, platformAuth(req), parsed.data.thread_id);
    return sendPlatformResult(res, result, (thread) => ({ thread }));
  });

  router.get('/mobile/message/threads/:thread_id/events', async (req, res) => {
    const parsed = messageThreadParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid message thread ID is required.');
    }

    const parsedQuery = messageThreadEventsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return sendError(res, 400, 'BadRequest', 'A valid event marker is required.');
    }

    const result = await getMessageThreadEvents(
      platformRwrClient,
      platformAuth(req),
      parsed.data.thread_id,
      parsedQuery.data.since_event_id,
    );
    return sendPlatformResult(res, result, (events) => ({
      events,
      latestEventId: events.at(-1)?.eventId || parsedQuery.data.since_event_id || '',
    }));
  });

  router.post('/mobile/message/threads/:thread_id/messages', async (req, res) => {
    const bodySchema = z.object({
      text: z.string().min(1),
      source: z.enum(['text', 'voice_summary']).optional(),
    });
    const parsedParams = messageThreadParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid message thread ID and message are required.');
    }

    const result = await postMessageThreadMessage(
      platformRwrClient,
      platformAuth(req),
      parsedParams.data.thread_id,
      parsedBody.data.text,
      parsedBody.data.source || 'text',
    );
    if (result.kind === 'ok') {
      return res.status(202).json({ thread: result.data });
    }

    return sendPlatformResult(res, result, (thread) => ({ thread }));
  });

  router.post('/mobile/message/threads/:thread_id/approvals/:approval_id', async (req, res) => {
    const bodySchema = z.object({
      decision: z.enum(['approved', 'denied']),
    });
    const parsedParams = messageThreadApprovalParamsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid message thread ID, approval ID, and decision are required.');
    }

    const result = await resolveMessageThreadApproval(
      platformRwrClient,
      platformAuth(req),
      parsedParams.data.thread_id,
      parsedParams.data.approval_id,
      parsedBody.data.decision,
    );
    return sendPlatformResult(res, result, (thread) => ({ thread }));
  });

  router.use(createMobileVoiceRoutes({
    platformProjectionClient,
    hermesVoiceClient,
    redis,
  }));

  return router;
}
