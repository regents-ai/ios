/**
 * Chosen-path intent carried through sign-in (bd regent-o5by).
 *
 * The first-open welcome screen offers three start paths before the person
 * has signed in. Whichever path they choose is remembered here so that when
 * sign-in completes they land on that path instead of the default agents
 * list. In-memory on purpose: it only needs to survive the sign-in flow
 * within one app run, and a fresh launch should always start clean.
 *
 * All post-sign-in landing points read the same value (peek, not take), so
 * concurrent redirects agree on one destination. AuthGate clears it once the
 * signed-in person has actually arrived somewhere in the app.
 */

export type PostAuthDestination =
  | '/onboarding/connect-hermes'
  | '/onboarding/connect-portal'
  | '/onboarding/create-cloud-agent'
  | '/(tabs)/wallet';

const DEFAULT_LANDING = '/agents' as const;

let pendingDestination: PostAuthDestination | null = null;

export function setPostAuthDestination(destination: PostAuthDestination) {
  pendingDestination = destination;
}

export function clearPostAuthDestination() {
  pendingDestination = null;
}

/** Where sign-in should land: the chosen path if one is pending, else the agents list. */
export function resolvePostAuthLanding(): PostAuthDestination | typeof DEFAULT_LANDING {
  return pendingDestination ?? DEFAULT_LANDING;
}
