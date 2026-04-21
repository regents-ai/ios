export type PreviewTerminalSessionStatus = 'idle' | 'running' | 'waiting' | 'failed';

export type PreviewPendingApproval = {
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
