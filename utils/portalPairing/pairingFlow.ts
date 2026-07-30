export type PortalPairingPhase =
  | 'loading'
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'completing'
  | 'paired'
  | 'disconnecting';

export type PortalPairingEvent =
  | {
      type: 'statusLoaded';
      paired: boolean;
      replacesStaleAttempt?: boolean;
    }
  | { type: 'start' }
  | { type: 'authorizationReady' }
  | { type: 'callbackReceived' }
  | { type: 'completed' }
  | { type: 'disconnect' }
  | { type: 'failed' }
  | { type: 'disconnected' };

export type PortalPairingOwnerToken = Readonly<{
  userId: string;
  attemptId: number;
}>;

export type PortalPairingOwnerContext = {
  userId: string | null;
  attemptId: number | null;
  mounted: boolean;
  focused: boolean;
};

export type PortalPairingCallback =
  | { kind: 'ok'; code: string; state: string }
  | { kind: 'reject' };

export function reducePortalPairingPhase(
  phase: PortalPairingPhase,
  event: PortalPairingEvent,
): PortalPairingPhase {
  switch (event.type) {
    case 'statusLoaded':
      return phase === 'completing' && !event.replacesStaleAttempt
        ? phase
        : event.paired
          ? 'paired'
          : 'idle';
    case 'start':
      return phase === 'idle' ? 'starting' : phase;
    case 'authorizationReady':
      return phase === 'starting' ? 'waiting' : phase;
    case 'callbackReceived':
      return phase === 'waiting' || phase === 'idle' || phase === 'loading'
        ? 'completing'
        : phase;
    case 'completed':
      return phase === 'completing' ? 'paired' : phase;
    case 'disconnect':
      return phase === 'paired' ? 'disconnecting' : phase;
    case 'failed':
      return 'idle';
    case 'disconnected':
      return phase === 'disconnecting' ? 'idle' : phase;
  }
}

export function capturePortalPairingOwner(
  userId: string | null,
  attemptId: number,
): PortalPairingOwnerToken | null {
  return userId ? { userId, attemptId } : null;
}

export function isPortalPairingOwnerCurrent(
  owner: PortalPairingOwnerToken,
  current: PortalPairingOwnerContext,
) {
  return (
    current.mounted &&
    current.focused &&
    owner.userId === current.userId &&
    owner.attemptId === current.attemptId
  );
}

export async function completePortalPairingForOwner<T>(
  owner: PortalPairingOwnerToken,
  currentOwner: () => PortalPairingOwnerContext,
  complete: () => Promise<T>,
): Promise<
  | { kind: 'completed'; value: T }
  | { kind: 'failed'; error: unknown }
  | { kind: 'stale_before_request' }
  | { kind: 'stale_after_request' }
> {
  if (!isPortalPairingOwnerCurrent(owner, currentOwner())) {
    return { kind: 'stale_before_request' };
  }

  let value: T;
  try {
    value = await complete();
  } catch (error) {
    return isPortalPairingOwnerCurrent(owner, currentOwner())
      ? { kind: 'failed', error }
      : { kind: 'stale_after_request' };
  }
  return isPortalPairingOwnerCurrent(owner, currentOwner())
    ? { kind: 'completed', value }
    : { kind: 'stale_after_request' };
}

export function parsePortalPairingCallbackUrl(
  rawUrl: string,
): PortalPairingCallback {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'reject' };
  }

  if (
    url.protocol !== 'regentsmobile:' ||
    url.hostname !== 'portal-return' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.hash
  ) {
    return { kind: 'reject' };
  }

  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => key !== 'code' && key !== 'state') ||
    url.searchParams.getAll('code').length !== 1 ||
    url.searchParams.getAll('state').length !== 1
  ) {
    return { kind: 'reject' };
  }

  const code = url.searchParams.get('code')?.trim() || '';
  const state = url.searchParams.get('state')?.trim() || '';
  return code && state ? { kind: 'ok', code, state } : { kind: 'reject' };
}
