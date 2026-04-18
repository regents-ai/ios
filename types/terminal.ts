export type TerminalSessionStatus = 'idle' | 'running' | 'waiting' | 'failed';

export type PendingApproval = {
  requestId: string;
  label: string;
  details: string;
};

export type TerminalSessionSummary = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  status: TerminalSessionStatus;
  preview: string;
  lastUpdatedAt: string;
  pendingApproval?: PendingApproval;
};

export type TerminalSessionDetail = TerminalSessionSummary & {
  composerPlaceholder: string;
};

export type TerminalEvent = {
  type: string;
  sessionId: string;
  ts: string;
  chunk?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  status?: TerminalSessionStatus;
  requestId?: string;
  label?: string;
  details?: string;
  result?: 'approved' | 'denied' | 'timed_out';
  message?: string;
};
