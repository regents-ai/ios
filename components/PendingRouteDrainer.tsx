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

import { drainPendingRoute, peekPendingRoute, subscribePendingRoute } from '@/utils/pendingRoute';

export function PendingRouteDrainer() {
  const router = useRouter();

  useEffect(() => {
    const drain = () => {
      const intent = drainPendingRoute();
      if (intent) {
        router.push(intent.href);
      }
    };

    // Drain anything queued before mount (cold-launch race), then live updates.
    if (peekPendingRoute()) {
      drain();
    }
    return subscribePendingRoute(drain);
  }, [router]);

  return null;
}
