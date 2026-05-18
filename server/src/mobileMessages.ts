import { createJsonFileStore } from './jsonFileStore.js';
import type { TerminalSessionSummary } from './mobileTerminal.js';

export type XmtpConversationKind = 'dm' | 'group';
export type XmtpEnvironment = 'dev' | 'production';

export type XmtpConversationLink = {
  conversationId: string;
  conversationKind: XmtpConversationKind;
  environment: XmtpEnvironment;
  linkedAt: string;
};

export type MessageThread = {
  id: string;
  platformThreadId: string;
  agentId: string;
  agentName: string;
  source: 'platform_rwr';
  title: string;
  latestNote: string;
  lastUpdatedAt: string;
  xmtpLinks: XmtpConversationLink[];
};

export type PhoneXmtpIdentity = {
  inboxId: string;
  installationId: string;
  walletAddress: string;
  environment: XmtpEnvironment;
  registeredAt: string;
};

export type AgentXmtpIdentity = {
  agentId: string;
  inboxId: string;
  walletAddress: string;
  environment: XmtpEnvironment;
  displayName?: string;
};

type MobileMessageStoreState = {
  phoneXmtpIdentities: Record<string, PhoneXmtpIdentity>;
  agentXmtpIdentities: Record<string, AgentXmtpIdentity>;
  threadXmtpLinks: Record<string, XmtpConversationLink[]>;
};

const mobileMessageStore = createJsonFileStore<MobileMessageStoreState>('mobile-message-state.json', () => ({
  phoneXmtpIdentities: {},
  agentXmtpIdentities: {},
  threadXmtpLinks: {},
}));

function userScopedKey(userId: string, id: string) {
  return `${userId}:${id}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

export function messageThreadFromTerminalSession(userId: string, session: TerminalSessionSummary): MessageThread {
  return {
    id: session.id,
    platformThreadId: session.id,
    agentId: session.agentId,
    agentName: session.agentName,
    source: 'platform_rwr',
    title: session.title,
    latestNote: session.latestNote,
    lastUpdatedAt: session.lastUpdatedAt,
    xmtpLinks: cloneJson(mobileMessageStore.read().threadXmtpLinks[userScopedKey(userId, session.id)] || []),
  };
}

export function listMessageThreadsForUser(userId: string, sessions: TerminalSessionSummary[]) {
  return sessions.map((session) => messageThreadFromTerminalSession(userId, session));
}

export function registerPhoneXmtpIdentityForUser(
  userId: string,
  input: Pick<PhoneXmtpIdentity, 'inboxId' | 'installationId' | 'walletAddress' | 'environment'>,
) {
  const identity: PhoneXmtpIdentity = {
    ...input,
    registeredAt: nowIso(),
  };
  mobileMessageStore.update((state) => {
    state.phoneXmtpIdentities[userId] = identity;
  });

  return cloneJson(identity);
}

export function getPhoneXmtpIdentityForUser(userId: string) {
  const identity = mobileMessageStore.read().phoneXmtpIdentities[userId];
  return identity ? cloneJson(identity) : null;
}

export function listPhoneXmtpIdentitiesForContacts() {
  return Object.entries(mobileMessageStore.read().phoneXmtpIdentities).map(([userId, identity]) => ({
    userId,
    identity: cloneJson(identity),
  }));
}

export function getAgentXmtpIdentityForUser(userId: string, agentId: string) {
  const identity = mobileMessageStore.read().agentXmtpIdentities[userScopedKey(userId, agentId)];
  return identity ? cloneJson(identity) : null;
}

export function linkXmtpConversationToThread(
  userId: string,
  threadId: string,
  input: { conversationId: string; conversationKind: XmtpConversationKind; environment: XmtpEnvironment },
): { kind: 'ok'; links: XmtpConversationLink[] } | { kind: 'conflict' } {
  const state = mobileMessageStore.read();
  const threadKey = userScopedKey(userId, threadId);
  const linkedElsewhere = Object.entries(state.threadXmtpLinks).some(
    ([key, links]) =>
      key !== threadKey &&
      links.some((link) => link.conversationId === input.conversationId && link.environment === input.environment),
  );

  if (linkedElsewhere) {
    return { kind: 'conflict' };
  }

  const currentLinks = state.threadXmtpLinks[threadKey] || [];
  const existing = currentLinks.find(
    (link) => link.conversationId === input.conversationId && link.environment === input.environment,
  );
  if (existing) {
    return { kind: 'ok', links: cloneJson(currentLinks) };
  }

  const nextLink: XmtpConversationLink = {
    ...input,
    linkedAt: nowIso(),
  };
  const nextLinks = [...currentLinks, nextLink];
  mobileMessageStore.update((nextState) => {
    nextState.threadXmtpLinks[threadKey] = nextLinks;
  });

  return { kind: 'ok', links: cloneJson(nextLinks) };
}

export function resetMobileMessageStateForTests() {
  mobileMessageStore.reset();
}
