/**
 * Recents and favorites stores for the send-screen recipient picker.
 *
 * Addresses are stored locally only, as plain JSON under two storage keys:
 * - favorites: deduped, ordered by pin time (newest pin first), toggled on/off
 * - recents: an LRU list capped at RECENTS_CAP (most recently used first)
 *
 * Display rules:
 * - recents that are already favorites are filtered out of the recents row
 * - an entry whose catalog record disappeared still renders, falling back to
 *   its stored address as the label instead of vanishing
 *
 * The pure functions below hold all the logic; `createRecipientPickerStore`
 * binds them to any key-value storage (AsyncStorage in the app, an in-memory
 * map in tests).
 */

export const RECENTS_CAP = 5;

export const FAVORITES_STORAGE_KEY = 'recipientPicker.favorites.v1';
export const RECENTS_STORAGE_KEY = 'recipientPicker.recents.v1';

export type StoredRecipient = {
  address: string;
  /** Milliseconds since epoch: pin time for favorites, last use for recents. */
  at: number;
};

export type RecipientDisplayEntry = {
  address: string;
  label: string;
  isFavorite: boolean;
};

export type RecipientCatalog = ReadonlyMap<string, { label: string }>;

type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

function normalizeAddress(address: string) {
  return address.trim();
}

/** Parse a stored JSON list, dropping anything that is not a valid entry. */
export function parseStoredRecipients(raw: string | null): StoredRecipient[] {
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (entry): entry is StoredRecipient =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as StoredRecipient).address === 'string' &&
      (entry as StoredRecipient).address.trim().length > 0 &&
      typeof (entry as StoredRecipient).at === 'number' &&
      Number.isFinite((entry as StoredRecipient).at)
  );
}

/** Toggle a favorite: add (pinned now) if absent, remove if present. */
export function toggleFavorite(favorites: StoredRecipient[], address: string, now = Date.now()): StoredRecipient[] {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return favorites;
  }

  const withoutAddress = favorites.filter((entry) => entry.address !== normalized);
  if (withoutAddress.length < favorites.length) {
    return withoutAddress;
  }

  return [{ address: normalized, at: now }, ...withoutAddress].sort((left, right) => right.at - left.at);
}

/** Record a recipient use: dedupe, move to the front, cap as an LRU. */
export function addRecent(
  recents: StoredRecipient[],
  address: string,
  now = Date.now(),
  cap = RECENTS_CAP
): StoredRecipient[] {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return recents;
  }

  const withoutAddress = recents.filter((entry) => entry.address !== normalized);
  return [{ address: normalized, at: now }, ...withoutAddress].slice(0, cap);
}

/** Recents shown to the user exclude addresses that are already favorites. */
export function visibleRecents(recents: StoredRecipient[], favorites: StoredRecipient[]): StoredRecipient[] {
  const favoriteAddresses = new Set(favorites.map((entry) => entry.address));
  return recents.filter((entry) => !favoriteAddresses.has(entry.address));
}

/**
 * Resolve a stored entry against a catalog of known records. When the
 * catalog record disappeared, the entry still renders with its stored
 * address as the label instead of vanishing.
 */
export function resolveRecipientDisplay(
  entry: StoredRecipient,
  isFavorite: boolean,
  catalog?: RecipientCatalog
): RecipientDisplayEntry {
  const record = catalog?.get(entry.address);
  return {
    address: entry.address,
    label: record?.label || entry.address,
    isFavorite,
  };
}

/** Build the full picker view: favorites first (by pin time), then recents. */
export function buildPickerEntries(input: {
  favorites: StoredRecipient[];
  recents: StoredRecipient[];
  catalog?: RecipientCatalog;
}): RecipientDisplayEntry[] {
  const favorites = [...input.favorites]
    .sort((left, right) => right.at - left.at)
    .map((entry) => resolveRecipientDisplay(entry, true, input.catalog));
  const recents = visibleRecents(input.recents, input.favorites).map((entry) =>
    resolveRecipientDisplay(entry, false, input.catalog)
  );

  return [...favorites, ...recents];
}

export function createRecipientPickerStore(storage: KeyValueStorage) {
  async function readList(key: string): Promise<StoredRecipient[]> {
    return parseStoredRecipients(await storage.getItem(key));
  }

  async function writeList(key: string, list: StoredRecipient[]): Promise<void> {
    await storage.setItem(key, JSON.stringify(list));
  }

  return {
    async getFavorites(): Promise<StoredRecipient[]> {
      return readList(FAVORITES_STORAGE_KEY);
    },

    async getRecents(): Promise<StoredRecipient[]> {
      return readList(RECENTS_STORAGE_KEY);
    },

    async toggleFavorite(address: string, now = Date.now()): Promise<StoredRecipient[]> {
      const next = toggleFavorite(await readList(FAVORITES_STORAGE_KEY), address, now);
      await writeList(FAVORITES_STORAGE_KEY, next);
      return next;
    },

    async recordRecipientUse(address: string, now = Date.now()): Promise<StoredRecipient[]> {
      const next = addRecent(await readList(RECENTS_STORAGE_KEY), address, now);
      await writeList(RECENTS_STORAGE_KEY, next);
      return next;
    },

    async getPickerEntries(catalog?: RecipientCatalog): Promise<RecipientDisplayEntry[]> {
      const [favorites, recents] = await Promise.all([
        readList(FAVORITES_STORAGE_KEY),
        readList(RECENTS_STORAGE_KEY),
      ]);
      return buildPickerEntries({ favorites, recents, catalog });
    },
  };
}

export type RecipientPickerStore = ReturnType<typeof createRecipientPickerStore>;
