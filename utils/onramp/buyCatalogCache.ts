/**
 * Short-lived cache for the onramp buy catalog (payment config and purchase
 * currency metadata, including asset and network icon URLs).
 *
 * The buy form refetches this catalog every time it mounts, and mounts can
 * fire back-to-back, so identical requests were double-fetched. Entries are
 * keyed by a canonicalized URL that names the catalog resource. The in-flight
 * promise itself is cached, which also deduplicates concurrent requests;
 * failed requests are evicted immediately so a retry always refetches.
 */

import { createUrlLruCache } from '@/utils/urlLruCache';

const CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_ENTRIES = 8;

type CatalogEntry = {
  promise: Promise<unknown>;
  expiresAt: number;
};

const catalogCache = createUrlLruCache<CatalogEntry>({ maxEntries: MAX_CATALOG_ENTRIES });

export function getCachedCatalogRequest<T>(cacheUrl: string, load: () => Promise<T>): Promise<T> {
  const existing = catalogCache.get(cacheUrl);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise as Promise<T>;
  }

  const promise = load();
  catalogCache.set(cacheUrl, { promise, expiresAt: Date.now() + CATALOG_TTL_MS });

  promise.catch(() => {
    catalogCache.delete(cacheUrl);
  });

  return promise;
}
