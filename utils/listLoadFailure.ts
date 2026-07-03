/**
 * Classify a list-load failure for the contextual retry row.
 *
 * Connectivity failures (device offline, host unreachable) get fixed
 * "can't reach the network" copy; real server errors surface the
 * server-provided message so the user sees what actually went wrong.
 */

export type ListLoadFailure = {
  offline: boolean;
  title: string;
  message: string;
};

// React Native's fetch rejects with a TypeError ("Network request failed")
// when the device cannot reach the host at all.
const OFFLINE_MESSAGE_PATTERN =
  /network request failed|failed to fetch|internet connection|appears to be offline|could not connect|network error|timed out/i;

export function describeListLoadFailure(error: unknown, fallbackMessage: string): ListLoadFailure {
  const rawMessage = error instanceof Error ? error.message : '';
  const offline = error instanceof TypeError || OFFLINE_MESSAGE_PATTERN.test(rawMessage);

  if (offline) {
    return {
      offline: true,
      title: "Can't reach the network",
      message: 'Check your connection and try again.',
    };
  }

  return {
    offline: false,
    title: 'Something went wrong',
    message: rawMessage || fallbackMessage,
  };
}
