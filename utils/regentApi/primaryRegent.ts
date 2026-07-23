import type { RegentSummary } from '@/types/regents';

function commandCenterPriority(regent: RegentSummary) {
  if (regent.runtimeStatus === 'offline') return 0;
  if (regent.status === 'attention') return 1;
  if (regent.runtimeStatus === 'waiting') return 2;
  if (regent.status === 'paused') return 3;
  return 4;
}

export function compareRegentsByCommandCenterPriority(
  left: RegentSummary,
  right: RegentSummary
) {
  const priorityDifference =
    commandCenterPriority(left) - commandCenterPriority(right);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return (
    new Date(right.lastActiveAt).getTime() -
    new Date(left.lastActiveAt).getTime()
  );
}

export function resolvePrimaryRegent(
  regents: readonly RegentSummary[]
): RegentSummary | null {
  return [...regents].sort(compareRegentsByCommandCenterPriority)[0] ?? null;
}
