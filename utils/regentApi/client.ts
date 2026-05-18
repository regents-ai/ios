import { getBaseUrl } from '@/constants/BASE_URL';
import {
  AgentXmtpIdentity,
  MessageContactLookupTarget,
  MessageContactSuggestion,
  MessageThread,
  PhoneXmtpIdentity,
  PreparedWalletAction,
  RegentDetail,
  RegentFundingIntent,
  RegentManagerDetail,
  RegentReturnRequest,
  RegentStakingActionResponse,
  RegentStakingState,
  RegentSummary,
  TerminalEvent,
  TerminalSessionDetail,
  TerminalSessionSummary,
  XmtpEnvironment,
} from '@/types/regents';
import { authenticatedFetch } from '@/utils/authenticatedFetch';
import { createHermesVoiceApi, type MobileHermesVoicePath } from '@/utils/regentApi/voice';

const mobileRegentsPath = '/mobile/regents';
const mobileRegentStakingPath = '/mobile/regent/staking';
const mobileTerminalSessionsPath = '/mobile/terminal/sessions';
const mobileMessageThreadsPath = '/mobile/message/threads';
const mobileMessageRecentContactsPath = '/mobile/message/contacts/recent-addresses';
const mobileMessageRegentContactsPath = '/mobile/message/contacts/regent-users';
const mobileMessageXmtpPhoneIdentitiesPath = '/mobile/message/xmtp/phone-identities';
const mobileMessageXmtpAgentsPath = '/mobile/message/xmtp/agents';

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

type MobileTerminalPath =
  | typeof mobileTerminalSessionsPath
  | `${typeof mobileTerminalSessionsPath}/${string}`
  | `${typeof mobileTerminalSessionsPath}/${string}/events`
  | `${typeof mobileTerminalSessionsPath}/${string}/events?since_event_id=${string}`
  | `${typeof mobileTerminalSessionsPath}/${string}/messages`
  | `${typeof mobileTerminalSessionsPath}/${string}/approvals/${string}`;

type MobileMessagePath =
  | typeof mobileMessageThreadsPath
  | `${typeof mobileMessageRecentContactsPath}?addressOrName=${string}`
  | typeof mobileMessageRegentContactsPath
  | typeof mobileMessageXmtpPhoneIdentitiesPath
  | `${typeof mobileMessageXmtpAgentsPath}/${string}`
  | `${typeof mobileMessageThreadsPath}/${string}/xmtp-links`;

type RegentApiPath =
  | MobileRegentPath
  | MobileRegentStakingPath
  | MobileWalletActionPath
  | MobileTerminalPath
  | MobileMessagePath
  | MobileHermesVoicePath;

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

const terminalSessionPath = (sessionId: string): `${typeof mobileTerminalSessionsPath}/${string}` =>
  `${mobileTerminalSessionsPath}/${encodeURIComponent(sessionId)}`;

const terminalEventsPath = (
  sessionId: string,
  sinceEventId?: string
): `${typeof mobileTerminalSessionsPath}/${string}/events` | `${typeof mobileTerminalSessionsPath}/${string}/events?since_event_id=${string}` => {
  const basePath = `${terminalSessionPath(sessionId)}/events` as const;
  return sinceEventId ? `${basePath}?since_event_id=${encodeURIComponent(sinceEventId)}` : basePath;
};

const terminalMessagesPath = (sessionId: string): `${typeof mobileTerminalSessionsPath}/${string}/messages` =>
  `${terminalSessionPath(sessionId)}/messages`;

const terminalApprovalPath = (
  sessionId: string,
  requestId: string
): `${typeof mobileTerminalSessionsPath}/${string}/approvals/${string}` =>
  `${terminalSessionPath(sessionId)}/approvals/${encodeURIComponent(requestId)}`;

const messageThreadXmtpLinksPath = (threadId: string): `${typeof mobileMessageThreadsPath}/${string}/xmtp-links` =>
  `${mobileMessageThreadsPath}/${encodeURIComponent(threadId)}/xmtp-links`;

const agentXmtpIdentityPath = (agentId: string): `${typeof mobileMessageXmtpAgentsPath}/${string}` =>
  `${mobileMessageXmtpAgentsPath}/${encodeURIComponent(agentId)}`;

const recentMessageContactsPath = (
  addressOrName: string,
): `${typeof mobileMessageRecentContactsPath}?addressOrName=${string}` =>
  `${mobileMessageRecentContactsPath}?addressOrName=${encodeURIComponent(addressOrName)}`;

export const regentApi = {
  ...createHermesVoiceApi(requestJson),

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

  async getReturnRequest(input: {
    regentId: string;
    returnRequestId: string;
  }): Promise<RegentReturnRequest> {
    const payload = await requestJson<{ returnRequest: RegentReturnRequest }>(
      regentReturnRequestPath(input.regentId, input.returnRequestId),
      undefined,
      'Unable to load this return right now.'
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

  async listTerminalSessions(): Promise<TerminalSessionSummary[]> {
    const payload = await requestJson<{ sessions: TerminalSessionSummary[] }>(
      mobileTerminalSessionsPath,
      undefined,
      'Unable to load Talk right now.'
    );

    return payload.sessions;
  },

  async createTerminalSession(input: { agentId: string; agentName: string }): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      mobileTerminalSessionsPath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to start Talk right now.'
    );

    return payload.session;
  },

  async getTerminalSession(sessionId: string): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      terminalSessionPath(sessionId),
      undefined,
      'Unable to load this Talk session right now.'
    );

    return payload.session;
  },

  async getTerminalEvents(input: { sessionId: string; sinceEventId?: string }): Promise<{
    events: TerminalEvent[];
    latestEventId: string;
  }> {
    return requestJson<{ events: TerminalEvent[]; latestEventId: string }>(
      terminalEventsPath(input.sessionId, input.sinceEventId),
      undefined,
      'Unable to load Talk messages right now.'
    );
  },

  async sendTerminalMessage(input: { sessionId: string; text: string }): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      terminalMessagesPath(input.sessionId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: input.text }),
      },
      'Unable to send this message right now.'
    );

    return payload.session;
  },

  async resolveTerminalApproval(input: {
    sessionId: string;
    requestId: string;
    decision: 'approved' | 'denied';
  }): Promise<TerminalSessionDetail> {
    const payload = await requestJson<{ session: TerminalSessionDetail }>(
      terminalApprovalPath(input.sessionId, input.requestId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: input.decision }),
      },
      'Unable to update this review right now.'
    );

    return payload.session;
  },

  async listMessageThreads(): Promise<MessageThread[]> {
    const payload = await requestJson<{ threads: MessageThread[] }>(
      mobileMessageThreadsPath,
      undefined,
      'Unable to load messages right now.'
    );

    return payload.threads;
  },

  lookupRecentMessageContacts(input: { addressOrName: string }): Promise<{
    target: MessageContactLookupTarget;
    contacts: MessageContactSuggestion[];
  }> {
    return requestJson<{
      target: MessageContactLookupTarget;
      contacts: MessageContactSuggestion[];
    }>(
      recentMessageContactsPath(input.addressOrName),
      undefined,
      'Unable to look up recent contacts right now.'
    );
  },

  async listRegentMessageContacts(): Promise<MessageContactSuggestion[]> {
    const payload = await requestJson<{ contacts: MessageContactSuggestion[] }>(
      mobileMessageRegentContactsPath,
      undefined,
      'Unable to load Regent contacts right now.'
    );

    return payload.contacts;
  },

  async registerPhoneXmtpIdentity(input: {
    inboxId: string;
    installationId: string;
    walletAddress: string;
    environment: XmtpEnvironment;
  }): Promise<PhoneXmtpIdentity> {
    const payload = await requestJson<{ identity: PhoneXmtpIdentity }>(
      mobileMessageXmtpPhoneIdentitiesPath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
      'Unable to connect messages right now.'
    );

    return payload.identity;
  },

  async getAgentXmtpIdentity(agentId: string): Promise<AgentXmtpIdentity> {
    const payload = await requestJson<{ identity: AgentXmtpIdentity }>(
      agentXmtpIdentityPath(agentId),
      undefined,
      'Unable to load this agent message address right now.'
    );

    return payload.identity;
  },

  async linkXmtpConversation(input: {
    threadId: string;
    conversationId: string;
    conversationKind: 'dm' | 'group';
    environment: XmtpEnvironment;
  }): Promise<MessageThread> {
    const payload = await requestJson<{ thread: MessageThread }>(
      messageThreadXmtpLinksPath(input.threadId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: input.conversationId,
          conversationKind: input.conversationKind,
          environment: input.environment,
        }),
      },
      'Unable to connect this conversation right now.'
    );

    return payload.thread;
  },
};
