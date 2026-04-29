export type TerminalSessionStatus = 'idle' | 'running' | 'waiting' | 'failed';

export type PendingTerminalApproval = {
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
