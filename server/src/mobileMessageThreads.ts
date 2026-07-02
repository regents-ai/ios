import type {
  PlatformRequestAuth,
  PlatformRwrClient,
  RwrApproval,
  RwrCompany,
  RwrRun,
  RwrRunEvent,
  RwrWorkItem,
} from './platformProjection.js';

type MessageThreadStatus = 'idle' | 'running' | 'waiting' | 'failed';

type PendingMessageApproval = {
  requestId: string;
  action: string;
  regentName: string;
  riskCopy: string;
  amount?: string;
  currency?: string;
  amountUsd?: string;
  contractAddress?: string;
  expiresAt?: string;
  resolved: boolean;
};

export type MessageThread = {
  id: string;
  platformThreadId: string;
  title: string;
  agentId: string;
  agentName: string;
  source: 'platform_rwr';
  status: MessageThreadStatus;
  latestNote: string;
  lastUpdatedAt: string;
  pendingApproval?: PendingMessageApproval;
};

export type MessageThreadDetail = MessageThread & {
  composerPlaceholder: string;
};

export type MessageThreadEvent = {
  eventId: string;
  type: string;
  threadId: string;
  ts: string;
  chunk?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  status?: MessageThreadStatus;
  requestId?: string;
  action?: string;
  regentName?: string;
  riskCopy?: string;
  amount?: string;
  currency?: string;
  amountUsd?: string;
  contractAddress?: string;
  result?: 'approved' | 'denied' | 'timed_out';
  message?: string;
};

export type MobileMessageResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'bad_request' }
  | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'upstream_error'; message: string };

type ParsedThreadId =
  | { kind: 'company'; companyId: number }
  | { kind: 'work_item'; companyId: number; workItemId: number }
  | { kind: 'run'; companyId: number; workItemId: number; runId: number };

function threadIdForCompany(company: RwrCompany) {
  return String(company.id);
}

function threadIdForWorkItem(workItem: RwrWorkItem) {
  return `${workItem.company_id}~${workItem.id}`;
}

function threadIdForRun(run: RwrRun) {
  return `${run.company_id}~${run.work_item_id}~${run.id}`;
}

function parseThreadId(threadId: string): ParsedThreadId | null {
  const rawParts = threadId.split('~');
  if (
    (rawParts.length !== 1 && rawParts.length !== 2 && rawParts.length !== 3) ||
    rawParts.some((part) => !/^[0-9]+$/.test(part))
  ) {
    return null;
  }

  const parts = rawParts.map((part) => Number(part));
  if (parts.some((part) => !Number.isSafeInteger(part) || part <= 0)) {
    return null;
  }

  const [companyId, workItemId, runId] = parts;
  if (parts.length === 1) {
    return { kind: 'company', companyId: companyId! };
  }
  if (parts.length === 2) {
    return { kind: 'work_item', companyId: companyId!, workItemId: workItemId! };
  }

  return { kind: 'run', companyId: companyId!, workItemId: workItemId!, runId: runId! };
}

function statusFromWorkItem(item: RwrWorkItem): MessageThreadStatus {
  if (item.status === 'failed' || item.status === 'canceled') {
    return 'failed';
  }
  if (item.status === 'running' || item.status === 'active') {
    return 'running';
  }
  if (item.status === 'waiting' || item.status === 'blocked') {
    return 'waiting';
  }

  return 'idle';
}

function statusFromRun(run: RwrRun): MessageThreadStatus {
  if (run.status === 'failed' || run.status === 'canceled') {
    return 'failed';
  }
  if (run.status === 'running' || run.status === 'queued') {
    return 'running';
  }
  if (run.status === 'awaiting_approval' || run.status === 'blocked') {
    return 'waiting';
  }

  return 'idle';
}

function companyName(companies: RwrCompany[], companyId: number) {
  return companies.find((company) => company.id === companyId)?.name || `Company ${companyId}`;
}

function companySlug(companies: RwrCompany[], companyId: number) {
  return companies.find((company) => company.id === companyId)?.slug || String(companyId);
}

function summaryFromCompany(company: RwrCompany): MessageThread {
  return {
    id: threadIdForCompany(company),
    platformThreadId: threadIdForCompany(company),
    title: `${company.name} messages`,
    agentId: company.slug,
    agentName: company.name,
    source: 'platform_rwr',
    status: company.status === 'forming' || company.status === 'provisioning' ? 'running' : 'idle',
    latestNote: 'Send a message to start.',
    lastUpdatedAt: new Date().toISOString(),
  };
}

function detailFromCompany(company: RwrCompany): MessageThreadDetail {
  return {
    ...summaryFromCompany(company),
    composerPlaceholder: `Message ${company.name}...`,
  };
}

function approvalPayloadString(approval: RwrApproval, key: string) {
  const value = approval.payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function approvalMoneyFields(approval: RwrApproval) {
  const amount = approvalPayloadString(approval, 'amount');
  const currency = approvalPayloadString(approval, 'currency');
  const amountUsd = approvalPayloadString(approval, 'amount_usd');
  const contractAddress = approvalPayloadString(approval, 'contract_address');
  const fields: Pick<PendingMessageApproval, 'amount' | 'currency' | 'amountUsd' | 'contractAddress'> = {};
  if (amount) {
    fields.amount = amount;
  }
  if (currency) {
    fields.currency = currency;
  }
  if (amountUsd) {
    fields.amountUsd = amountUsd;
  }
  if (contractAddress) {
    fields.contractAddress = contractAddress;
  }
  return fields;
}

function pendingApprovalFromRwr(approval: RwrApproval, regentName: string): PendingMessageApproval {
  const pending: PendingMessageApproval = {
    requestId: String(approval.id),
    action: approval.approval_type || 'Review request',
    regentName,
    riskCopy: approval.risk_summary || 'Review the requested payment or action before this agent continues.',
    ...approvalMoneyFields(approval),
    resolved: approval.status !== 'pending',
  };

  if (approval.expires_at) {
    pending.expiresAt = approval.expires_at;
  }

  return pending;
}

function summaryFromWorkItem(item: RwrWorkItem, companies: RwrCompany[]): MessageThread {
  const name = companyName(companies, item.company_id);

  return {
    id: threadIdForWorkItem(item),
    platformThreadId: threadIdForWorkItem(item),
    title: item.title,
    agentId: companySlug(companies, item.company_id),
    agentName: name,
    source: 'platform_rwr',
    status: statusFromWorkItem(item),
    latestNote: item.description || item.status,
    lastUpdatedAt: item.updated_at,
  };
}

function detailFromWorkItem(item: RwrWorkItem, companies: RwrCompany[]): MessageThreadDetail {
  const summary = summaryFromWorkItem(item, companies);

  return {
    ...summary,
    composerPlaceholder: `Message ${summary.agentName}...`,
  };
}

function detailFromRun(run: RwrRun, workItem: RwrWorkItem, companies: RwrCompany[], approvals: RwrApproval[]): MessageThreadDetail {
  const summary = summaryFromWorkItem(workItem, companies);
  const pendingApproval = approvals.find((approval) => approval.status === 'pending');
  const detail: MessageThreadDetail = {
    ...summary,
    id: threadIdForRun(run),
    platformThreadId: threadIdForRun(run),
    status: pendingApproval ? 'waiting' : statusFromRun(run),
    latestNote: run.summary || run.failure_reason || summary.latestNote,
    lastUpdatedAt: run.updated_at,
    composerPlaceholder: `Message ${summary.agentName}...`,
  };

  if (pendingApproval) {
    detail.pendingApproval = pendingApprovalFromRwr(pendingApproval, summary.agentName);
  }

  return detail;
}

function textFromPayload(payload: Record<string, unknown>) {
  for (const key of ['text', 'message', 'chunk', 'summary', 'detail']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function eventFromRwr(event: RwrRunEvent, threadId: string): MessageThreadEvent {
  const text = textFromPayload(event.payload);
  if (event.kind.includes('error')) {
    return {
      eventId: `run:${event.id}`,
      type: 'session.error',
      threadId,
      ts: event.occurred_at,
      message: text || 'The run reported a problem.',
    };
  }

  if (event.actor_kind === 'human' || event.actor_kind === 'operator') {
    return {
      eventId: `run:${event.id}`,
      type: 'message.user',
      threadId,
      ts: event.occurred_at,
      role: 'user',
      text: text || event.kind,
    };
  }

  return {
    eventId: `run:${event.id}`,
    type: 'message.delta',
    threadId,
    ts: event.occurred_at,
    role: 'assistant',
    chunk: text || event.kind,
  };
}

function approvalRequestEvent(approval: RwrApproval, threadId: string, regentName: string): MessageThreadEvent {
  return {
    eventId: `approval:${approval.id}:requested`,
    type: 'tool.request',
    threadId,
    ts: approval.created_at,
    requestId: String(approval.id),
    action: approval.approval_type || 'Review request',
    regentName,
    riskCopy: approval.risk_summary || 'Review the requested payment or action before this agent continues.',
    ...approvalMoneyFields(approval),
  };
}

function approvalResolvedEvent(approval: RwrApproval, threadId: string): MessageThreadEvent {
  return {
    eventId: `approval:${approval.id}:resolved`,
    type: 'tool.resolved',
    threadId,
    ts: approval.resolved_at || approval.updated_at,
    requestId: String(approval.id),
    result: approval.status === 'approved' ? 'approved' : approval.status === 'denied' ? 'denied' : 'timed_out',
  };
}

function approvalEvents(approval: RwrApproval, threadId: string, regentName: string): MessageThreadEvent[] {
  const requestEvent = approvalRequestEvent(approval, threadId, regentName);
  if (approval.status === 'pending') {
    return [requestEvent];
  }

  return [requestEvent, approvalResolvedEvent(approval, threadId)];
}

async function account(client: PlatformRwrClient, auth: PlatformRequestAuth) {
  return client.fetchAccount(auth);
}

function findCompany(companies: RwrCompany[], companyId: number) {
  return companies.find((company) => company.id === companyId) || null;
}

async function findWorkItem(client: PlatformRwrClient, auth: PlatformRequestAuth, companyId: number, workItemId: number) {
  const itemsResult = await client.fetchWorkItems(auth, companyId);
  if (itemsResult.kind !== 'ok') {
    return itemsResult;
  }

  const workItem = itemsResult.data.find((item) => item.id === workItemId);
  return workItem ? { kind: 'ok' as const, data: workItem } : { kind: 'not_found' as const };
}

export async function listMessageThreads(client: PlatformRwrClient, auth: PlatformRequestAuth): Promise<MobileMessageResult<MessageThread[]>> {
  const accountResult = await account(client, auth);
  if (accountResult.kind !== 'ok') {
    return accountResult;
  }

  const sessionGroups = await Promise.all(
    accountResult.data.companies.map(async (company) => {
      const itemsResult = await client.fetchWorkItems(auth, company.id);
      if (itemsResult.kind !== 'ok') {
        return itemsResult;
      }

      return {
        kind: 'ok' as const,
        data: itemsResult.data.length > 0 ? itemsResult.data.map((item) => summaryFromWorkItem(item, accountResult.data.companies)) : [summaryFromCompany(company)],
      };
    })
  );
  const failedGroup = sessionGroups.find((group) => group.kind !== 'ok');
  if (failedGroup) {
    return failedGroup;
  }

  return {
    kind: 'ok',
    data: sessionGroups
      .flatMap((group) => group.kind === 'ok' ? group.data : [])
      .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)),
  };
}

export async function createMessageThread(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  input: { agentId: string; agentName: string }
): Promise<MobileMessageResult<MessageThreadDetail>> {
  const accountResult = await account(client, auth);
  if (accountResult.kind !== 'ok') {
    return accountResult;
  }

  const company = accountResult.data.companies.find(
    (item) => item.slug === input.agentId || String(item.id) === input.agentId
  );
  if (!company) {
    return { kind: 'not_found' };
  }

  const created = await client.createWorkItem(auth, company.id, {
    title: `${input.agentName} mobile review`,
    description: 'Started from mobile.',
    visibility: 'operator',
    metadata: { source: 'regents-mobile' },
  });
  if (created.kind !== 'ok') {
    return created;
  }

  return {
    kind: 'ok',
    data: detailFromWorkItem(created.data, accountResult.data.companies),
  };
}

export async function getMessageThread(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  threadId: string
): Promise<MobileMessageResult<MessageThreadDetail>> {
  const parsed = parseThreadId(threadId);
  if (!parsed) {
    return { kind: 'bad_request' };
  }

  const accountResult = await account(client, auth);
  if (accountResult.kind !== 'ok') {
    return accountResult;
  }

  if (parsed.kind === 'company') {
    const company = findCompany(accountResult.data.companies, parsed.companyId);
    return company ? { kind: 'ok', data: detailFromCompany(company) } : { kind: 'not_found' };
  }

  const workItemResult = await findWorkItem(client, auth, parsed.companyId, parsed.workItemId);
  if (workItemResult.kind !== 'ok') {
    return workItemResult;
  }

  if (parsed.kind === 'work_item') {
    return { kind: 'ok', data: detailFromWorkItem(workItemResult.data, accountResult.data.companies) };
  }

  const runResult = await client.fetchRun(auth, parsed.companyId, parsed.runId);
  if (runResult.kind !== 'ok') {
    return runResult;
  }

  const approvalsResult = await client.fetchApprovals(auth, parsed.companyId, parsed.runId);
  const approvals = approvalsResult.kind === 'ok' ? approvalsResult.data : [];

  return {
    kind: 'ok',
    data: detailFromRun(runResult.data, workItemResult.data, accountResult.data.companies, approvals),
  };
}

export async function getMessageThreadEvents(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  threadId: string,
  sinceEventId?: string
): Promise<MobileMessageResult<MessageThreadEvent[]>> {
  const parsed = parseThreadId(threadId);
  if (!parsed) {
    return { kind: 'bad_request' };
  }

  if (parsed.kind === 'company' || parsed.kind === 'work_item') {
    return {
      kind: 'ok',
      data: [
        {
          eventId: `thread:${threadId}:started`,
          type: 'session.started',
          threadId,
          ts: new Date(0).toISOString(),
        },
      ],
    };
  }

  const [eventsResult, approvalsResult] = await Promise.all([
    client.fetchRunEvents(auth, parsed.companyId, parsed.runId),
    client.fetchApprovals(auth, parsed.companyId, parsed.runId),
  ]);
  if (eventsResult.kind !== 'ok') {
    return eventsResult;
  }

  const workItemResult = await findWorkItem(client, auth, parsed.companyId, parsed.workItemId);
  const accountResult = await account(client, auth);
  const regentName =
    workItemResult.kind === 'ok' && accountResult.kind === 'ok'
      ? companyName(accountResult.data.companies, workItemResult.data.company_id)
      : `Company ${parsed.companyId}`;
  const approvalTimelineEvents =
    approvalsResult.kind === 'ok' ? approvalsResult.data.flatMap((approval) => approvalEvents(approval, threadId, regentName)) : [];
  const events = [
    {
      eventId: `thread:${threadId}:started`,
      type: 'session.started',
      threadId,
      ts: eventsResult.data[0]?.occurred_at || new Date(0).toISOString(),
    },
    ...eventsResult.data.map((event) => eventFromRwr(event, threadId)),
    ...approvalTimelineEvents,
  ].sort((a, b) => a.ts.localeCompare(b.ts));
  const cursorIndex = sinceEventId ? events.findIndex((event) => event.eventId === sinceEventId) : -1;

  return {
    kind: 'ok',
    data: cursorIndex >= 0 ? events.slice(cursorIndex + 1) : events,
  };
}

export async function postMessageThreadMessage(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  threadId: string,
  text: string,
  source: 'text' | 'voice_summary' = 'text'
): Promise<MobileMessageResult<MessageThreadDetail>> {
  const parsed = parseThreadId(threadId);
  if (!parsed) {
    return { kind: 'bad_request' };
  }

  if (parsed.kind === 'company') {
    const accountResult = await account(client, auth);
    if (accountResult.kind !== 'ok') {
      return accountResult;
    }

    const company = findCompany(accountResult.data.companies, parsed.companyId);
    if (!company) {
      return { kind: 'not_found' };
    }

    const created = await client.createWorkItem(auth, company.id, {
      title: `${company.name} mobile conversation`,
      description: 'Started from mobile.',
      visibility: 'operator',
      metadata: { source: 'regents-mobile', agent_slug: company.slug },
    });
    if (created.kind !== 'ok') {
      return created;
    }

    const run = await client.startRun(auth, company.id, created.data.id, {
      instructions: source === 'voice_summary' ? `Voice summary:\n${text}` : text,
      metadata: { source: 'regents-mobile', message_source: source },
    });
    if (run.kind !== 'ok') {
      return run;
    }

    return {
      kind: 'ok',
      data: detailFromRun(run.data, created.data, accountResult.data.companies, []),
    };
  }

  const workItemResult = await findWorkItem(client, auth, parsed.companyId, parsed.workItemId);
  if (workItemResult.kind !== 'ok') {
    return workItemResult;
  }

  const run = await client.startRun(auth, parsed.companyId, parsed.workItemId, {
    instructions: source === 'voice_summary' ? `Voice summary:\n${text}` : text,
    metadata: { source: 'regents-mobile', message_source: source },
  });
  if (run.kind !== 'ok') {
    return run;
  }

  const accountResult = await account(client, auth);
  const companies = accountResult.kind === 'ok' ? accountResult.data.companies : [];

  return {
    kind: 'ok',
    data: detailFromRun(run.data, workItemResult.data, companies, []),
  };
}

export async function resolveMessageThreadApproval(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  threadId: string,
  requestId: string,
  decision: 'approved' | 'denied'
): Promise<MobileMessageResult<MessageThreadDetail>> {
  const parsed = parseThreadId(threadId);
  const approvalId = /^[0-9]+$/.test(requestId) ? Number(requestId) : null;
  if (!parsed || !approvalId || !Number.isSafeInteger(approvalId)) {
    return { kind: 'bad_request' };
  }
  if (parsed.kind !== 'run') {
    return { kind: 'not_found' };
  }

  const approval = await client.resolveApproval(auth, parsed.companyId, parsed.runId, approvalId, decision);
  if (approval.kind === 'not_found') {
    return { kind: 'not_found' };
  }
  if (approval.kind !== 'ok') {
    return approval;
  }

  return getMessageThread(client, auth, threadId);
}
