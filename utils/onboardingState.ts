/**
 * First-open onboarding flag.
 *
 * The welcome screen (app/onboarding) shows exactly once per install. The
 * login screen checks this flag and forwards brand-new users to onboarding;
 * the onboarding screen marks it seen on mount.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_SEEN_KEY = 'regents:onboarding-v1-seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === 'true';
  } catch {
    // If storage is unreadable, skip onboarding rather than trap the user in it.
    return true;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
  } catch {
    // Non-fatal: the worst case is seeing the welcome screen again.
  }
}
