import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addRecent,
  buildPickerEntries,
  createRecipientPickerStore,
  parseStoredRecipients,
  RECENTS_CAP,
  resolveRecipientDisplay,
  toggleFavorite,
  visibleRecents,
} from '../utils/recipientPickerStore';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    async getItem(key: string) {
      return map.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      map.set(key, value);
    },
    map,
  };
}

test('toggleFavorite adds, dedupes, and orders by pin time (newest first)', () => {
  let favorites = toggleFavorite([], A, 100);
  favorites = toggleFavorite(favorites, B, 200);

  assert.deepEqual(
    favorites.map((entry) => entry.address),
    [B, A]
  );

  // Toggling an existing favorite does not duplicate it — it removes it.
  favorites = toggleFavorite(favorites, A, 300);
  assert.deepEqual(
    favorites.map((entry) => entry.address),
    [B]
  );
});

test('addRecent behaves as an LRU capped at the recents limit', () => {
  let recents: ReturnType<typeof addRecent> = [];
  for (let index = 0; index < RECENTS_CAP + 2; index += 1) {
    recents = addRecent(recents, `0x${String(index).padStart(40, '0')}`, index);
  }

  assert.equal(recents.length, RECENTS_CAP);
  assert.equal(recents[0].address, `0x${String(RECENTS_CAP + 1).padStart(40, '0')}`);

  // Reusing an address moves it to the front without duplicating it.
  const reused = recents[recents.length - 1].address;
  recents = addRecent(recents, reused, 999);
  assert.equal(recents[0].address, reused);
  assert.equal(recents.filter((entry) => entry.address === reused).length, 1);
});

test('recents already pinned as favorites are hidden from the recents row', () => {
  const favorites = toggleFavorite([], A, 100);
  let recents = addRecent([], A, 200);
  recents = addRecent(recents, B, 300);

  assert.deepEqual(
    visibleRecents(recents, favorites).map((entry) => entry.address),
    [B]
  );
});

test('an entry whose catalog record disappeared still renders with its address', () => {
  const catalog = new Map([[A, { label: 'Studio agent' }]]);

  const known = resolveRecipientDisplay({ address: A, at: 1 }, true, catalog);
  assert.equal(known.label, 'Studio agent');

  const orphaned = resolveRecipientDisplay({ address: B, at: 2 }, false, catalog);
  assert.equal(orphaned.label, B);
});

test('buildPickerEntries lists favorites by pin time, then filtered recents', () => {
  let favorites = toggleFavorite([], A, 100);
  favorites = toggleFavorite(favorites, B, 200);
  let recents = addRecent([], A, 300);
  recents = addRecent(recents, C, 400);

  const entries = buildPickerEntries({ favorites, recents });

  assert.deepEqual(
    entries.map((entry) => [entry.address, entry.isFavorite]),
    [
      [B, true],
      [A, true],
      [C, false],
    ]
  );
});

test('parseStoredRecipients drops corrupt payloads and malformed entries', () => {
  assert.deepEqual(parseStoredRecipients(null), []);
  assert.deepEqual(parseStoredRecipients('not json'), []);
  assert.deepEqual(parseStoredRecipients('{"nope":true}'), []);

  const mixed = JSON.stringify([
    { address: A, at: 1 },
    { address: '', at: 2 },
    { address: B },
    { at: 3 },
    null,
    'junk',
  ]);
  assert.deepEqual(parseStoredRecipients(mixed), [{ address: A, at: 1 }]);
});

test('store round-trips favorites and recents through injected storage', async () => {
  const storage = createMemoryStorage();
  const store = createRecipientPickerStore(storage);

  await store.toggleFavorite(A, 100);
  await store.recordRecipientUse(A, 200);
  await store.recordRecipientUse(B, 300);

  const entries = await store.getPickerEntries();
  assert.deepEqual(
    entries.map((entry) => [entry.address, entry.isFavorite]),
    [
      [A, true],
      [B, false],
    ]
  );

  // A second store over the same storage sees the persisted state.
  const rehydrated = createRecipientPickerStore(storage);
  assert.deepEqual(
    (await rehydrated.getFavorites()).map((entry) => entry.address),
    [A]
  );
});
