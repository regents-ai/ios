/**
 * Chosen-path intent carried through sign-in.
 *
 * The first-open welcome screen offers three start paths before the person
 * has signed in. Whichever path they choose is remembered here so that when
 * sign-in completes they land on that path instead of Home. In-memory on
 * purpose: it only needs to survive the sign-in flow within one app run, and
 * a fresh launch should always start clean.
 *
 * All post-sign-in landing points read the same value (peek, not take), so
 * concurrent redirects agree on one destination. AuthGate clears it once the
 * signed-in person has actually arrived somewhere in the app.
 */

export type PostAuthDestination =
  | '/agent/add'
  | '/onboarding/connect-portal'
  | '/onboarding/create-cloud-agent'
  | '/(tabs)/wallet';

const DEFAULT_LANDING = '/' as const;

let pendingDestination: PostAuthDestination | null = null;

export function setPostAuthDestination(destination: PostAuthDestination) {
  pendingDestination = destination;
}

export function clearPostAuthDestination() {
  pendingDestination = null;
}

/** Where sign-in should land: the chosen path if one is pending, else Home. */
export function resolvePostAuthLanding(): PostAuthDestination | typeof DEFAULT_LANDING {
  return pendingDestination ?? DEFAULT_LANDING;
}

type LandingRouter = {
  replace(href: '/(tabs)/agents' | PostAuthDestination | typeof DEFAULT_LANDING): void;
  push(href: '/agent/add'): void;
};

/**
 * Moves a freshly signed-in person to their landing. "Add an agent" is a
 * screen pushed over the agents tab, so Back returns to the list and the tab
 * bar stays underneath; every other landing replaces the sign-in screen.
 */
export function landAfterSignIn(router: LandingRouter) {
  const landing = resolvePostAuthLanding();
  if (landing === '/agent/add') {
    router.replace('/(tabs)/agents');
    router.push('/agent/add');
    return;
  }
  router.replace(landing);
}
