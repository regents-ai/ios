type PreviewTerminalSessionStatus = 'idle' | 'running' | 'waiting' | 'failed';

type PreviewPendingApproval = {
  requestId: string;
  label: string;
  details: string;
};

export type PreviewTerminalSessionSummary = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  status: PreviewTerminalSessionStatus;
  preview: string;
  lastUpdatedAt: string;
  pendingApproval?: PreviewPendingApproval;
};

export type PreviewTerminalSessionDetail = PreviewTerminalSessionSummary & {
  composerPlaceholder: string;
};

export type PreviewTerminalEvent = {
  type: string;
  sessionId: string;
  ts: string;
  chunk?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  status?: PreviewTerminalSessionStatus;
  requestId?: string;
  label?: string;
  details?: string;
  result?: 'approved' | 'denied' | 'timed_out';
  message?: string;
};

type StoredPreviewSession = PreviewTerminalSessionDetail & {
  ownerUserId: string;
  events: PreviewTerminalEvent[];
};

const reviewOwner = 'testflight-reviewer';
const fallbackOwner = 'seeded-user';
const previewSessionsByOwner = new Map<string, StoredPreviewSession[]>();

function nowIso() {
  return new Date().toISOString();
}

function clonePreviewSession(session: StoredPreviewSession): StoredPreviewSession {
  const clonedSession: StoredPreviewSession = {
    ...session,
    events: session.events.map((event) => ({ ...event })),
  };

  if (session.pendingApproval) {
    clonedSession.pendingApproval = { ...session.pendingApproval };
  }

  return clonedSession;
}

function seedPreviewSessions(ownerUserId: string): StoredPreviewSession[] {
  const waitingSessionId = `${ownerUserId}-atlas-session`;
  const activeSessionId = `${ownerUserId}-meridian-session`;

  return [
    {
      ownerUserId,
      id: waitingSessionId,
      title: 'Atlas treasury review',
      agentId: 'atlas-capital',
      agentName: 'Atlas Capital',
      status: 'waiting',
      preview: 'Approval needed before a transfer can continue.',
      lastUpdatedAt: '2026-04-17T23:50:00.000Z',
      composerPlaceholder: 'Reply to Atlas Capital…',
      pendingApproval: {
        requestId: `${waitingSessionId}-approval-1`,
        label: 'Approve treasury transfer',
        details: 'Atlas Capital wants approval to move 500 USDC into a launch budget.',
      },
      events: [
        {
          type: 'session.started',
          sessionId: waitingSessionId,
          ts: '2026-04-17T23:41:00.000Z',
        },
        {
          type: 'message.user',
          sessionId: waitingSessionId,
          ts: '2026-04-17T23:42:00.000Z',
          role: 'user',
          text: 'Review the treasury move for this evening.',
        },
        {
          type: 'message.delta',
          sessionId: waitingSessionId,
          ts: '2026-04-17T23:43:00.000Z',
          role: 'assistant',
          chunk: 'I reviewed the cash buffer and I am ready to continue.',
        },
        {
          type: 'tool.request',
          sessionId: waitingSessionId,
          ts: '2026-04-17T23:50:00.000Z',
          requestId: `${waitingSessionId}-approval-1`,
          label: 'Approve treasury transfer',
          details: 'Atlas Capital wants approval to move 500 USDC into a launch budget.',
        },
        {
          type: 'session.status',
          sessionId: waitingSessionId,
          ts: '2026-04-17T23:50:00.000Z',
          status: 'waiting',
        },
      ],
    },
    {
      ownerUserId,
      id: activeSessionId,
      title: 'Meridian operating update',
      agentId: 'meridian-ops',
      agentName: 'Meridian Ops',
      status: 'idle',
      preview: 'Run complete. Waiting for the next instruction.',
      lastUpdatedAt: '2026-04-17T22:16:00.000Z',
      composerPlaceholder: 'Reply to Meridian Ops…',
      events: [
        {
          type: 'session.started',
          sessionId: activeSessionId,
          ts: '2026-04-17T22:02:00.000Z',
        },
        {
          type: 'message.user',
          sessionId: activeSessionId,
          ts: '2026-04-17T22:03:00.000Z',
          role: 'user',
          text: 'Summarize the latest operator budget changes.',
        },
        {
          type: 'message.delta',
          sessionId: activeSessionId,
          ts: '2026-04-17T22:10:00.000Z',
          role: 'assistant',
          chunk: 'Meridian finished the latest budget pass. Vendor reserve increased, travel spend stayed flat, and the buffer remains healthy.',
        },
        {
          type: 'message.done',
          sessionId: activeSessionId,
          ts: '2026-04-17T22:16:00.000Z',
        },
        {
          type: 'session.status',
          sessionId: activeSessionId,
          ts: '2026-04-17T22:16:00.000Z',
          status: 'idle',
        },
      ],
    },
  ];
}

function getOwnerSessions(userId: string) {
  const ownerId = userId || fallbackOwner;
  if (!previewSessionsByOwner.has(ownerId)) {
    previewSessionsByOwner.set(ownerId, seedPreviewSessions(ownerId).map(clonePreviewSession));
  }

  return previewSessionsByOwner.get(ownerId)!;
}

function updatePreviewSessionSummaryFromEvents(session: StoredPreviewSession) {
  const latestEvent = session.events.at(-1);
  const latestPreviewEvent = [...session.events]
    .reverse()
    .find(
      (event) =>
        (event.type === 'message.delta' && !!event.chunk) ||
        (event.type === 'message.user' && !!event.text) ||
        (event.type === 'tool.request' && !!event.details) ||
        (event.type === 'tool.resolved' && !!event.result) ||
        (event.type === 'session.error' && !!event.message)
    );

  if (latestPreviewEvent?.type === 'message.delta' && latestPreviewEvent.chunk) {
    session.preview = latestPreviewEvent.chunk;
  } else if (latestPreviewEvent?.type === 'message.user' && latestPreviewEvent.text) {
    session.preview = latestPreviewEvent.text;
  } else if (latestPreviewEvent?.type === 'tool.request' && latestPreviewEvent.details) {
    session.preview = latestPreviewEvent.details;
  } else if (latestPreviewEvent?.type === 'tool.resolved' && latestPreviewEvent.result) {
    session.preview =
      latestPreviewEvent.result === 'approved'
        ? 'Approval granted. The session can continue.'
        : 'Approval denied. The session is waiting for a new direction.';
  } else if (latestPreviewEvent?.type === 'session.error' && latestPreviewEvent.message) {
    session.preview = latestPreviewEvent.message;
  }

  if (latestEvent?.ts) {
    session.lastUpdatedAt = latestEvent.ts;
  }
}

function toPreviewSessionSummary(session: StoredPreviewSession): PreviewTerminalSessionSummary {
  const summary: PreviewTerminalSessionSummary = {
    id: session.id,
    title: session.title,
    agentId: session.agentId,
    agentName: session.agentName,
    status: session.status,
    preview: session.preview,
    lastUpdatedAt: session.lastUpdatedAt,
  };

  if (session.pendingApproval) {
    summary.pendingApproval = { ...session.pendingApproval };
  }

  return summary;
}

function toPreviewSessionDetail(session: StoredPreviewSession): PreviewTerminalSessionDetail {
  return {
    ...toPreviewSessionSummary(session),
    composerPlaceholder: session.composerPlaceholder,
  };
}

function findSession(userId: string, sessionId: string) {
  return getOwnerSessions(userId).find((session) => session.id === sessionId) || null;
}

export function listPreviewTerminalSessions(userId: string) {
  return getOwnerSessions(userId)
    .map((session) => toPreviewSessionSummary(session))
    .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
}

export function getPreviewTerminalSession(userId: string, sessionId: string) {
  const session = findSession(userId, sessionId);
  if (!session) {
    return null;
  }

  return toPreviewSessionDetail(session);
}

export function getPreviewTerminalEvents(userId: string, sessionId: string) {
  const session = findSession(userId, sessionId);
  if (!session) {
    return null;
  }

  return session.events;
}

export function createPreviewTerminalSession(userId: string, input: { agentId: string; agentName: string }) {
  const sessionId = `${input.agentId}-${Date.now()}`;
  const createdAt = nowIso();

  const session: StoredPreviewSession = {
    ownerUserId: userId || fallbackOwner,
    id: sessionId,
    title: `${input.agentName} preview session`,
    agentId: input.agentId,
    agentName: input.agentName,
    status: 'running',
    preview: 'Session started from mobile.',
    lastUpdatedAt: createdAt,
    composerPlaceholder: `Reply to ${input.agentName}…`,
    events: [
      {
        type: 'session.started',
        sessionId,
        ts: createdAt,
      },
      {
        type: 'message.delta',
        sessionId,
        ts: createdAt,
        role: 'assistant',
        chunk: `${input.agentName} is online and ready for instructions.`,
      },
    ],
  };

  getOwnerSessions(userId).unshift(session);
  return getPreviewTerminalSession(userId, sessionId)!;
}

export function postPreviewTerminalMessage(userId: string, sessionId: string, text: string) {
  const session = findSession(userId, sessionId);
  if (!session) {
    return null;
  }

  const messageTs = nowIso();
  session.events.push({
    type: 'message.user',
    sessionId,
    ts: messageTs,
    role: 'user',
    text,
  });

  const wantsApproval = /approve|transfer|deploy|ship|launch|move/i.test(text);
  const requestId = `${sessionId}-approval-${session.events.filter((event) => event.type === 'tool.request').length + 1}`;

  if (wantsApproval) {
    session.pendingApproval = {
      requestId,
      label: 'Approve action',
      details: `${session.agentName} is asking to continue with: ${text}`,
    };
    session.status = 'waiting';
    session.events.push({
      type: 'tool.request',
      sessionId,
      ts: nowIso(),
      requestId,
      label: 'Approve action',
      details: `${session.agentName} is asking to continue with: ${text}`,
    });
    session.events.push({
      type: 'session.status',
      sessionId,
      ts: nowIso(),
      status: 'waiting',
    });
  } else {
    session.status = 'running';
    session.events.push({
      type: 'session.status',
      sessionId,
      ts: nowIso(),
      status: 'running',
    });
    session.events.push({
      type: 'message.delta',
      sessionId,
      ts: nowIso(),
      role: 'assistant',
      chunk: `${session.agentName} received your note: "${text}". The run has been updated from mobile.`,
    });
    session.events.push({
      type: 'message.done',
      sessionId,
      ts: nowIso(),
    });
    session.status = 'idle';
    session.events.push({
      type: 'session.status',
      sessionId,
      ts: nowIso(),
      status: 'idle',
    });
  }

  updatePreviewSessionSummaryFromEvents(session);
  return getPreviewTerminalSession(userId, sessionId)!;
}

export function resolvePreviewTerminalApproval(
  userId: string,
  sessionId: string,
  requestId: string,
  decision: 'approved' | 'denied'
) {
  const session = findSession(userId, sessionId);
  if (!session || session.pendingApproval?.requestId !== requestId) {
    return null;
  }

  session.events.push({
    type: 'tool.resolved',
    sessionId,
    ts: nowIso(),
    requestId,
    result: decision,
  });

  delete session.pendingApproval;

  if (decision === 'approved') {
    session.status = 'running';
    session.events.push({
      type: 'message.delta',
      sessionId,
      ts: nowIso(),
      role: 'assistant',
      chunk: `${session.agentName} has approval and is continuing the task now.`,
    });
    session.events.push({
      type: 'message.done',
      sessionId,
      ts: nowIso(),
    });
    session.status = 'idle';
  } else {
    session.status = 'idle';
    session.events.push({
      type: 'message.delta',
      sessionId,
      ts: nowIso(),
      role: 'assistant',
      chunk: `${session.agentName} stood down after the request was denied.`,
    });
    session.events.push({
      type: 'message.done',
      sessionId,
      ts: nowIso(),
    });
  }

  session.events.push({
    type: 'session.status',
    sessionId,
    ts: nowIso(),
    status: session.status,
  });

  updatePreviewSessionSummaryFromEvents(session);
  return getPreviewTerminalSession(userId, sessionId)!;
}

export function seedReviewPreviewTerminalSessions() {
  if (!previewSessionsByOwner.has(reviewOwner)) {
    getOwnerSessions(reviewOwner);
  }
}
