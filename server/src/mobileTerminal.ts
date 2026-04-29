import type {
  PlatformRequestAuth,
  PlatformRwrClient,
  RwrApproval,
  RwrCompany,
  RwrRun,
  RwrRunEvent,
  RwrWorkItem,
} from './platformProjection.js';

type TerminalSessionStatus = 'idle' | 'running' | 'waiting' | 'failed';

type PendingTerminalApproval = {
  requestId: string;
  action: string;
  regentName: string;
  riskCopy: string;
  amount?: string;
  currency?: string;
  contractAddress?: string;
  expiresAt: string;
  resolved: boolean;
};

export type TerminalSessionSummary = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  status: TerminalSessionStatus;
  latestNote: string;
  lastUpdatedAt: string;
  pendingApproval?: PendingTerminalApproval;
};

export type TerminalSessionDetail = TerminalSessionSummary & {
  composerPlaceholder: string;
};

export type TerminalEvent = {
  eventId: string;
  type: string;
  sessionId: string;
  ts: string;
  chunk?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  status?: TerminalSessionStatus;
  requestId?: string;
  action?: string;
  regentName?: string;
  riskCopy?: string;
  amount?: string;
  currency?: string;
  contractAddress?: string;
  result?: 'approved' | 'denied' | 'timed_out';
  message?: string;
};

export type MobileTerminalResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'upstream_error'; message: string };

type ParsedSessionId =
  | { kind: 'work_item'; companyId: number; workItemId: number }
  | { kind: 'run'; companyId: number; workItemId: number; runId: number };

function sessionIdForWorkItem(workItem: RwrWorkItem) {
  return `${workItem.company_id}~${workItem.id}`;
}

function sessionIdForRun(run: RwrRun) {
  return `${run.company_id}~${run.work_item_id}~${run.id}`;
}

function parseSessionId(sessionId: string): ParsedSessionId | null {
  const parts = sessionId.split('~').map((part) => Number.parseInt(part, 10));
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !Number.isInteger(part) || part <= 0)) {
    return null;
  }

  const [companyId, workItemId, runId] = parts;
  if (parts.length === 2) {
    return { kind: 'work_item', companyId: companyId!, workItemId: workItemId! };
  }

  return { kind: 'run', companyId: companyId!, workItemId: workItemId!, runId: runId! };
}

function statusFromWorkItem(item: RwrWorkItem): TerminalSessionStatus {
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

function statusFromRun(run: RwrRun): TerminalSessionStatus {
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

function approvalPayloadString(approval: RwrApproval, key: string) {
  const value = approval.payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function approvalMoneyFields(approval: RwrApproval) {
  const amount = approvalPayloadString(approval, 'amount');
  const currency = approvalPayloadString(approval, 'currency');
  const contractAddress = approvalPayloadString(approval, 'contract_address');
  const fields: Pick<PendingTerminalApproval, 'amount' | 'currency' | 'contractAddress'> = {};
  if (amount) {
    fields.amount = amount;
  }
  if (currency) {
    fields.currency = currency;
  }
  if (contractAddress) {
    fields.contractAddress = contractAddress;
  }
  return fields;
}

function pendingApprovalFromRwr(approval: RwrApproval, regentName: string): PendingTerminalApproval {
  return {
    requestId: String(approval.id),
    action: approval.approval_type || 'Review request',
    regentName,
    riskCopy: approval.risk_summary || 'Review the requested work before it continues.',
    ...approvalMoneyFields(approval),
    expiresAt: approval.expires_at || approval.updated_at,
    resolved: approval.status !== 'pending',
  };
}

function summaryFromWorkItem(item: RwrWorkItem, companies: RwrCompany[]): TerminalSessionSummary {
  const name = companyName(companies, item.company_id);

  return {
    id: sessionIdForWorkItem(item),
    title: item.title,
    agentId: companySlug(companies, item.company_id),
    agentName: name,
    status: statusFromWorkItem(item),
    latestNote: item.description || item.status,
    lastUpdatedAt: item.updated_at,
  };
}

function detailFromWorkItem(item: RwrWorkItem, companies: RwrCompany[]): TerminalSessionDetail {
  const summary = summaryFromWorkItem(item, companies);

  return {
    ...summary,
    composerPlaceholder: `Reply to ${summary.agentName}...`,
  };
}

function detailFromRun(run: RwrRun, workItem: RwrWorkItem, companies: RwrCompany[], approvals: RwrApproval[]): TerminalSessionDetail {
  const summary = summaryFromWorkItem(workItem, companies);
  const pendingApproval = approvals.find((approval) => approval.status === 'pending');
  const detail: TerminalSessionDetail = {
    ...summary,
    id: sessionIdForRun(run),
    status: pendingApproval ? 'waiting' : statusFromRun(run),
    latestNote: run.summary || run.failure_reason || summary.latestNote,
    lastUpdatedAt: run.updated_at,
    composerPlaceholder: `Reply to ${summary.agentName}...`,
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

function eventFromRwr(event: RwrRunEvent, sessionId: string): TerminalEvent {
  const text = textFromPayload(event.payload);
  if (event.kind.includes('error')) {
    return {
      eventId: `run:${event.id}`,
      type: 'session.error',
      sessionId,
      ts: event.occurred_at,
      message: text || 'The run reported a problem.',
    };
  }

  if (event.actor_kind === 'human' || event.actor_kind === 'operator') {
    return {
      eventId: `run:${event.id}`,
      type: 'message.user',
      sessionId,
      ts: event.occurred_at,
      role: 'user',
      text: text || event.kind,
    };
  }

  return {
    eventId: `run:${event.id}`,
    type: 'message.delta',
    sessionId,
    ts: event.occurred_at,
    role: 'assistant',
    chunk: text || event.kind,
  };
}

function approvalEvent(approval: RwrApproval, sessionId: string, regentName: string): TerminalEvent {
  if (approval.status === 'pending') {
    return {
      eventId: `approval:${approval.id}:${approval.updated_at}`,
      type: 'tool.request',
      sessionId,
      ts: approval.created_at,
      requestId: String(approval.id),
      action: approval.approval_type || 'Review request',
      regentName,
      riskCopy: approval.risk_summary || 'Review the requested work before it continues.',
      ...approvalMoneyFields(approval),
    };
  }

  return {
    eventId: `approval:${approval.id}:${approval.updated_at}`,
    type: 'tool.resolved',
    sessionId,
    ts: approval.resolved_at || approval.updated_at,
    requestId: String(approval.id),
    result: approval.status === 'approved' ? 'approved' : approval.status === 'denied' ? 'denied' : 'timed_out',
  };
}

async function account(client: PlatformRwrClient, auth: PlatformRequestAuth) {
  return client.fetchAccount(auth);
}

async function findWorkItem(client: PlatformRwrClient, auth: PlatformRequestAuth, companyId: number, workItemId: number) {
  const itemsResult = await client.fetchWorkItems(auth, companyId);
  if (itemsResult.kind !== 'ok') {
    return itemsResult;
  }

  const workItem = itemsResult.data.find((item) => item.id === workItemId);
  return workItem ? { kind: 'ok' as const, data: workItem } : { kind: 'not_found' as const };
}

export async function listTerminalSessions(client: PlatformRwrClient, auth: PlatformRequestAuth): Promise<MobileTerminalResult<TerminalSessionSummary[]>> {
  const accountResult = await account(client, auth);
  if (accountResult.kind !== 'ok') {
    return accountResult;
  }

  const sessionGroups = await Promise.all(
    accountResult.data.companies.map(async (company) => {
      const itemsResult = await client.fetchWorkItems(auth, company.id);
      return itemsResult.kind === 'ok' ? itemsResult.data : [];
    })
  );

  return {
    kind: 'ok',
    data: sessionGroups
      .flat()
      .map((item) => summaryFromWorkItem(item, accountResult.data.companies))
      .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)),
  };
}

export async function createTerminalSession(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  input: { agentId: string; agentName: string }
): Promise<MobileTerminalResult<TerminalSessionDetail>> {
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
    title: `${input.agentName} mobile conversation`,
    description: 'Started from mobile.',
    visibility: 'operator',
    metadata: { source: 'regents-mobile' },
  });
  if (created.kind !== 'ok') {
    return created;
  }

  const run = await client.startRun(auth, company.id, created.data.id, {
    instructions: `Start a mobile conversation with ${input.agentName}.`,
    metadata: { source: 'regents-mobile' },
  });
  if (run.kind !== 'ok') {
    return run;
  }

  return {
    kind: 'ok',
    data: detailFromRun(run.data, created.data, accountResult.data.companies, []),
  };
}

export async function getTerminalSession(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  sessionId: string
): Promise<MobileTerminalResult<TerminalSessionDetail>> {
  const parsed = parseSessionId(sessionId);
  if (!parsed) {
    return { kind: 'not_found' };
  }

  const accountResult = await account(client, auth);
  if (accountResult.kind !== 'ok') {
    return accountResult;
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

export async function getTerminalEvents(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  sessionId: string,
  sinceEventId?: string
): Promise<MobileTerminalResult<TerminalEvent[]>> {
  const parsed = parseSessionId(sessionId);
  if (!parsed) {
    return { kind: 'not_found' };
  }

  if (parsed.kind === 'work_item') {
    return {
      kind: 'ok',
      data: [
        {
          eventId: `session:${sessionId}:started`,
          type: 'session.started',
          sessionId,
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
  const approvalEvents =
    approvalsResult.kind === 'ok' ? approvalsResult.data.map((approval) => approvalEvent(approval, sessionId, regentName)) : [];
  const events = [
    {
      eventId: `session:${sessionId}:started`,
      type: 'session.started',
      sessionId,
      ts: eventsResult.data[0]?.occurred_at || new Date(0).toISOString(),
    },
    ...eventsResult.data.map((event) => eventFromRwr(event, sessionId)),
    ...approvalEvents,
  ].sort((a, b) => a.ts.localeCompare(b.ts));
  const cursorIndex = sinceEventId ? events.findIndex((event) => event.eventId === sinceEventId) : -1;

  return {
    kind: 'ok',
    data: cursorIndex >= 0 ? events.slice(cursorIndex + 1) : events,
  };
}

export async function postTerminalMessage(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  sessionId: string,
  text: string
): Promise<MobileTerminalResult<TerminalSessionDetail>> {
  const parsed = parseSessionId(sessionId);
  if (!parsed) {
    return { kind: 'not_found' };
  }

  const workItemResult = await findWorkItem(client, auth, parsed.companyId, parsed.workItemId);
  if (workItemResult.kind !== 'ok') {
    return workItemResult;
  }

  const run = await client.startRun(auth, parsed.companyId, parsed.workItemId, {
    instructions: text,
    metadata: { source: 'regents-mobile' },
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

export async function resolveTerminalApproval(
  client: PlatformRwrClient,
  auth: PlatformRequestAuth,
  sessionId: string,
  requestId: string,
  decision: 'approved' | 'denied'
): Promise<MobileTerminalResult<TerminalSessionDetail>> {
  const parsed = parseSessionId(sessionId);
  const approvalId = Number.parseInt(requestId, 10);
  if (!parsed || parsed.kind !== 'run' || !Number.isInteger(approvalId) || approvalId <= 0) {
    return { kind: 'not_found' };
  }

  const approval = await client.resolveApproval(auth, parsed.companyId, parsed.runId, approvalId, decision);
  if (approval.kind === 'not_found') {
    return { kind: 'not_found' };
  }
  if (approval.kind !== 'ok') {
    return approval;
  }

  return getTerminalSession(client, auth, sessionId);
}
