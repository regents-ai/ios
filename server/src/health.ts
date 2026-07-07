/**
 * Liveness vs readiness:
 * - `/healthz` (liveness): the process is up and serving HTTP.
 * - `/readyz` (readiness): hard dependencies still answer. Redis is the
 *   only post-boot dependency that can die silently (APNs and Redis are
 *   validated at startup in release runtime), so readiness PINGs Redis with a
 *   short timeout. The Fly health check targets readiness so a machine whose
 *   Redis connection is gone is marked unhealthy instead of silently serving
 *   errors.
 */

export type RedisPing = () => Promise<unknown>;

export type ReadinessResult = {
  ok: boolean;
  redis: 'ok' | 'unreachable' | 'not_configured';
};

/** Keep well under the Fly check timeout (5s in fly.toml). */
export const READINESS_PING_TIMEOUT_MS = 2000;

export async function checkReadiness(input: {
  redisPing: RedisPing | null;
  pingTimeoutMs?: number;
}): Promise<ReadinessResult> {
  if (!input.redisPing) {
    // Local dev runs on in-memory storage; release runtime refuses to boot
    // without Redis, so a running release process always has a ping to try.
    return { ok: true, redis: 'not_configured' };
  }

  const timeoutMs = input.pingTimeoutMs ?? READINESS_PING_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      input.redisPing(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Redis PING timed out')), timeoutMs);
      }),
    ]);
    return { ok: true, redis: 'ok' };
  } catch {
    return { ok: false, redis: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
