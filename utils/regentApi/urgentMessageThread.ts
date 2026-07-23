import type { MessageThread } from '@/types/regents';

function urgencyRank(thread: MessageThread) {
  if (thread.pendingApproval && !thread.pendingApproval.resolved) return 0;
  if (thread.status === 'waiting') return 1;
  if (thread.status === 'failed') return 2;
  if (thread.status === 'running') return 3;
  return 4;
}

function updatedAtMs(thread: MessageThread) {
  const value = new Date(thread.lastUpdatedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

/**
 * Uses the inbox priority order, then chooses the most recently updated
 * thread within the highest-priority group.
 */
export function resolveUrgentMessageThread(
  threads: readonly MessageThread[]
): MessageThread | null {
  let urgent: MessageThread | null = null;

  for (const thread of threads) {
    if (
      urgent === null ||
      urgencyRank(thread) < urgencyRank(urgent) ||
      (urgencyRank(thread) === urgencyRank(urgent) &&
        updatedAtMs(thread) > updatedAtMs(urgent))
    ) {
      urgent = thread;
    }
  }

  return urgent;
}
