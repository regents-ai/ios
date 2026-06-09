import { Router, type Request, type Response } from 'express';
import { decodeFunctionData, parseUnits, type Hex } from 'viem';
import { z } from 'zod';

import { verifyBaseReceipt } from './baseReceiptVerification.js';
import { sendError } from './httpResponses.js';
import {
  createMessageContactClient,
  type MessageContactClient,
  type MessageContactSuggestion,
} from './messageContacts.js';
import {
  getAgentXmtpIdentityForUser,
  linkXmtpConversationToThread,
  listPhoneXmtpIdentitiesForContacts,
  listMessageThreadsForUser,
  messageThreadFromTerminalSession,
  registerPhoneXmtpIdentityForUser,
} from './mobileMessages.js';
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
  createPlatformStakingClient,
  type PlatformProjectionClient,
  type PlatformRequestAuth,
  type PlatformRwrClient,
  type PlatformRwrClientResult,
  type PlatformStakingClient,
} from './platformProjection.js';
import { createMobileVoiceRoutes } from './routes/mobileVoice.js';
import { createHermesVoiceClient, type HermesVoiceClient } from './services/hermesVoiceClient.js';

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

const terminalSessionParamsSchema = z.object({
  id: z.string().min(1),
});

const terminalEventsQuerySchema = z.object({
  since_event_id: z.string().min(1).optional(),
});

const terminalApprovalParamsSchema = z.object({
  id: z.string().min(1),
  request_id: z.string().min(1),
});

const messageThreadParamsSchema = z.object({
  thread_id: z.string().min(1),
});

const recentMessageContactsQuerySchema = z.object({
  addressOrName: z.string().trim().min(1),
});

const agentXmtpParamsSchema = z.object({
  agent_id: z.string().min(1),
});

const xmtpConversationKindSchema = z.enum(['dm', 'group']);
const xmtpEnvironmentSchema = z.enum(['dev', 'production']);

const registerPhoneXmtpIdentityBodySchema = z.object({
  inboxId: z.string().min(1),
  installationId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  environment: xmtpEnvironmentSchema,
});

const linkXmtpConversationBodySchema = z.object({
  conversationId: z.string().min(1),
  conversationKind: xmtpConversationKindSchema,
  environment: xmtpEnvironmentSchema,
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

export function createMobileRoutes(input?: {
  platformProjectionClient?: PlatformProjectionClient;
  platformRwrClient?: PlatformRwrClient;
  platformStakingClient?: PlatformStakingClient;
  messageContactClient?: MessageContactClient;
  hermesVoiceClient?: HermesVoiceClient;
}) {
  const router = Router();
  const platformProjectionClient = input?.platformProjectionClient || createPlatformProjectionClient();
  const platformRwrClient = input?.platformRwrClient || createPlatformRwrClient();
  const platformStakingClient = input?.platformStakingClient || createPlatformStakingClient();
  const messageContactClient = input?.messageContactClient || createMessageContactClient();
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

  router.get('/mobile/regents/:id/base-snapshot', async (req, res) => {
    const parsed = agentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID is required.');
    }

    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }

    const snapshot = getRegentBaseSnapshotForUserFromPlatformProjection(
      currentUserId(req.userId),
      parsed.data.id,
      projection,
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

    const returnRequest = createRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey,
    );
    if (!returnRequest) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ returnRequest });
  });

  router.get('/mobile/regents/:id/return-requests/:return_request_id', (req, res) => {
    const parsed = returnRequestParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID and return request ID are required.');
    }

    const returnRequest = getRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.return_request_id,
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

    const result = confirmRegentReturnRequestForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.return_request_id,
      verification.receipt,
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
    const regent = getRegentForUserFromPlatformProjection(
      currentUserId(req.userId),
      parsedParams.data.id,
      projection,
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

    const fundingIntent = createRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedBody.data,
      idempotencyKey,
    );
    if (!fundingIntent) {
      return sendError(res, 404, 'NotFound', 'That Regent could not be found.');
    }

    return res.status(201).json({ fundingIntent });
  });

  router.get('/mobile/regents/:id/funding-intents/:funding_intent_id', (req, res) => {
    const parsed = fundingIntentParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Regent ID and funding intent ID are required.');
    }

    const fundingIntent = getRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsed.data.id,
      parsed.data.funding_intent_id,
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

    const result = confirmRegentFundingIntentForUser(
      currentUserId(req.userId),
      parsedParams.data.id,
      parsedParams.data.funding_intent_id,
      verification.receipt,
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

    const action = prepareWalletActionForUser(currentUserId(req.userId), parsedParams.data.type, {
      ...parsedBody.data,
      idempotencyKey,
    });
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

    const result = confirmPreparedWalletActionForUser(parsedParams.data.action_id, verification.receipt);
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
        `${result.requiredEnv} is required before Talk records can be loaded from Platform.`,
      );
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
      parsedQuery.data.since_event_id,
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

    const result = await postTerminalMessage(
      platformRwrClient,
      platformAuth(req),
      parsedParams.data.id,
      parsedBody.data.text,
    );
    if (result.kind === 'ok') {
      return res.status(202).json({ session: result.data });
    }

    return sendPlatformResult(res, result, (session) => ({ session }));
  });

  router.post('/mobile/terminal/sessions/:id/approvals/:request_id', async (req, res) => {
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
      parsedParams.data.request_id,
      parsedBody.data.decision,
    );
    return sendPlatformResult(res, result, (session) => ({ session }));
  });

  router.use(createMobileVoiceRoutes({
    platformProjectionClient,
    hermesVoiceClient,
  }));

  router.get('/mobile/message/threads', async (req, res) => {
    const result = await listTerminalSessions(platformRwrClient, platformAuth(req));
    return sendPlatformResult(res, result, (sessions) => ({
      threads: listMessageThreadsForUser(currentUserId(req.userId), sessions),
    }));
  });

  router.get('/mobile/message/contacts/recent-addresses', async (req, res) => {
    const parsedQuery = recentMessageContactsQuerySchema.safeParse({
      addressOrName: queryValue(req, 'addressOrName'),
    });
    if (!parsedQuery.success) {
      return sendError(res, 400, 'BadRequest', 'Enter an Ethereum address or ENS name.');
    }

    const result = await messageContactClient.lookupRecentEnsContacts(parsedQuery.data.addressOrName);
    if (result.kind === 'ok') {
      return res.json({
        target: result.target,
        contacts: result.contacts,
      });
    }

    if (result.kind === 'bad_request') {
      return sendError(res, 400, 'BadRequest', result.message);
    }

    if (result.kind === 'missing_config') {
      return sendError(
        res,
        503,
        'RecentContactsMissing',
        'Recent address lookup is not ready yet.',
      );
    }

    return sendError(res, 502, 'RecentContactsUnavailable', result.message);
  });

  router.get('/mobile/message/contacts/regent-users', async (req, res) => {
    const projection = await readPlatformProjection(req, res);
    if (!projection) {
      return;
    }

    const userId = currentUserId(req.userId);
    const agentContacts: MessageContactSuggestion[] = listRegentsForUserFromPlatformProjection(userId, projection)
      .filter(
        (regent) =>
          evmAddressSchema.safeParse(regent.walletAddress).success &&
          !sameAddress(regent.walletAddress, '0x0000000000000000000000000000000000000000'),
      )
      .map((regent) => ({
        id: `agent:${regent.id}`,
        kind: 'regent_agent',
        label: regent.name,
        address: regent.walletAddress,
        detail: 'Agent',
        agentId: regent.id,
      }));

    const seenHumanAddresses = new Set<string>();
    const humanContacts: MessageContactSuggestion[] = listPhoneXmtpIdentitiesForContacts().flatMap((entry) => {
      if (!evmAddressSchema.safeParse(entry.identity.walletAddress).success) {
        return [];
      }

      const normalizedAddress = entry.identity.walletAddress.toLowerCase();
      if (seenHumanAddresses.has(normalizedAddress)) {
        return [];
      }

      seenHumanAddresses.add(normalizedAddress);
      return [{
        id: `human:${normalizedAddress}`,
        kind: 'regent_human',
        label: entry.userId === userId ? 'You' : 'Regent user',
        address: entry.identity.walletAddress,
        detail: entry.userId === userId ? 'Your Regent address' : 'Regent app user',
      }];
    });

    return res.json({ contacts: [...agentContacts, ...humanContacts] });
  });

  router.post('/mobile/message/xmtp/phone-identities', (req, res) => {
    const parsedBody = registerPhoneXmtpIdentityBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'Valid message identity details are required.');
    }

    return res.json({
      identity: registerPhoneXmtpIdentityForUser(currentUserId(req.userId), parsedBody.data),
    });
  });

  router.get('/mobile/message/xmtp/agents/:agent_id', (req, res) => {
    const parsedParams = agentXmtpParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return sendError(res, 400, 'BadRequest', 'A valid agent ID is required.');
    }

    const identity = getAgentXmtpIdentityForUser(currentUserId(req.userId), parsedParams.data.agent_id);
    if (!identity) {
      return sendError(res, 404, 'NotFound', 'That agent message address could not be found.');
    }

    return res.json({ identity });
  });

  router.post('/mobile/message/threads/:thread_id/xmtp-links', async (req, res) => {
    const parsedParams = messageThreadParamsSchema.safeParse(req.params);
    const parsedBody = linkXmtpConversationBodySchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid message thread and conversation are required.');
    }

    const sessionResult = await getTerminalSession(platformRwrClient, platformAuth(req), parsedParams.data.thread_id);
    if (sessionResult.kind !== 'ok') {
      return sendPlatformResult(res, sessionResult, () => ({ thread: null }));
    }

    const linkResult = linkXmtpConversationToThread(currentUserId(req.userId), parsedParams.data.thread_id, parsedBody.data);
    if (linkResult.kind === 'conflict') {
      return sendError(res, 409, 'ConversationLinked', 'That secure conversation is already connected to another message thread.');
    }

    return res.json({
      thread: messageThreadFromTerminalSession(currentUserId(req.userId), sessionResult.data),
    });
  });

  return router;
}
