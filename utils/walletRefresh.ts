/**
 * Wallet refresh-request bridge.
 *
 * Out-of-band wallet activity (e.g. tapping an onramp push notification)
 * requests a balance refresh here instead of reaching into wallet state
 * directly. The wallet details hook drains the request when mounted and
 * refetches balances. Each request carries an idempotency key (the
 * notification key), so a source that re-fires never refreshes twice.
 */

type Listener = () => void;

let pendingRefresh = false;
const consumedKeys = new Set<string>();
const listeners = new Set<Listener>();

export function requestWalletRefresh(key: string): void {
  if (consumedKeys.has(key)) {
    return;
  }
  consumedKeys.add(key);
  pendingRefresh = true;
  listeners.forEach((listener) => listener());
}

/** Drains the pending request: returns true at most once per request. */
export function consumeWalletRefreshRequest(): boolean {
  const requested = pendingRefresh;
  pendingRefresh = false;
  return requested;
}

export function subscribeWalletRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset of the module singleton. */
export function resetWalletRefreshForTest(): void {
  pendingRefresh = false;
  consumedKeys.clear();
  listeners.clear();
}
