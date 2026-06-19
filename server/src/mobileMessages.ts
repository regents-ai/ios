import type { TerminalSessionSummary } from './mobileTerminal.js';

export type MessageThread = {
  id: string;
  platformThreadId: string;
  agentId: string;
  agentName: string;
  source: 'platform_rwr';
  title: string;
  latestNote: string;
  lastUpdatedAt: string;
};

export function messageThreadFromTerminalSession(session: TerminalSessionSummary): MessageThread {
  return {
    id: session.id,
    platformThreadId: session.id,
    agentId: session.agentId,
    agentName: session.agentName,
    source: 'platform_rwr',
    title: session.title,
    latestNote: session.latestNote,
    lastUpdatedAt: session.lastUpdatedAt,
  };
}

export function listMessageThreads(sessions: TerminalSessionSummary[]) {
  return sessions.map((session) => messageThreadFromTerminalSession(session));
}
