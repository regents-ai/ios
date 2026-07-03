/**
 * URL-keyed LRU cache.
 *
 * Keys are canonicalized URLs so trivially different spellings of the same
 * resource ("HTTPS://Host:443/path#frag" vs "https://host/path") share one
 * cache entry instead of double-fetching. The cache is a plain Map whose
 * insertion order doubles as the LRU order: reads re-insert the entry, and
 * writes evict the oldest entry once the cache is over capacity.
 */

const DEFAULT_HTTP_PORT = '80';
const DEFAULT_HTTPS_PORT = '443';

/**
 * Canonicalize an absolute http(s) URL for use as a cache key.
 *
 * - lowercases the scheme and host (WHATWG URL parsing guarantees this)
 * - strips default ports (80 for http, 443 for https)
 * - drops the fragment
 * - rejects anything that is not absolute http(s)
 */
export function canonicalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Cannot cache an invalid URL: ${input}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Cannot cache a non-http(s) URL: ${input}`);
  }

  if (
    (url.protocol === 'http:' && url.port === DEFAULT_HTTP_PORT) ||
    (url.protocol === 'https:' && url.port === DEFAULT_HTTPS_PORT)
  ) {
    url.port = '';
  }

  url.hash = '';
  return url.toString();
}

export type UrlLruCache<T> = {
  get(url: string): T | undefined;
  set(url: string, value: T): void;
  delete(url: string): void;
  has(url: string): boolean;
  readonly size: number;
};

export function createUrlLruCache<T>({ maxEntries }: { maxEntries: number }): UrlLruCache<T> {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error('maxEntries must be a positive integer.');
  }

  const entries = new Map<string, T>();

  return {
    get(url: string): T | undefined {
      const key = canonicalizeUrl(url);
      if (!entries.has(key)) {
        return undefined;
      }

      // Re-insert to mark this entry as most recently used.
      const value = entries.get(key) as T;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },

    set(url: string, value: T): void {
      const key = canonicalizeUrl(url);
      entries.delete(key);
      entries.set(key, value);

      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value as string;
        entries.delete(oldestKey);
      }
    },

    delete(url: string): void {
      entries.delete(canonicalizeUrl(url));
    },

    has(url: string): boolean {
      return entries.has(canonicalizeUrl(url));
    },

    get size(): number {
      return entries.size;
    },
  };
}
