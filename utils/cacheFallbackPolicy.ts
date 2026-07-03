/**
 * Cache-fallback gate + read-only cached mode.
 *
 * Adapted from hermex CacheFallbackPolicy.swift. When a fresh fetch fails, the
 * app may show the last cached snapshot ONLY for connectivity drops and
 * transient server errors (5xx) — never for 4xx, which mean the request itself
 * was rejected and cached data would be misleading. While showing cached data
 * the app is read-only: mutations are disabled and the data is labeled stale.
 *
 * This is an offline/read-only-cache product feature. It does not detect,
 * tolerate, or branch on any legacy/old data shape — it only decides, per
 * failure, whether the last good snapshot may stand in for a failed refresh.
 *
 * Pure policy, no React or storage, so the gate is unit-testable.
 */

import { ApiError } from '@/utils/apiError';

/** Whether a failed refresh is eligible to fall back to cached data. */
export function mayFallBackToCache(error: unknown): boolean {
  // A network drop (fetch rejects with TypeError) is always eligible.
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof ApiError) {
    // Our fetch layer classifies connectivity drops as 'network'.
    if (error.kind === 'network') {
      return true;
    }
    // Transient server errors only. A 4xx is a rejected request, never cached.
    return error.status !== null && error.status >= 500;
  }

  return false;
}

export type CacheMode = 'live' | 'cached';

export type CacheGateResult<T> = {
  data: T;
  mode: CacheMode;
};

/**
 * Resolves what to show after a refresh. On success, live data. On an eligible
 * failure with a cached snapshot, the cached snapshot in read-only mode. On an
 * ineligible failure, or with no cache, the error propagates (returns null).
 */
export function resolveCacheGate<T>(
  outcome: { ok: true; data: T } | { ok: false; error: unknown },
  cached: T | null
): CacheGateResult<T> | null {
  if (outcome.ok) {
    return { data: outcome.data, mode: 'live' };
  }

  if (cached !== null && mayFallBackToCache(outcome.error)) {
    return { data: cached, mode: 'cached' };
  }

  return null;
}

/** Mutations are only allowed against live data, never a cached snapshot. */
export function mutationsAllowed(mode: CacheMode): boolean {
  return mode === 'live';
}

/** Unmistakable stale label for cached values. */
export const CACHED_MODE_BANNER = 'Offline — showing your last saved view. Values may be out of date.';
