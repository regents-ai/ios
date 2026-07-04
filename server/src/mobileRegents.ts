import { createHash } from 'node:crypto';

import { createSharedStateStore, type SharedStateRedis } from './sharedStateStore.js';
import type { ConfirmedBaseReceipt } from './baseReceiptVerification.js';
import type { PlatformCompanyProjection, PlatformProjection } from './platformProjection.js';

type RegentStatus = 'active' | 'attention' | 'paused';
type RegentRuntimeStatus = 'online' | 'waiting' | 'offline';
type RegentReturnStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed';
type PlatformFormationStatus = 'pending' | 'blocked' | 'provisioning' | 'ready';
type PlatformBillingStatus = 'trial' | 'free-day' | 'prepaid' | 'paused' | 'zero' | 'failed';
type PlatformRuntimeStatus = 'provisioning' | 'ready' | 'paused' | 'blocked';
type WalletActionType = 'funding' | 'return';
type HermesVoiceHealth = 'ok' | 'degraded' | 'unavailable';

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

type HermesVoiceAccount = {
  required: true;
  satisfied: boolean;
  provider: 'openai_chatgpt';
  connect_url?: string | null | undefined;
};

export type MobileRegentVoice = {
  enabled: boolean;
  health: HermesVoiceHealth;
  account: HermesVoiceAccount;
};

type RegentSummary = {
  id: string;
  name: string;
  status: RegentStatus;
  runtimeStatus: RegentRuntimeStatus;
  walletAddress: string;
  platformState: RegentPlatformState;
  voice: MobileRegentVoice;
  lastActiveAt: string;
  treasuryNote?: string;
};

type RegentActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type MobileRegentBaseSnapshot = {
  chainId: 8453;
  blockNumber: number | null;
  contractAddress: string | null;
  observedAt: string;
  stale: boolean;
  snapshot: {
    regentId: string;
    name: string;
    walletAddress: string;
    runtimeStatus: RegentRuntimeStatus;
    platformState: RegentPlatformState;
  };
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

export type PreparedWalletAction = {
  action_id: string;
  owner_product: 'ios';
  resource: 'mobile_wallet_action';
  resource_id: string;
  action: WalletActionType;
  chain_id: number;
  to: string;
  value: string;
  data: string;
  expected_signer: string;
  expires_at: string;
  idempotency_key: string;
  simulation: {
    required: boolean;
    status: 'not_required' | 'pending' | 'passed' | 'failed';
    block_number: number | null;
  };
  risk_copy: string;
  status: 'prepared' | 'confirmed' | 'expired' | 'failed';
  tx_hash?: string;
  block_number?: number;
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
  activeTasks: {
    id: string;
    title: string;
    status: string;
    owner?: string;
    note?: string;
  }[];
  recentEvents: { id: string; title: string; detail: string; at: string }[];
  roster: { id: string; name: string; role: string; status: string }[];
};

type MobileRegentStoreState = {
  returnRequestIntents: Record<string, RegentReturnRequest>;
  fundingIntentIntents: Record<string, RegentFundingIntent>;
  preparedWalletActions: Record<string, PreparedWalletAction>;
};

const preparedWalletActionTtlMs = 10 * 60 * 1000;

// Bounded retention so the shared state cannot grow forever. Only
// clearly-finished records are ever pruned: return and funding intents in a
// terminal state (confirmed/failed) idle past a long retention window, and
// prepared wallet actions long past their own expiry. Intents that could
// still be confirmed are never dropped.
const TERMINAL_INTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRED_WALLET_ACTION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const mobileRegentStore = createSharedStateStore<MobileRegentStoreState>('mobile-regent-state', () => ({
  returnRequestIntents: {},
  fundingIntentIntents: {},
  preparedWalletActions: {},
}));

function pruneMobileRegentStateInPlace(state: MobileRegentStoreState, now: number) {
  for (const [key, request] of Object.entries(state.returnRequestIntents)) {
    if (
      (request.status === 'confirmed' || request.status === 'failed') &&
      now - Date.parse(request.updatedAt) > TERMINAL_INTENT_RETENTION_MS
    ) {
      delete state.returnRequestIntents[key];
    }
  }

  for (const [key, intent] of Object.entries(state.fundingIntentIntents)) {
    if (
      (intent.status === 'confirmed' || intent.status === 'failed') &&
      now - Date.parse(intent.updatedAt) > TERMINAL_INTENT_RETENTION_MS
    ) {
      delete state.fundingIntentIntents[key];
    }
  }

  for (const [key, action] of Object.entries(state.preparedWalletActions)) {
    // Every prepared wallet action expires ten minutes after creation, so
    // anything long past its expiry is finished (confirmed, expired, or
    // failed) and can no longer be confirmed.
    if (now - Date.parse(action.expires_at) > EXPIRED_WALLET_ACTION_RETENTION_MS) {
      delete state.preparedWalletActions[key];
    }
  }
}

export async function pruneMobileRegentState(now = new Date(), redis?: SharedStateRedis | null) {
  await mobileRegentStore.update((state) => pruneMobileRegentStateInPlace(state, now.getTime()), redis);
}

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
  },
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

function receiptMatchesWalletAction(receipt: ConfirmedBaseReceipt, expected: PreparedWalletAction) {
  try {
    return (
      receipt.chainId === expected.chain_id &&
      normalizeAddress(receipt.from) === normalizeAddress(expected.expected_signer) &&
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

function platformStateForCompany(
  projection: PlatformProjection,
  company: PlatformCompanyProjection,
): RegentPlatformState {
  const state: RegentPlatformState = {
    claimedName: company.company.claimed_label,
    slug: company.public_profile.slug,
    formationStatus: (company.formation?.status ||
      projection.formation.formation_state.state) as PlatformFormationStatus,
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

export function voiceForCompany(company: PlatformCompanyProjection): MobileRegentVoice {
  const voice = company.runtime.voice;
  return {
    enabled: voice.enabled && voice.account.satisfied && voice.health !== 'unavailable',
    health: voice.health,
    account: voice.account,
  };
}

async function returnRequestsForUser(userId: string, regentId: string, redis?: SharedStateRedis | null) {
  return Object.entries((await mobileRegentStore.read(redis)).returnRequestIntents)
    .filter(([key, request]) => key.startsWith(`${userId}:${regentId}:return:`) && request.regentId === regentId)
    .map(([, request]) => request)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function summaryFromCompany(
  userId: string,
  projection: PlatformProjection,
  company: PlatformCompanyProjection,
  redis?: SharedStateRedis | null,
): Promise<RegentSummary> {
  const id = companyId(company);
  const runtimeStatus = runtimeStatusForCompany(company);
  const summary: RegentSummary = {
    id,
    name: company.company.name,
    status: statusForCompany(company),
    runtimeStatus,
    walletAddress: company.company.wallet_address || '0x0000000000000000000000000000000000000000',
    platformState: platformStateForCompany(projection, company),
    voice: voiceForCompany(company),
    lastActiveAt: nowIso(),
  };

  if (runtimeStatus !== 'online') {
    summary.treasuryNote = 'Review the latest company status before moving money.';
  } else if ((await returnRequestsForUser(userId, id, redis)).some((request) => request.status !== 'confirmed')) {
    summary.treasuryNote = 'A return transfer is waiting for review.';
  }

  return summary;
}

function findCompany(projection: PlatformProjection, regentId: string) {
  return projection.companies.find(
    (company) => companyId(company) === regentId || String(company.company.id) === regentId,
  );
}

export function hasRegentInPlatformProjection(regentId: string, projection: PlatformProjection) {
  return !!findCompany(projection, regentId);
}

export async function listRegentsForUserFromPlatformProjection(
  userId: string,
  projection: PlatformProjection,
  redis?: SharedStateRedis | null,
): Promise<RegentSummary[]> {
  return Promise.all(projection.companies.map((company) => summaryFromCompany(userId, projection, company, redis)));
}

export async function getRegentForUserFromPlatformProjection(
  userId: string,
  regentId: string,
  projection: PlatformProjection,
  redis?: SharedStateRedis | null,
): Promise<RegentDetail | null> {
  const company = findCompany(projection, regentId);
  if (!company) {
    return null;
  }

  const summary = await summaryFromCompany(userId, projection, company, redis);
  return {
    ...summary,
    runtimeHeadline: `${summary.name} is ${summary.runtimeStatus === 'online' ? 'ready for work' : 'waiting for review'}.`,
    mission:
      company.company.public_summary ||
      `${summary.name} keeps work, payments, and reviews together.`,
    recentActivity: [
      {
        id: `${summary.id}-platform-state`,
        title: 'Agent status loaded',
        detail: `${summary.name} is ready to show work, payments, and reviews on mobile.`,
        at: summary.lastActiveAt,
      },
    ],
    returnRequests: await returnRequestsForUser(userId, summary.id, redis),
  };
}

export function getRegentManagerForUserFromPlatformProjection(
  regentId: string,
  projection: PlatformProjection,
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
      `${company.company.name} keeps agent work, payment review, and company status visible from mobile.`,
    dashboardUrl,
    goals: [
      {
        id: `${id}-goal-runtime`,
        title: 'Keep the agent ready for work',
        status: company.company.runtime_status,
        note: `Current work status is ${company.runtime.workspace.status}. Review status is ${company.runtime.hermes.status}.`,
      },
    ],
    activeTasks: [
      {
        id: `${id}-task-review`,
        title: 'Review the next agent move',
        status: runtimeStatusForCompany(company) === 'online' ? 'On track' : 'Waiting',
        owner: 'Agent Brief',
        note: 'Reviews will appear when this agent needs a decision.',
      },
    ],
    recentEvents: [
      {
        id: `${id}-event-projection`,
        title: 'Agent record refreshed',
        detail: `${company.company.name} was loaded from the current agent record.`,
        at: nowIso(),
      },
    ],
    roster: [
      {
        id: `${id}-roster-manager`,
        name: 'Agent Brief',
        role: 'Agent brief',
        status: 'Ready',
      },
      {
        id: `${id}-roster-talk`,
        name: 'Review',
        role: 'Payment requests and reviews',
        status: 'Open',
      },
      {
        id: `${id}-roster-workspace`,
        name: 'Work status',
        role: 'Agent readiness',
        status: company.runtime.workspace.status,
      },
    ],
  };

  return cloneJson(manager);
}

export async function getRegentBaseSnapshotForUserFromPlatformProjection(
  userId: string,
  regentId: string,
  projection: PlatformProjection,
  redis?: SharedStateRedis | null,
): Promise<MobileRegentBaseSnapshot | null> {
  const company = findCompany(projection, regentId);
  if (!company) {
    return null;
  }

  const summary = await summaryFromCompany(userId, projection, company, redis);
  return cloneJson({
    chainId: 8453,
    blockNumber: null,
    contractAddress: null,
    observedAt: summary.lastActiveAt,
    stale: false,
    snapshot: {
      regentId: summary.id,
      name: summary.name,
      walletAddress: summary.walletAddress,
      runtimeStatus: summary.runtimeStatus,
      platformState: summary.platformState,
    },
  });
}

export async function createRegentReturnRequestForUser(
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
  idempotencyKey: string,
  redis?: SharedStateRedis | null,
): Promise<RegentReturnRequest | null> {
  const key = `${userId}:${regentId}:return:${idempotencyKey}`;
  const existing = (await mobileRegentStore.read(redis)).returnRequestIntents[key];
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

  let stored: RegentReturnRequest = request;
  await mobileRegentStore.update((state) => {
    // A concurrent create with the same idempotency key may have landed
    // between the read above and this atomic update; keep the first record.
    const concurrent = state.returnRequestIntents[key];
    if (concurrent) {
      stored = concurrent;
      return;
    }

    pruneMobileRegentStateInPlace(state, Date.now());
    state.returnRequestIntents[key] = request;
    stored = request;
  }, redis);

  return cloneJson(stored);
}

export async function getRegentReturnRequestForUser(
  userId: string,
  regentId: string,
  returnRequestId: string,
  redis?: SharedStateRedis | null,
) {
  return (
    Object.entries((await mobileRegentStore.read(redis)).returnRequestIntents).find(
      ([key, request]) =>
        key.startsWith(`${userId}:${regentId}:return:`) &&
        request.id === returnRequestId &&
        request.regentId === regentId,
    )?.[1] || null
  );
}

export async function confirmRegentReturnRequestForUser(
  userId: string,
  regentId: string,
  returnRequestId: string,
  receipt: ConfirmedBaseReceipt,
  redis?: SharedStateRedis | null,
): Promise<{ kind: 'ok'; returnRequest: RegentReturnRequest } | { kind: 'not_found' } | { kind: 'conflict' }> {
  // Find, verify, and update inside one atomic update so a concurrent write
  // can never be lost and the receipt is always checked against the current
  // stored intent.
  let outcome: { kind: 'ok'; returnRequest: RegentReturnRequest } | { kind: 'not_found' } | { kind: 'conflict' } = {
    kind: 'not_found',
  };
  await mobileRegentStore.update((state) => {
    outcome = { kind: 'not_found' };
    const matchingEntry = Object.entries(state.returnRequestIntents).find(
      ([key, request]) => key.startsWith(`${userId}:${regentId}:return:`) && request.id === returnRequestId,
    );
    if (!matchingEntry) {
      return;
    }
    if (receipt.chainId !== 8453 || receipt.status !== 'confirmed' || !/^0x[a-fA-F0-9]{64}$/.test(receipt.txHash)) {
      outcome = { kind: 'conflict' };
      return;
    }

    const [, request] = matchingEntry;
    if (!receiptMatchesExpected(receipt, request)) {
      outcome = { kind: 'conflict' };
      return;
    }

    request.status = 'confirmed';
    request.txHash = receipt.txHash;
    request.blockNumber = receipt.blockNumber;
    request.updatedAt = nowIso();
    outcome = { kind: 'ok', returnRequest: cloneJson(request) };
  }, redis);

  return outcome;
}

export async function createRegentFundingIntentForUser(
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
  idempotencyKey: string,
  redis?: SharedStateRedis | null,
): Promise<RegentFundingIntent | null> {
  const key = `${userId}:${regentId}:funding:${idempotencyKey}`;
  const existing = (await mobileRegentStore.read(redis)).fundingIntentIntents[key];
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

  let stored: RegentFundingIntent = intent;
  await mobileRegentStore.update((state) => {
    // A concurrent create with the same idempotency key may have landed
    // between the read above and this atomic update; keep the first record.
    const concurrent = state.fundingIntentIntents[key];
    if (concurrent) {
      stored = concurrent;
      return;
    }

    pruneMobileRegentStateInPlace(state, Date.now());
    state.fundingIntentIntents[key] = intent;
    stored = intent;
  }, redis);

  return cloneJson(stored);
}

export async function getRegentFundingIntentForUser(
  userId: string,
  regentId: string,
  fundingIntentId: string,
  redis?: SharedStateRedis | null,
) {
  return (
    Object.entries((await mobileRegentStore.read(redis)).fundingIntentIntents).find(
      ([key, intent]) =>
        key.startsWith(`${userId}:${regentId}:funding:`) &&
        intent.id === fundingIntentId &&
        intent.regentId === regentId,
    )?.[1] || null
  );
}

export async function confirmRegentFundingIntentForUser(
  userId: string,
  regentId: string,
  fundingIntentId: string,
  receipt: ConfirmedBaseReceipt,
  redis?: SharedStateRedis | null,
): Promise<{ kind: 'ok'; fundingIntent: RegentFundingIntent } | { kind: 'not_found' } | { kind: 'conflict' }> {
  // Find, verify, and update inside one atomic update so a concurrent write
  // can never be lost and the receipt is always checked against the current
  // stored intent.
  let outcome: { kind: 'ok'; fundingIntent: RegentFundingIntent } | { kind: 'not_found' } | { kind: 'conflict' } = {
    kind: 'not_found',
  };
  await mobileRegentStore.update((state) => {
    outcome = { kind: 'not_found' };
    const matchingEntry = Object.entries(state.fundingIntentIntents).find(
      ([key, intent]) => key.startsWith(`${userId}:${regentId}:funding:`) && intent.id === fundingIntentId,
    );
    if (!matchingEntry) {
      return;
    }
    if (receipt.chainId !== 8453 || receipt.status !== 'confirmed' || !/^0x[a-fA-F0-9]{64}$/.test(receipt.txHash)) {
      outcome = { kind: 'conflict' };
      return;
    }

    const [, intent] = matchingEntry;
    if (!receiptMatchesExpected(receipt, intent)) {
      outcome = { kind: 'conflict' };
      return;
    }

    intent.status = 'confirmed';
    intent.txHash = receipt.txHash;
    intent.blockNumber = receipt.blockNumber;
    intent.updatedAt = nowIso();
    outcome = { kind: 'ok', fundingIntent: cloneJson(intent) };
  }, redis);

  return outcome;
}

export async function prepareWalletActionForUser(
  userId: string,
  type: WalletActionType,
  input: {
    regentId: string;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    riskCopy: string;
    idempotencyKey: string;
    amount?: string | undefined;
    currency?: string | undefined;
  },
  redis?: SharedStateRedis | null,
): Promise<PreparedWalletAction | null> {
  const createdAt = Date.now();
  const key = `${userId}:${input.regentId}:${type}:${input.idempotencyKey}`;
  const existing = (await mobileRegentStore.read(redis)).preparedWalletActions[key];
  if (existing) {
    return cloneJson(existing);
  }

  const id = `${input.regentId}-${type}-action-${idFromParts(['', userId, input.idempotencyKey]).slice(1)}`;
  const action: PreparedWalletAction = {
    action_id: id,
    owner_product: 'ios',
    resource: 'mobile_wallet_action',
    resource_id: input.regentId,
    action: type,
    chain_id: 8453,
    to: input.to,
    value: normalizeValue(input.value),
    data: input.data,
    expected_signer: input.expectedSigner,
    expires_at: new Date(createdAt + preparedWalletActionTtlMs).toISOString(),
    idempotency_key: input.idempotencyKey,
    simulation: { required: false, status: 'not_required', block_number: null },
    risk_copy: input.riskCopy,
    status: 'prepared',
  };

  let stored: PreparedWalletAction = action;
  await mobileRegentStore.update((state) => {
    // A concurrent prepare with the same idempotency key may have landed
    // between the read above and this atomic update; keep the first record.
    const concurrent = state.preparedWalletActions[key];
    if (concurrent) {
      stored = concurrent;
      return;
    }

    pruneMobileRegentStateInPlace(state, Date.now());
    state.preparedWalletActions[action.action_id] = action;
    state.preparedWalletActions[key] = action;
    stored = action;
  }, redis);

  return cloneJson(stored);
}

export async function confirmPreparedWalletActionForUser(
  actionId: string,
  receipt: ConfirmedBaseReceipt,
  confirmedAt = new Date(),
  redis?: SharedStateRedis | null,
): Promise<
  | { kind: 'ok'; action: PreparedWalletAction }
  | { kind: 'not_found' }
  | { kind: 'expired'; action: PreparedWalletAction }
  | { kind: 'conflict' }
> {
  // The whole expiry/receipt decision runs inside one atomic update so a
  // concurrent confirm and expiry can never overwrite each other.
  let outcome:
    | { kind: 'ok'; action: PreparedWalletAction }
    | { kind: 'not_found' }
    | { kind: 'expired'; action: PreparedWalletAction }
    | { kind: 'conflict' } = { kind: 'not_found' };
  await mobileRegentStore.update((state) => {
    outcome = { kind: 'not_found' };
    const action = state.preparedWalletActions[actionId];
    if (!action) {
      return;
    }
    if (
      action.status !== 'confirmed' &&
      (action.status === 'expired' || confirmedAt.getTime() >= Date.parse(action.expires_at))
    ) {
      let expiredAction: PreparedWalletAction | null = null;
      for (const stored of Object.values(state.preparedWalletActions)) {
        if (stored.action_id !== actionId) {
          continue;
        }
        stored.status = 'expired';
        expiredAction = stored;
      }

      outcome = expiredAction ? { kind: 'expired', action: cloneJson(expiredAction) } : { kind: 'not_found' };
      return;
    }

    if (receipt.chainId !== 8453 || receipt.status !== 'confirmed' || !/^0x[a-fA-F0-9]{64}$/.test(receipt.txHash)) {
      outcome = { kind: 'conflict' };
      return;
    }
    if (!receiptMatchesWalletAction(receipt, action)) {
      outcome = { kind: 'conflict' };
      return;
    }

    if (action.status === 'confirmed') {
      outcome = { kind: 'ok', action: cloneJson(action) };
      return;
    }

    let updatedAction: PreparedWalletAction | null = null;
    for (const stored of Object.values(state.preparedWalletActions)) {
      if (stored.action_id !== actionId) {
        continue;
      }
      stored.status = 'confirmed';
      stored.tx_hash = receipt.txHash;
      stored.block_number = receipt.blockNumber;
      updatedAction = stored;
    }

    outcome = updatedAction ? { kind: 'ok', action: cloneJson(updatedAction) } : { kind: 'not_found' };
  }, redis);

  return outcome;
}

export async function resetMobileRegentStateForTests(redis?: SharedStateRedis | null) {
  await mobileRegentStore.reset(redis);
}

export async function readMobileRegentStateForTests(redis?: SharedStateRedis | null) {
  return mobileRegentStore.read(redis);
}
