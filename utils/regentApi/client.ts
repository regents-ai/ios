import { getBaseUrl } from '@/constants/BASE_URL';
import {
  BasePortfolio,
  MobileAgent,
  MobileAgentKind,
  MobileAgentPairingCode,
  MobileAgentPairingStatus,
  MobileAgentsList,
  RegentStakingActionResponse,
  RegentStakingState,
  PaymentRequest,
  PaymentRequestsList,
  PaymentRequestWalletAction,
} from '@/types/regents';
import { ApiError, apiFailureKindForStatus, privacySafeLogCategory } from '@/utils/apiError';
import { authenticatedFetch } from '@/utils/authenticatedFetch';

const mobileAgentsPath = '/mobile/agents';
const mobileAgentPairingCodesPath = '/mobile/agents/pairing-codes';
const mobilePortfolioPath = '/mobile/portfolio';
const mobileRegentStakingPath = '/mobile/regent/staking';
const mobilePortalPairingPath = '/mobile/portal-pairing';
const mobilePortalPairingStartPath = '/mobile/portal-pairing/start';
const mobilePortalPairingCompletePath = '/mobile/portal-pairing/complete';
const mobilePaymentRequestsPath = '/mobile/payment-requests';

export type PortalPairingStatus = {
  paired: boolean;
  accountLabel: string | null;
  pairedAt: string | null;
};

type MobileAgentsPath =
  | typeof mobileAgentsPath
  | typeof mobileAgentPairingCodesPath
  | `${typeof mobileAgentsPath}/${string}`;

type MobileRegentStakingPath =
  | typeof mobileRegentStakingPath
  | `${typeof mobileRegentStakingPath}?walletAddress=${string}`
  | `${typeof mobileRegentStakingPath}/stake`
  | `${typeof mobileRegentStakingPath}/unstake`
  | `${typeof mobileRegentStakingPath}/claim-usdc`
  | `${typeof mobileRegentStakingPath}/claim-regent`
  | `${typeof mobileRegentStakingPath}/claim-and-restake-regent`;

type RegentApiPath =
  | MobileAgentsPath
  | `${typeof mobilePortfolioPath}?wallets=${string}`
  | MobileRegentStakingPath
  | typeof mobilePortalPairingPath
  | typeof mobilePortalPairingStartPath
  | typeof mobilePortalPairingCompletePath
  | typeof mobilePaymentRequestsPath
  | `${typeof mobilePaymentRequestsPath}/${string}`;

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

const jsonInit = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({
  method,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const mobileAgentPath = (agentId: string): `${typeof mobileAgentsPath}/${string}` =>
  `${mobileAgentsPath}/${encodeURIComponent(agentId)}`;

const mobileAgentPairingCodePath = (code: string, suffix = ''): `${typeof mobileAgentsPath}/${string}` =>
  `${mobileAgentPairingCodesPath}/${encodeURIComponent(code)}${suffix}`;

const mobilePaymentRequestPath = (requestId: string, suffix = ''): `${typeof mobilePaymentRequestsPath}/${string}` =>
  `${mobilePaymentRequestsPath}/${encodeURIComponent(requestId)}${suffix}`;

const mobileRegentStakingWithWalletPath =(walletAddress: string): `${typeof mobileRegentStakingPath}?walletAddress=${string}` =>
  `${mobileRegentStakingPath}?walletAddress=${encodeURIComponent(walletAddress)}`;

export const regentApi = {
  /** Base holdings and staking position for one to five wallets, in the order given. */
  async getPortfolio(input: { wallets: string[] }): Promise<BasePortfolio> {
    const payload = await requestJson<{ portfolio: BasePortfolio }>(
      `${mobilePortfolioPath}?wallets=${input.wallets.map(encodeURIComponent).join(',')}`,
      undefined,
      'Unable to load balances right now.'
    );

    return payload.portfolio;
  },

  listAgents(): Promise<MobileAgentsList> {
    return requestJson<MobileAgentsList>(
      mobileAgentsPath,
      undefined,
      'Unable to load your agents right now.'
    );
  },

  async addAgent(input: { name: string; kind: MobileAgentKind; walletAddress: string }): Promise<MobileAgent> {
    const payload = await requestJson<{ agent: MobileAgent }>(
      mobileAgentsPath,
      jsonInit('POST', input),
      'Unable to add this agent right now.'
    );
    return payload.agent;
  },

  async renameAgent(agentId: string, input: { name: string }): Promise<MobileAgent> {
    const payload = await requestJson<{ agent: MobileAgent }>(
      mobileAgentPath(agentId),
      jsonInit('PATCH', input),
      'Unable to rename this agent right now.'
    );
    return payload.agent;
  },

  async removeAgent(agentId: string): Promise<void> {
    await requestJson<{ removed: true }>(
      mobileAgentPath(agentId),
      { method: 'DELETE' },
      'Unable to remove this agent right now.'
    );
  },

  createAgentPairingCode(input: { name: string; kind: MobileAgentKind }): Promise<MobileAgentPairingCode> {
    return requestJson<MobileAgentPairingCode>(
      mobileAgentPairingCodesPath,
      jsonInit('POST', input),
      'Unable to create a pairing code right now.'
    );
  },

  getAgentPairingStatus(code: string): Promise<MobileAgentPairingStatus> {
    return requestJson<MobileAgentPairingStatus>(
      mobileAgentPairingCodePath(code),
      undefined,
      'Unable to check this pairing code right now.'
    );
  },

  async confirmAgentPairing(code: string): Promise<MobileAgent> {
    const payload = await requestJson<{ agent: MobileAgent }>(
      mobileAgentPairingCodePath(code, '/confirm'),
      { method: 'POST' },
      'Unable to confirm this agent right now.'
    );
    return payload.agent;
  },

  async discardAgentPairingCode(code: string): Promise<void> {
    await requestJson<{ discarded: true }>(
      mobileAgentPairingCodePath(code),
      { method: 'DELETE' },
      'Unable to discard this pairing code right now.'
    );
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
  }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/stake`,
      jsonInit('POST', input),
      'Unable to prepare staking right now.'
    );
  },

  async unstakeRegent(input: {
    walletAddress: string;
    amount: string;
  }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/unstake`,
      jsonInit('POST', input),
      'Unable to prepare unstaking right now.'
    );
  },

  async claimRegentStakingUsdc(input: { walletAddress: string }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/claim-usdc`,
      jsonInit('POST', input),
      'Unable to prepare this USDC claim right now.'
    );
  },

  async claimRegentStakingRegent(input: { walletAddress: string }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/claim-regent`,
      jsonInit('POST', input),
      'Unable to prepare this REGENT claim right now.'
    );
  },

  async claimAndRestakeRegent(input: { walletAddress: string }): Promise<RegentStakingActionResponse> {
    return requestJson<RegentStakingActionResponse>(
      `${mobileRegentStakingPath}/claim-and-restake-regent`,
      jsonInit('POST', input),
      'Unable to prepare claim and restake right now.'
    );
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
      jsonInit('POST', input),
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

  listPaymentRequests(): Promise<PaymentRequestsList> {
    return requestJson<PaymentRequestsList>(
      mobilePaymentRequestsPath,
      undefined,
      'Unable to load your requests right now.'
    );
  },

  async getPaymentRequest(requestId: string): Promise<PaymentRequest> {
    const payload = await requestJson<{ request: PaymentRequest }>(
      mobilePaymentRequestPath(requestId),
      undefined,
      'Unable to load this request right now.'
    );
    return payload.request;
  },

  async preparePaymentRequest(requestId: string, input: { walletAddress: string }): Promise<PaymentRequestWalletAction> {
    const payload = await requestJson<{ wallet_action: PaymentRequestWalletAction }>(
      mobilePaymentRequestPath(requestId, '/prepare'),
      jsonInit('POST', input),
      'Unable to prepare this payment right now.'
    );
    return payload.wallet_action;
  },

  async confirmPaymentRequestPaid(requestId: string, input: { walletAddress: string; txHash: string }): Promise<PaymentRequest> {
    const payload = await requestJson<{ request: PaymentRequest }>(
      mobilePaymentRequestPath(requestId, '/paid'),
      jsonInit('POST', input),
      'Unable to check this payment right now.'
    );
    return payload.request;
  },

  async declinePaymentRequest(requestId: string): Promise<PaymentRequest> {
    const payload = await requestJson<{ request: PaymentRequest }>(
      mobilePaymentRequestPath(requestId, '/decline'),
      { method: 'POST' },
      'Unable to decline this request right now.'
    );
    return payload.request;
  },
};
