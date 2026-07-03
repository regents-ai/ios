/**
 * PendingRouteDrainer - single owner that navigates pending route intents.
 *
 * Adapted from hermex AppIntentRouter.swift. Every out-of-band source writes
 * into the pending-route store; this one component drains it once navigation
 * is mounted, so a cold launch that fired an intent before the router existed
 * still lands on the right screen. Mount once at the app root.
 */

import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { startPendingRouteDrain } from '@/utils/pendingRoute';

export function PendingRouteDrainer() {
  const router = useRouter();

  // Drain-on-ready: anything queued before mount (cold-launch race) plus live
  // updates. The logic lives in the store so the seam is unit-testable.
  useEffect(() => startPendingRouteDrain((href) => router.push(href)), [router]);

  return null;
}
