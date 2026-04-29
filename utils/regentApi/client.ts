import { getBaseUrl } from '@/constants/BASE_URL';
import {
  BaseRegentSnapshot,
  PreparedWalletAction,
  RegentDetail,
  RegentFundingIntent,
  RegentManagerDetail,
  RegentReturnRequest,
  RegentSummary,
} from '@/types/regents';
import { TerminalEvent, TerminalSessionDetail, TerminalSessionSummary } from '@/types/terminal';
import { authenticatedFetch } from '@/utils/authenticatedFetch';

const mobileRegentsPath = '/mobile/regents';
const mobileTerminalSessionsPath = '/mobile/terminal/sessions';

type MobileRegentPath =
  | typeof mobileRegentsPath
  | `${typeof mobileRegentsPath}/${string}`
  | `${typeof mobileRegentsPath}/${string}/manager`
  | `${typeof mobileRegentsPath}/${string}/return-requests`
  | `${typeof mobileRegentsPath}/${string}/return-requests/${string}/confirm`
  | `${typeof mobileRegentsPath}/${string}/funding-intents`
  | `${typeof mobileRegentsPath}/${string}/funding-intents/${string}`
  | `${typeof mobileRegentsPath}/${string}/funding-intents/${string}/confirm`
  | `${typeof mobileRegentsPath}/${string}/base-snapshot`;

type MobileWalletActionPath =
  | `/mobile/wallet-actions/${PreparedWalletAction['type']}/prepare`
  | `/mobile/wallet-actions/${string}/confirm`;

type MobileTerminalPath =
  | typeof mobileTerminalSessionsPath
  | `${typeof mobileTerminalSessionsPath}/${string}`
  | `${typeof mobileTerminalSessionsPath}/${string}/events`
  | `${typeof mobileTerminalSessionsPath}/${string}/events?since_event_id=${string}`
  | `${typeof mobileTerminalSessionsPath}/${string}/messages`
  | `${typeof mobileTerminalSessionsPath}/${string}/approvals/${string}`;

type RegentApiPath = MobileRegentPath | MobileWalletActionPath | MobileTerminalPath;

async function readErrorMessage(response: Response, defaultMessage: string) {
  const payload = await response.json().catch(() => null);
  return typeof payload?.error?.message === 'string' ? payload.error.message : defaultMessage;
}

async function requestJson<T>(path: RegentApiPath, init?: RequestInit, errorMessage = 'This Regent is unavailable right now.'): Promise<T> {
  const response = await authenticatedFetch(`${getBaseUrl()}${path}`, init);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, errorMessage));
  }

  return response.json() as Promise<T>;
}

const regentPath = (regentId: string): `${typeof mobileRegentsPath}/${string}` =>
  `${mobileRegentsPath}/${encodeURIComponent(regentId)}`;

const regentReturnRequestsPath = (regentId: string): `${typeof mobileRegentsPath}/${string}/return-requests` =>
  `${regentPath(regentId)}/return-requests`;

const regentReturnRequestConfirmPath = (
  regentId: string,
  returnRequestId: string
): `${typeof mobileRegentsPath}/${string}/return-requests/${string}/confirm` =>
  `${regentReturnRequestsPath(regentId)}/${encodeURIComponent(returnRequestId)}/confirm`;

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
  type: PreparedWalletAction['type']
): `/mobile/wallet-actions/${PreparedWalletAction['type']}/prepare` =>
  `/mobile/wallet-actions/${encodeURIComponent(type) as PreparedWalletAction['type']}/prepare`;

const mobileWalletConfirmPath = (actionId: string): `/mobile/wallet-actions/${string}/confirm` =>
  `/mobile/wallet-actions/${encodeURIComponent(actionId)}/confirm`;

const terminalSessionPath = (sessionId: string): `${typeof mobileTerminalSessionsPath}/${string}` =>
  `${mobileTerminalSessionsPath}/${encodeURIComponent(sessionId)}`;

export const regentApi = {
  async listRegents(): Promise<RegentSummary[]> {
    const payload = await requestJson<{ regents: RegentSummary[] }>(
      mobileRegentsPath,
      undefined,
      'Unable to load Regents right now.'
    );
    return payload.regents;
  },

  getRegent(regentId: string): Promise<RegentDetail> {
    return requestJson<RegentDetail>(regentPath(regentId), undefined, 'Unable to load this Regent right now.');
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

    return payload.returnRequest;
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

    return payload.returnRequest;
  },

  async createFundingIntent(input: {
    regentId: string;
    amount: string;
    currency: string;
    sourceWalletAddress: string;
    destinationWalletAddress: string;
    chainId: number;
    tokenAddress: string;
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

  async getBaseSnapshot(regentId: string): Promise<BaseRegentSnapshot> {
    const payload = await requestJson<{ snapshot: BaseRegentSnapshot }>(
      `${regentPath(regentId)}/base-snapshot`,
      undefined,
      'Unable to load Base records right now.'
    );

    return payload.snapshot;
  },

  async prepareWalletAction(input: {
    type: PreparedWalletAction['type'];
    regentId: string;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    amount?: string;
    currency?: string;
  }): Promise<PreparedWalletAction> {
    const payload = await requestJson<{ action: PreparedWalletAction }>(
      mobileWalletPreparePath(input.type),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          regentId: input.regentId,
          expectedSigner: input.expectedSigner,
          to: input.to,
          value: input.value,
          data: input.data,
          amount: input.amount,
          currency: input.currency,
        }),
      },
      'Unable to prepare this wallet action right now.'
    );

    return payload.action;
  },

  async confirmWalletAction(input: {
    actionId: string;
    txHash: string;
    chainId: number;
    blockNumber: number;
  }): Promise<PreparedWalletAction> {
    const payload = await requestJson<{ action: PreparedWalletAction }>(
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

    return payload.action;
  },

  async listTerminalSessions(): Promise<TerminalSessionSummary[]> {
    const payload = await requestJson<{ sessions: TerminalSessionSummary[] }>(
      mobileTerminalSessionsPath,
      undefined,
      'Unable to load conversations right now.'
    );
    return payload.sessions;
  },

  async createTerminalSession(input: {
    agentId: string;
    agentName: string;
  }): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      mobileTerminalSessionsPath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to start this conversation right now.'
    );

    return payload.session;
  },

  async getTerminalSession(sessionId: string): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      terminalSessionPath(sessionId),
      undefined,
      'Unable to load this conversation right now.'
    );

    return payload.session;
  },

  async getTerminalEvents(sessionId: string, sinceEventId?: string): Promise<{
    events: TerminalEvent[];
    latestEventId: string;
  }> {
    const path = sinceEventId
      ? (`${terminalSessionPath(sessionId)}/events?since_event_id=${encodeURIComponent(sinceEventId)}` as const)
      : (`${terminalSessionPath(sessionId)}/events` as const);
    const payload = await requestJson<{ events: TerminalEvent[]; latestEventId: string }>(
      path,
      undefined,
      'Unable to load the latest updates right now.'
    );

    return payload;
  },

  async sendTerminalMessage(sessionId: string, text: string): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      `${terminalSessionPath(sessionId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
      'Unable to send your message right now.'
    );

    return payload.session;
  },

  async resolveTerminalApproval(
    sessionId: string,
    requestId: string,
    decision: 'approved' | 'denied'
  ): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      `${terminalSessionPath(sessionId)}/approvals/${encodeURIComponent(requestId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision }),
      },
      'Unable to save your decision right now.'
    );

    return payload.session;
  },
};
