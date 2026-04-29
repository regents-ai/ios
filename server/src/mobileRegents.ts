import { createHash } from 'node:crypto';

import { createJsonFileStore } from './jsonFileStore.js';
import type { ConfirmedBaseReceipt } from './baseReceiptVerification.js';
import type { PlatformCompanyProjection, PlatformProjection } from './platformProjection.js';

type RegentStatus = 'active' | 'attention' | 'paused';
type RegentRuntimeStatus = 'online' | 'waiting' | 'offline';
type RegentReturnStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed';
type PlatformFormationStatus = 'pending' | 'blocked' | 'provisioning' | 'ready';
type PlatformBillingStatus = 'trial' | 'free-day' | 'prepaid' | 'paused' | 'zero' | 'failed';
type PlatformRuntimeStatus = 'provisioning' | 'ready' | 'paused' | 'blocked';
type WalletActionType = 'stake' | 'claim' | 'funding' | 'return';

type RegentPlatformState = {
  claimedName: string;
  slug: string;
  formationStatus: PlatformFormationStatus;
  billingStatus: PlatformBillingStatus;
  runtimeStatus: PlatformRuntimeStatus;
  blockers: string[];
  dashboardUrl: string;
  prepaidBalanceUsd?: string;
  freeDayEndsAt?: string;
  nextPauseAt?: string;
};

type RegentSummary = {
  id: string;
  name: string;
  status: RegentStatus;
  runtimeStatus: RegentRuntimeStatus;
  walletAddress: string;
  platformState: RegentPlatformState;
  lastActiveAt: string;
  treasuryNote?: string;
};

type RegentActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type RegentReturnRequest = {
  id: string;
  regentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  chainId: number;
  expectedSigner: string;
  to: string;
  value: string;
  data: string;
  status: RegentReturnStatus;
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  blockNumber?: number;
};

export type RegentFundingIntent = {
  id: string;
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
  status: 'created' | 'signed' | 'confirmed' | 'failed';
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  blockNumber?: number;
};

type BaseRegentSnapshot = {
  regentId: string;
  chainId: number;
  blockNumber: number;
  contractAddress: string;
  stale: boolean;
  claimableUsdc: string;
  stakedRegent: string;
  revenueLaneUsdc: string;
  treasuryResidualUsdc: string;
  subjectStatus: string;
};

export type PreparedWalletAction = {
  id: string;
  type: WalletActionType;
  regentId: string;
  chainId: number;
  expectedSigner: string;
  to: string;
  data: string;
  value: string;
  label: string;
  review: string;
  expiresAt: string;
  status: 'prepared' | 'confirmed' | 'expired' | 'failed';
  txHash?: string;
  blockNumber?: number;
};

type RegentDetail = RegentSummary & {
  runtimeHeadline: string;
  mission: string;
  recentActivity: RegentActivity[];
  returnRequests: RegentReturnRequest[];
};

type RegentManagerDetail = {
  regentId: string;
  headline: string;
  companySummary: string;
  dashboardUrl: string;
  goals: { id: string; title: string; status: string; note?: string }[];
  activeTasks: { id: string; title: string; status: string; owner?: string; note?: string }[];
  recentEvents: { id: string; title: string; detail: string; at: string }[];
  roster: { id: string; name: string; role: string; status: string }[];
};

type MobileRegentStoreState = {
  returnRequestIntents: Record<string, RegentReturnRequest>;
  fundingIntentIntents: Record<string, RegentFundingIntent>;
  preparedWalletActions: Record<string, PreparedWalletAction>;
};

const mobileRegentStore = createJsonFileStore<MobileRegentStoreState>('mobile-regent-state.json', () => ({
  returnRequestIntents: {},
  fundingIntentIntents: {},
  preparedWalletActions: {},
}));

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function idFromParts(parts: string[]) {
  const [prefix, ...rest] = parts;
  return `${prefix}-${createHash('sha256').update(rest.join(':')).digest('hex').slice(0, 12)}`;
}

function dollarsFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function normalizeData(value: string) {
  return value.trim().toLowerCase();
}

function normalizeValue(value: string) {
  return BigInt(value).toString();
}

function receiptMatchesExpected(
  receipt: ConfirmedBaseReceipt,
  expected: {
    chainId: number;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
  }
) {
  try {
    return (
      receipt.chainId === expected.chainId &&
      normalizeAddress(receipt.from) === normalizeAddress(expected.expectedSigner) &&
      normalizeAddress(receipt.to) === normalizeAddress(expected.to) &&
      normalizeValue(receipt.value) === normalizeValue(expected.value) &&
      normalizeData(receipt.data) === normalizeData(expected.data)
    );
  } catch {
    return false;
  }
}

function companyId(company: PlatformCompanyProjection) {
  return company.public_profile.slug || company.company.slug;
}

function companyDashboardUrl(company: PlatformCompanyProjection) {
  return company.company.workspace_url || `https://${company.public_profile.basename_fqdn}`;
}

function companyBlockers(projection: PlatformProjection, company: PlatformCompanyProjection) {
  const formationBlockers = projection.formation.formation_state.blockers.map((blocker) => blocker.message);
  const companyFormationError = company.formation?.last_error_message;
  return companyFormationError ? [...formationBlockers, companyFormationError] : formationBlockers;
}

function platformStateForCompany(projection: PlatformProjection, company: PlatformCompanyProjection): RegentPlatformState {
  const state: RegentPlatformState = {
    claimedName: company.company.claimed_label,
    slug: company.public_profile.slug,
    formationStatus: (company.formation?.status || projection.formation.formation_state.state) as PlatformFormationStatus,
    billingStatus: projection.billing_account.status as PlatformBillingStatus,
    runtimeStatus: company.company.runtime_status as PlatformRuntimeStatus,
    blockers: companyBlockers(projection, company),
    dashboardUrl: companyDashboardUrl(company),
    prepaidBalanceUsd: dollarsFromCents(projection.billing_usage.runtime_credit_balance_usd_cents),
  };

  if (company.company.sprite_free_until) {
    state.freeDayEndsAt = company.company.sprite_free_until;
  }

  return state;
}

function runtimeStatusForCompany(company: PlatformCompanyProjection): RegentRuntimeStatus {
  if (company.company.runtime_status === 'ready' && company.runtime.hermes.status === 'ready') {
    return 'online';
  }
  if (company.company.runtime_status === 'blocked' || company.formation?.status === 'blocked') {
    return 'offline';
  }
  return 'waiting';
}

function statusForCompany(company: PlatformCompanyProjection): RegentStatus {
  if (company.formation?.status === 'blocked' || company.company.status === 'paused') {
    return 'attention';
  }
  if (company.company.status === 'inactive') {
    return 'paused';
  }
  return 'active';
}

function returnRequestsForUser(userId: string, regentId: string) {
  return Object.entries(mobileRegentStore.read().returnRequestIntents)
    .filter(([key, request]) => key.startsWith(`${userId}:${regentId}:return:`) && request.regentId === regentId)
    .map(([, request]) => request)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function summaryFromCompany(userId: string, projection: PlatformProjection, company: PlatformCompanyProjection): RegentSummary {
  const id = companyId(company);
  const runtimeStatus = runtimeStatusForCompany(company);
  const summary: RegentSummary = {
    id,
    name: company.company.name,
    status: statusForCompany(company),
    runtimeStatus,
    walletAddress: company.company.wallet_address || '0x0000000000000000000000000000000000000000',
    platformState: platformStateForCompany(projection, company),
    lastActiveAt: nowIso(),
  };

  if (runtimeStatus !== 'online') {
    summary.treasuryNote = 'Review the latest company status before moving money.';
  } else if (returnRequestsForUser(userId, id).some((request) => request.status !== 'confirmed')) {
    summary.treasuryNote = 'A return transfer is waiting for review.';
  }

  return summary;
}

function findCompany(projection: PlatformProjection, regentId: string) {
  return projection.companies.find((company) => companyId(company) === regentId || String(company.company.id) === regentId);
}

export function hasRegentInPlatformProjection(regentId: string, projection: PlatformProjection) {
  return !!findCompany(projection, regentId);
}

export function listRegentsForUserFromPlatformProjection(userId: string, projection: PlatformProjection): RegentSummary[] {
  return projection.companies.map((company) => summaryFromCompany(userId, projection, company));
}

export function getRegentForUserFromPlatformProjection(
  userId: string,
  regentId: string,
  projection: PlatformProjection
): RegentDetail | null {
  const company = findCompany(projection, regentId);
  if (!company) {
    return null;
  }

  const summary = summaryFromCompany(userId, projection, company);
  return {
    ...summary,
    runtimeHeadline: `${summary.name} is ${summary.runtimeStatus === 'online' ? 'ready' : 'waiting for review'}.`,
    mission: company.company.public_summary || `${summary.name} keeps company work, wallet context, and operator review together.`,
    recentActivity: [
      {
        id: `${summary.id}-platform-state`,
        title: 'Company state loaded',
        detail: `${summary.name} is connected to the current mobile Regent record.`,
        at: summary.lastActiveAt,
      },
    ],
    returnRequests: returnRequestsForUser(userId, summary.id),
  };
}

export function getRegentManagerForUserFromPlatformProjection(
  regentId: string,
  projection: PlatformProjection
): RegentManagerDetail | null {
  const company = findCompany(projection, regentId);
  if (!company) {
    return null;
  }

  const id = companyId(company);
  const dashboardUrl = companyDashboardUrl(company);
  const manager: RegentManagerDetail = {
    regentId: id,
    headline: `${company.company.name} is ready for a mobile brief.`,
    companySummary:
      company.company.public_summary ||
      `${company.company.name} keeps operator work, wallet review, and company status visible from mobile.`,
    dashboardUrl,
    goals: [
      {
        id: `${id}-goal-runtime`,
        title: 'Keep the company runtime ready',
        status: company.company.runtime_status,
        note: `Workspace is ${company.runtime.workspace.status}; Hermes is ${company.runtime.hermes.status}.`,
      },
    ],
    activeTasks: [
      {
        id: `${id}-task-review`,
        title: 'Review the next operator move',
        status: runtimeStatusForCompany(company) === 'online' ? 'On track' : 'Waiting',
        owner: 'Regent Manager',
        note: 'Use Talk when a decision needs a human review.',
      },
    ],
    recentEvents: [
      {
        id: `${id}-event-projection`,
        title: 'Company record refreshed',
        detail: `${company.company.name} was loaded from the current company record.`,
        at: nowIso(),
      },
    ],
    roster: [
      { id: `${id}-roster-manager`, name: 'Regent Manager', role: 'Company brief', status: 'Ready' },
      { id: `${id}-roster-hermes`, name: 'Hermes', role: 'Operator talk', status: company.runtime.hermes.status },
      { id: `${id}-roster-workspace`, name: 'Workspace', role: 'Company runtime', status: company.runtime.workspace.status },
    ],
  };

  return cloneJson(manager);
}

export function createRegentReturnRequestForUser(
  userId: string,
  regentId: string,
  input: {
    amount: string;
    currency: string;
    destinationWalletAddress: string;
    chainId: number;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
  },
  idempotencyKey: string
): RegentReturnRequest | null {
  const key = `${userId}:${regentId}:return:${idempotencyKey}`;
  const existing = mobileRegentStore.read().returnRequestIntents[key];
  if (existing) {
    return cloneJson(existing);
  }

  const createdAt = nowIso();
  const request: RegentReturnRequest = {
    id: `${regentId}-return-request-${idFromParts(['', userId, idempotencyKey]).slice(1)}`,
    regentId,
    amount: input.amount,
    currency: input.currency,
    destinationWalletAddress: input.destinationWalletAddress,
    chainId: input.chainId,
    expectedSigner: input.expectedSigner,
    to: input.to,
    value: input.value,
    data: input.data,
    status: 'requested',
    createdAt,
    updatedAt: createdAt,
  };

  mobileRegentStore.update((state) => {
    state.returnRequestIntents[key] = request;
  });

  return cloneJson(request);
}

export function getRegentReturnRequestForUser(userId: string, regentId: string, returnRequestId: string) {
  return (
    Object.entries(mobileRegentStore.read().returnRequestIntents).find(
      ([key, request]) =>
        key.startsWith(`${userId}:${regentId}:return:`) && request.id === returnRequestId && request.regentId === regentId
    )?.[1] || null
  );
}

export function confirmRegentReturnRequestForUser(
  userId: string,
  regentId: string,
  returnRequestId: string,
  receipt: ConfirmedBaseReceipt
):
  | { kind: 'ok'; returnRequest: RegentReturnRequest }
  | { kind: 'not_found' }
  | { kind: 'conflict' } {
  const matchingEntry = Object.entries(mobileRegentStore.read().returnRequestIntents).find(
    ([key, request]) => key.startsWith(`${userId}:${regentId}:return:`) && request.id === returnRequestId
  );
  if (!matchingEntry) {
    return { kind: 'not_found' };
  }
  if (receipt.chainId !== 8453 || receipt.status !== 'confirmed' || !/^0x[a-fA-F0-9]{64}$/.test(receipt.txHash)) {
    return { kind: 'conflict' };
  }

  const [key, request] = matchingEntry;
  if (!receiptMatchesExpected(receipt, request)) {
    return { kind: 'conflict' };
  }

  let updatedRequest: RegentReturnRequest | null = null;
  mobileRegentStore.update((state) => {
    const request = state.returnRequestIntents[key];
    if (request) {
      request.status = 'confirmed';
      request.txHash = receipt.txHash;
      request.blockNumber = receipt.blockNumber;
      request.updatedAt = nowIso();
      updatedRequest = request;
    }
  });

  return updatedRequest ? { kind: 'ok', returnRequest: cloneJson(updatedRequest) } : { kind: 'not_found' };
}

export function createRegentFundingIntentForUser(
  userId: string,
  regentId: string,
  input: {
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
  },
  idempotencyKey: string
): RegentFundingIntent | null {
  const key = `${userId}:${regentId}:funding:${idempotencyKey}`;
  const existing = mobileRegentStore.read().fundingIntentIntents[key];
  if (existing) {
    return cloneJson(existing);
  }

  const createdAt = nowIso();
  const intent: RegentFundingIntent = {
    id: `${regentId}-funding-intent-${idFromParts(['', userId, idempotencyKey]).slice(1)}`,
    regentId,
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
    status: 'created',
    createdAt,
    updatedAt: createdAt,
  };

  mobileRegentStore.update((state) => {
    state.fundingIntentIntents[key] = intent;
  });

  return cloneJson(intent);
}

export function getRegentFundingIntentForUser(userId: string, regentId: string, fundingIntentId: string) {
  return (
    Object.entries(mobileRegentStore.read().fundingIntentIntents).find(
      ([key, intent]) =>
        key.startsWith(`${userId}:${regentId}:funding:`) && intent.id === fundingIntentId && intent.regentId === regentId
    )?.[1] || null
  );
}

export function confirmRegentFundingIntentForUser(
  userId: string,
  regentId: string,
  fundingIntentId: string,
  receipt: ConfirmedBaseReceipt
):
  | { kind: 'ok'; fundingIntent: RegentFundingIntent }
  | { kind: 'not_found' }
  | { kind: 'conflict' } {
  const matchingEntry = Object.entries(mobileRegentStore.read().fundingIntentIntents).find(
    ([key, intent]) => key.startsWith(`${userId}:${regentId}:funding:`) && intent.id === fundingIntentId
  );
  if (!matchingEntry) {
    return { kind: 'not_found' };
  }
  if (receipt.chainId !== 8453 || receipt.status !== 'confirmed' || !/^0x[a-fA-F0-9]{64}$/.test(receipt.txHash)) {
    return { kind: 'conflict' };
  }

  const [key, intent] = matchingEntry;
  if (!receiptMatchesExpected(receipt, intent)) {
    return { kind: 'conflict' };
  }

  let updatedIntent: RegentFundingIntent | null = null;
  mobileRegentStore.update((state) => {
    const intent = state.fundingIntentIntents[key];
    if (intent) {
      intent.status = 'confirmed';
      intent.txHash = receipt.txHash;
      intent.blockNumber = receipt.blockNumber;
      intent.updatedAt = nowIso();
      updatedIntent = intent;
    }
  });

  return updatedIntent ? { kind: 'ok', fundingIntent: cloneJson(updatedIntent) } : { kind: 'not_found' };
}

export function getBaseRegentSnapshotForUser(userId: string, regentId: string): BaseRegentSnapshot {
  return {
    regentId,
    chainId: 8453,
    blockNumber: 0,
    contractAddress: '0x0000000000000000000000000000000000000000',
    stale: true,
    claimableUsdc: '0.00',
    stakedRegent: '0.00',
    revenueLaneUsdc: '0.00',
    treasuryResidualUsdc: '0.00',
    subjectStatus: 'onchain-read-required',
  };
}

export function prepareWalletActionForUser(
  userId: string,
  type: WalletActionType,
  input: {
    regentId: string;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    amount?: string | undefined;
    currency?: string | undefined;
  }
): PreparedWalletAction | null {
  const createdAt = Date.now();
  const id = `${input.regentId}-${type}-action-${idFromParts(['', userId, String(createdAt)]).slice(1)}`;
  const action: PreparedWalletAction = {
    id,
    type,
    regentId: input.regentId,
    chainId: 8453,
    expectedSigner: input.expectedSigner,
    to: input.to,
    data: input.data,
    value: normalizeValue(input.value),
    label: `${type.charAt(0).toUpperCase()}${type.slice(1)} ${input.currency || 'USDC'}`,
    review: input.amount ? `${input.amount} ${input.currency || 'USDC'}` : 'Review this wallet action before signing.',
    expiresAt: new Date(createdAt + 10 * 60 * 1000).toISOString(),
    status: 'prepared',
  };

  mobileRegentStore.update((state) => {
    state.preparedWalletActions[id] = action;
  });

  return cloneJson(action);
}

export function confirmPreparedWalletActionForUser(
  actionId: string,
  receipt: ConfirmedBaseReceipt
):
  | { kind: 'ok'; action: PreparedWalletAction }
  | { kind: 'not_found' }
  | { kind: 'conflict' } {
  const action = mobileRegentStore.read().preparedWalletActions[actionId];
  if (!action) {
    return { kind: 'not_found' };
  }
  if (receipt.chainId !== 8453 || receipt.status !== 'confirmed' || !/^0x[a-fA-F0-9]{64}$/.test(receipt.txHash)) {
    return { kind: 'conflict' };
  }
  if (!receiptMatchesExpected(receipt, action)) {
    return { kind: 'conflict' };
  }

  let updatedAction: PreparedWalletAction | null = null;
  mobileRegentStore.update((state) => {
    const stored = state.preparedWalletActions[actionId];
    if (stored) {
      stored.status = 'confirmed';
      stored.txHash = receipt.txHash;
      stored.blockNumber = receipt.blockNumber;
      updatedAction = stored;
    }
  });

  return updatedAction ? { kind: 'ok', action: cloneJson(updatedAction) } : { kind: 'not_found' };
}

export function resetMobileRegentStateForTests() {
  mobileRegentStore.reset();
}

export function getMobileRegentStateFilePathForTests() {
  return mobileRegentStore.filePath;
}
