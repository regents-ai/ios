import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizeUrl, createUrlLruCache } from '../utils/urlLruCache';

test('canonicalizeUrl lowercases scheme and host', () => {
  assert.equal(canonicalizeUrl('HTTPS://Api.Example.COM/Path?Query=Value'), 'https://api.example.com/Path?Query=Value');
});

test('canonicalizeUrl strips default ports only', () => {
  assert.equal(canonicalizeUrl('https://example.com:443/a'), 'https://example.com/a');
  assert.equal(canonicalizeUrl('http://example.com:80/a'), 'http://example.com/a');
  assert.equal(canonicalizeUrl('https://example.com:8443/a'), 'https://example.com:8443/a');
});

test('canonicalizeUrl drops fragments', () => {
  assert.equal(canonicalizeUrl('https://example.com/a?b=1#section'), 'https://example.com/a?b=1');
});

test('canonicalizeUrl rejects non-http(s) and invalid URLs', () => {
  assert.throws(() => canonicalizeUrl('ftp://example.com/file'), /non-http/);
  assert.throws(() => canonicalizeUrl('javascript:alert(1)'), /non-http/);
  assert.throws(() => canonicalizeUrl('not a url'), /invalid URL/);
});

test('cache treats spelling variants of the same URL as one entry', () => {
  const cache = createUrlLruCache<number>({ maxEntries: 4 });
  cache.set('HTTPS://Example.com:443/a#frag', 1);

  assert.equal(cache.get('https://example.com/a'), 1);
  assert.equal(cache.size, 1);
});

test('cache evicts the least recently used entry at capacity', () => {
  const cache = createUrlLruCache<number>({ maxEntries: 2 });
  cache.set('https://example.com/a', 1);
  cache.set('https://example.com/b', 2);
  cache.set('https://example.com/c', 3);

  assert.equal(cache.has('https://example.com/a'), false);
  assert.equal(cache.get('https://example.com/b'), 2);
  assert.equal(cache.get('https://example.com/c'), 3);
});

test('cache reads refresh recency so hot entries survive eviction', () => {
  const cache = createUrlLruCache<number>({ maxEntries: 2 });
  cache.set('https://example.com/a', 1);
  cache.set('https://example.com/b', 2);

  assert.equal(cache.get('https://example.com/a'), 1);
  cache.set('https://example.com/c', 3);

  assert.equal(cache.has('https://example.com/a'), true);
  assert.equal(cache.has('https://example.com/b'), false);
});

test('cache overwrite replaces the value without growing', () => {
  const cache = createUrlLruCache<number>({ maxEntries: 2 });
  cache.set('https://example.com/a', 1);
  cache.set('https://example.com/a', 9);

  assert.equal(cache.get('https://example.com/a'), 9);
  assert.equal(cache.size, 1);
});

test('cache delete removes canonicalized variants', () => {
  const cache = createUrlLruCache<number>({ maxEntries: 2 });
  cache.set('https://example.com/a', 1);
  cache.delete('HTTPS://EXAMPLE.COM/a');

  assert.equal(cache.has('https://example.com/a'), false);
  assert.equal(cache.size, 0);
});

test('cache rejects a non-positive capacity', () => {
  assert.throws(() => createUrlLruCache({ maxEntries: 0 }), /positive integer/);
});
