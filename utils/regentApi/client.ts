import { getBaseUrl } from '@/constants/BASE_URL';
import {
  MessageThread,
  MessageThreadDetail,
  MessageThreadEvent,
  PreparedWalletAction,
  RegentDetail,
  RegentFundingIntent,
  RegentManagerDetail,
  RegentReturnRequest,
  RegentStakingActionResponse,
  RegentStakingState,
  RegentSummary,
} from '@/types/regents';
import { ApiError, apiFailureKindForStatus, privacySafeLogCategory } from '@/utils/apiError';
import { authenticatedFetch } from '@/utils/authenticatedFetch';
import {
  normalizeMessageThread,
  normalizeMessageThreadEvents,
  normalizeRegentDetail,
  normalizeRegentSummary,
  normalizeReturnRequest,
} from '@/utils/regentApi/tolerantDecode';
import { createHermesVoiceApi, type MobileHermesVoicePath } from '@/utils/regentApi/voice';

const mobileRegentsPath = '/mobile/regents';
const mobileRegentStakingPath = '/mobile/regent/staking';
const mobileMessageThreadsPath = '/mobile/message/threads';
const mobileAgentLinkClaimPath = '/mobile/agent-links/claim';
const mobilePortalPairingPath = '/mobile/portal-pairing';
const mobilePortalPairingStartPath = '/mobile/portal-pairing/start';
const mobilePortalPairingCompletePath = '/mobile/portal-pairing/complete';

export type PortalPairingStatus = {
  paired: boolean;
  accountLabel: string | null;
  pairedAt: string | null;
};

type MobileRegentPath =
  | typeof mobileRegentsPath
  | `${typeof mobileRegentsPath}/${string}`
  | `${typeof mobileRegentsPath}/${string}/manager`
  | `${typeof mobileRegentsPath}/${string}/return-requests`
  | `${typeof mobileRegentsPath}/${string}/return-requests/${string}`
  | `${typeof mobileRegentsPath}/${string}/return-requests/${string}/confirm`
  | `${typeof mobileRegentsPath}/${string}/funding-intents`
  | `${typeof mobileRegentsPath}/${string}/funding-intents/${string}`
  | `${typeof mobileRegentsPath}/${string}/funding-intents/${string}/confirm`;

type MobileRegentStakingPath =
  | typeof mobileRegentStakingPath
  | `${typeof mobileRegentStakingPath}?walletAddress=${string}`
  | `${typeof mobileRegentStakingPath}/stake`
  | `${typeof mobileRegentStakingPath}/unstake`
  | `${typeof mobileRegentStakingPath}/claim-usdc`
  | `${typeof mobileRegentStakingPath}/claim-regent`
  | `${typeof mobileRegentStakingPath}/claim-and-restake-regent`;

type MobileWalletActionPath =
  | `/mobile/wallet-actions/${PreparedWalletAction['action']}/prepare`
  | `/mobile/wallet-actions/${string}/confirm`;

type MobileMessagePath =
  | typeof mobileMessageThreadsPath
  | `${typeof mobileMessageThreadsPath}/${string}`
  | `${typeof mobileMessageThreadsPath}/${string}/events`
  | `${typeof mobileMessageThreadsPath}/${string}/events?since_event_id=${string}`
  | `${typeof mobileMessageThreadsPath}/${string}/messages`
  | `${typeof mobileMessageThreadsPath}/${string}/approvals/${string}`;

type RegentApiPath =
  | MobileRegentPath
  | MobileRegentStakingPath
  | MobileWalletActionPath
  | MobileMessagePath
  | MobileHermesVoicePath
  | typeof mobileAgentLinkClaimPath
  | typeof mobilePortalPairingPath
  | typeof mobilePortalPairingStartPath
  | typeof mobilePortalPairingCompletePath;

async function readErrorMessage(response: Response, defaultMessage: string) {
  const payload = await response.json().catch(() => null);
  return typeof payload?.error?.message === 'string' ? payload.error.message : defaultMessage;
}

async function requestJson<T>(path: RegentApiPath, init?: RequestInit, errorMessage = 'This Regent is unavailable right now.'): Promise<T> {
  const response = await authenticatedFetch(`${getBaseUrl()}${path}`, init);

  if (!response.ok) {
    const failure = new ApiError(
      apiFailureKindForStatus(response.status),
      await readErrorMessage(response, errorMessage),
      response.status
    );
    console.warn('[api]', privacySafeLogCategory(failure));
    throw failure;
  }

  return response.json() as Promise<T>;
}

const regentPath = (regentId: string): `${typeof mobileRegentsPath}/${string}` =>
  `${mobileRegentsPath}/${encodeURIComponent(regentId)}`;

const regentReturnRequestsPath = (regentId: string): `${typeof mobileRegentsPath}/${string}/return-requests` =>
  `${regentPath(regentId)}/return-requests`;

const regentReturnRequestPath = (
  regentId: string,
  returnRequestId: string
): `${typeof mobileRegentsPath}/${string}/return-requests/${string}` =>
  `${regentReturnRequestsPath(regentId)}/${encodeURIComponent(returnRequestId)}`;

const regentReturnRequestConfirmPath = (
  regentId: string,
  returnRequestId: string
): `${typeof mobileRegentsPath}/${string}/return-requests/${string}/confirm` =>
  `${regentReturnRequestPath(regentId, returnRequestId)}/confirm`;

const regentFundingIntentsPath = (regentId: string): `${typeof mobileRegentsPath}/${string}/funding-intents` =>
  `${regentPath(regentId)}/funding-intents`;

const regentFundingIntentPath = (
  regentId: string,
  fundingIntentId: string
): `${typeof mobileRegentsPath}/${string}/funding-intents/${string}` =>
  `${regentFundingIntentsPath(regentId)}/${encodeURIComponent(fundingIntentId)}`;

const regentFundingIntentConfirmPath = (
  regentId: string,
  fundingIntentId: string
): `${typeof mobileRegentsPath}/${string}/funding-intents/${string}/confirm` =>
  `${regentFundingIntentPath(regentId, fundingIntentId)}/confirm`;

const mobileWalletPreparePath = (
  type: PreparedWalletAction['action']
): `/mobile/wallet-actions/${PreparedWalletAction['action']}/prepare` =>
  `/mobile/wallet-actions/${encodeURIComponent(type) as PreparedWalletAction['action']}/prepare`;

const mobileWalletConfirmPath = (actionId: string): `/mobile/wallet-actions/${string}/confirm` =>
  `/mobile/wallet-actions/${encodeURIComponent(actionId)}/confirm`;

const mobileRegentStakingWithWalletPath = (walletAddress: string): `${typeof mobileRegentStakingPath}?walletAddress=${string}` =>
  `${mobileRegentStakingPath}?walletAddress=${encodeURIComponent(walletAddress)}`;

const messageThreadPath = (threadId: string): `${typeof mobileMessageThreadsPath}/${string}` =>
  `${mobileMessageThreadsPath}/${encodeURIComponent(threadId)}`;

const messageThreadEventsPath = (
  threadId: string,
  sinceEventId?: string
): `${typeof mobileMessageThreadsPath}/${string}/events` | `${typeof mobileMessageThreadsPath}/${string}/events?since_event_id=${string}` => {
  const basePath = `${messageThreadPath(threadId)}/events` as const;
  return sinceEventId ? `${basePath}?since_event_id=${encodeURIComponent(sinceEventId)}` : basePath;
};

const messageThreadMessagesPath = (threadId: string): `${typeof mobileMessageThreadsPath}/${string}/messages` =>
  `${messageThreadPath(threadId)}/messages`;

const messageThreadApprovalPath = (
  threadId: string,
  requestId: string
): `${typeof mobileMessageThreadsPath}/${string}/approvals/${string}` =>
  `${messageThreadPath(threadId)}/approvals/${encodeURIComponent(requestId)}`;

export const regentApi = {
  ...createHermesVoiceApi(requestJson),

  async listRegents(): Promise<RegentSummary[]> {
    const payload = await requestJson<{ regents: RegentSummary[] }>(
      mobileRegentsPath,
      undefined,
      'Unable to load Regents right now.'
    );
    return payload.regents.map(normalizeRegentSummary);
  },

  async getRegent(regentId: string): Promise<RegentDetail> {
    const detail = await requestJson<RegentDetail>(regentPath(regentId), undefined, 'Unable to load this Regent right now.');
    return normalizeRegentDetail(detail);
  },

  getRegentManager(regentId: string): Promise<RegentManagerDetail> {
    return requestJson<RegentManagerDetail>(
      `${regentPath(regentId)}/manager`,
      undefined,
      'Unable to load this Regent Manager right now.'
    );
  },

  async createReturnRequest(input: {
    regentId: string;
    amount: string;
    currency: string;
    destinationWalletAddress: string;
    chainId: number;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    idempotencyKey: string;
  }): Promise<RegentReturnRequest> {
    const payload = await requestJson<{ returnRequest: RegentReturnRequest }>(
      regentReturnRequestsPath(input.regentId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          destinationWalletAddress: input.destinationWalletAddress,
          chainId: input.chainId,
          expectedSigner: input.expectedSigner,
          to: input.to,
          value: input.value,
          data: input.data,
        }),
      },
      'Unable to start this return right now.'
    );

    return normalizeReturnRequest(payload.returnRequest);
  },

  async confirmReturnRequest(input: {
    regentId: string;
    returnRequestId: string;
    txHash: string;
    chainId: number;
    blockNumber: number;
  }): Promise<RegentReturnRequest> {
    const payload = await requestJson<{ returnRequest: RegentReturnRequest }>(
      regentReturnRequestConfirmPath(input.regentId, input.returnRequestId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash: input.txHash,
          chainId: input.chainId,
          blockNumber: input.blockNumber,
          status: 'confirmed',
        }),
      },
      'Unable to confirm this return right now.'
    );

    return normalizeReturnRequest(payload.returnRequest);
  },

  async getReturnRequest(input: {
    regentId: string;
    returnRequestId: string;
  }): Promise<RegentReturnRequest> {
    const payload = await requestJson<{ returnRequest: RegentReturnRequest }>(
      regentReturnRequestPath(input.regentId, input.returnRequestId),
      undefined,
      'Unable to load this return right now.'
    );

    return normalizeReturnRequest(payload.returnRequest);
  },

  async createFundingIntent(input: {
    regentId: string;
    amount: string;
    currency: string;
    sourceWalletAddress: string;
    destinationWalletAddress: string;
    chainId: number;
    tokenAddress: string;
    tokenDecimals: number;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    idempotencyKey: string;
  }): Promise<RegentFundingIntent> {
    const payload = await requestJson<{ fundingIntent: RegentFundingIntent }>(
      regentFundingIntentsPath(input.regentId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          sourceWalletAddress: input.sourceWalletAddress,
          destinationWalletAddress: input.destinationWalletAddress,
          chainId: input.chainId,
          tokenAddress: input.tokenAddress,
          tokenDecimals: input.tokenDecimals,
          expectedSigner: input.expectedSigner,
          to: input.to,
          value: input.value,
          data: input.data,
        }),
      },
      'Unable to prepare this funding right now.'
    );

    return payload.fundingIntent;
  },

  async getFundingIntent(input: {
    regentId: string;
    fundingIntentId: string;
  }): Promise<RegentFundingIntent> {
    const payload = await requestJson<{ fundingIntent: RegentFundingIntent }>(
      regentFundingIntentPath(input.regentId, input.fundingIntentId),
      undefined,
      'Unable to load this funding right now.'
    );

    return payload.fundingIntent;
  },

  async confirmFundingIntent(input: {
    regentId: string;
    fundingIntentId: string;
    txHash: string;
    chainId: number;
    blockNumber: number;
  }): Promise<RegentFundingIntent> {
    const payload = await requestJson<{ fundingIntent: RegentFundingIntent }>(
      regentFundingIntentConfirmPath(input.regentId, input.fundingIntentId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash: input.txHash,
          chainId: input.chainId,
          blockNumber: input.blockNumber,
          status: 'confirmed',
        }),
      },
      'Unable to confirm this funding right now.'
    );

    return payload.fundingIntent;
  },

  async getRegentStaking(input: { walletAddress: string }): Promise<RegentStakingState> {
    const payload = await requestJson<{ staking: RegentStakingState }>(
      mobileRegentStakingWithWalletPath(input.walletAddress),
      undefined,
      'Unable to load staking right now.'
    );

    return payload.staking;
  },

  async stakeRegent(input: {
    walletAddress: string;
    amount: string;
    receiver?: string;
  }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/stake`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to prepare staking right now.'
    );
  },

  async unstakeRegent(input: {
    walletAddress: string;
    amount: string;
  }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/unstake`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to prepare unstaking right now.'
    );
  },

  async claimRegentStakingUsdc(input: { walletAddress: string }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/claim-usdc`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to prepare this USDC claim right now.'
    );
  },

  async claimRegentStakingRegent(input: { walletAddress: string }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/claim-regent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to prepare this REGENT claim right now.'
    );
  },

  async claimAndRestakeRegent(input: { walletAddress: string }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/claim-and-restake-regent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to prepare claim and restake right now.'
    );
  },

  async claimAgentLink(input: { code: string }): Promise<{ id: string; name: string }> {
    const payload = await requestJson<{ connectedAgent: { id: string; name: string } }>(
      mobileAgentLinkClaimPath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: input.code }),
      },
      'Unable to connect your agent right now.'
    );

    return payload.connectedAgent;
  },

  startPortalPairing(): Promise<{ authorizeUrl: string }> {
    return requestJson<{ authorizeUrl: string }>(
      mobilePortalPairingStartPath,
      { method: 'POST' },
      'Unable to start pairing right now.'
    );
  },

  completePortalPairing(input: { code: string; state: string }): Promise<PortalPairingStatus> {
    return requestJson<PortalPairingStatus>(
      mobilePortalPairingCompletePath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to finish pairing right now.'
    );
  },

  getPortalPairing(): Promise<PortalPairingStatus> {
    return requestJson<PortalPairingStatus>(
      mobilePortalPairingPath,
      undefined,
      'Unable to check your Nous Portal connection right now.'
    );
  },

  disconnectPortalPairing(): Promise<PortalPairingStatus> {
    return requestJson<PortalPairingStatus>(
      mobilePortalPairingPath,
      { method: 'DELETE' },
      'Unable to disconnect Nous Portal right now.'
    );
  },

  async prepareWalletAction(input: {
    type: PreparedWalletAction['action'];
    regentId: string;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    amount?: string;
    currency?: string;
    riskCopy: string;
    idempotencyKey: string;
  }): Promise<PreparedWalletAction> {
    const payload = await requestJson<{ wallet_action: PreparedWalletAction }>(
      mobileWalletPreparePath(input.type),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          regentId: input.regentId,
          expectedSigner: input.expectedSigner,
          to: input.to,
          value: input.value,
          data: input.data,
          amount: input.amount,
          currency: input.currency,
          riskCopy: input.riskCopy,
        }),
      },
      'Unable to prepare this wallet action right now.'
    );

    return payload.wallet_action;
  },

  async confirmWalletAction(input: {
    actionId: string;
    txHash: string;
    chainId: number;
    blockNumber?: number;
  }): Promise<PreparedWalletAction> {
    const payload = await requestJson<{ wallet_action: PreparedWalletAction }>(
      mobileWalletConfirmPath(input.actionId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash: input.txHash,
          chainId: input.chainId,
          blockNumber: input.blockNumber,
          status: 'confirmed',
        }),
      },
      'Unable to confirm this wallet action right now.'
    );

    return payload.wallet_action;
  },

  async createMessageThread(input: { agentId: string; agentName: string }): Promise<MessageThreadDetail> {
    const payload = await requestJson<{ thread: MessageThreadDetail }>(
      mobileMessageThreadsPath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to start this message thread right now.'
    );

    return normalizeMessageThread(payload.thread);
  },

  async getMessageThread(threadId: string): Promise<MessageThreadDetail> {
    const payload = await requestJson<{ thread: MessageThreadDetail }>(
      messageThreadPath(threadId),
      undefined,
      'Unable to load this message thread right now.'
    );

    return normalizeMessageThread(payload.thread);
  },

  async getMessageThreadEvents(input: { threadId: string; sinceEventId?: string }): Promise<{
    events: MessageThreadEvent[];
    latestEventId: string;
  }> {
    const payload = await requestJson<{ events: MessageThreadEvent[]; latestEventId: string }>(
      messageThreadEventsPath(input.threadId, input.sinceEventId),
      undefined,
      'Unable to load messages right now.'
    );
    return {
      events: normalizeMessageThreadEvents(payload.events),
      latestEventId: payload.latestEventId,
    };
  },

  async sendMessageThreadMessage(input: { threadId: string; text: string; source?: 'text' | 'voice_summary' }): Promise<MessageThreadDetail> {
    const payload = await requestJson<{ thread: MessageThreadDetail }>(
      messageThreadMessagesPath(input.threadId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: input.text,
          source: input.source || 'text',
        }),
      },
      'Unable to send this message right now.'
    );

    return normalizeMessageThread(payload.thread);
  },

  async resolveMessageThreadApproval(input: {
    threadId: string;
    requestId: string;
    decision: 'approved' | 'denied';
  }): Promise<MessageThreadDetail> {
    const payload = await requestJson<{ thread: MessageThreadDetail }>(
      messageThreadApprovalPath(input.threadId, input.requestId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: input.decision }),
      },
      'Unable to update this review right now.'
    );

    return normalizeMessageThread(payload.thread);
  },

  async listMessageThreads(): Promise<MessageThread[]> {
    const payload = await requestJson<{ threads: MessageThread[] }>(
      mobileMessageThreadsPath,
      undefined,
      'Unable to load messages right now.'
    );

    return payload.threads.map(normalizeMessageThread);
  },
};
