/**
 * Pending-route intent bridge.
 *
 * Adapted from hermex AppIntentRouter.swift: every out-of-band launch source
 * (push notifications, quick actions, widgets) writes a single pending route
 * into one store instead of navigating directly. The root layout drains it
 * exactly once when navigation is ready, which kills the cold/warm launch race
 * where a source fires before the router is mounted.
 *
 * Idempotency: each intent carries a key; the same key never routes twice, so
 * a source that re-fires (e.g. getLastNotificationResponse plus the live
 * listener) is harmless.
 */

import type { Href } from 'expo-router';

export type PendingRouteIntent = {
  /** Stable idempotency key for this intent (e.g. notification id). */
  key: string;
  href: Href;
};

type Listener = () => void;

let pending: PendingRouteIntent | null = null;
const consumedKeys = new Set<string>();
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

/**
 * Records an out-of-band navigation intent. A no-op if this key was already
 * consumed or is already the pending intent. The newest un-consumed intent
 * wins if several arrive before the drain.
 */
export function setPendingRoute(intent: PendingRouteIntent): void {
  if (consumedKeys.has(intent.key) || pending?.key === intent.key) {
    return;
  }
  pending = intent;
  notify();
}

/** The current pending intent, or null. */
export function peekPendingRoute(): PendingRouteIntent | null {
  return pending;
}

/**
 * Drains the pending intent exactly once: marks its key consumed, clears it,
 * and returns it so the caller can navigate. Returns null when nothing pends.
 */
export function drainPendingRoute(): PendingRouteIntent | null {
  const intent = pending;
  if (!intent) {
    return null;
  }
  consumedKeys.add(intent.key);
  pending = null;
  notify();
  return intent;
}

export function subscribePendingRoute(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Starts draining pending routes into `navigate`. Drains anything already
 * queued (the cold-launch race: a source fired before navigation was ready),
 * then drains each subsequent intent once as it arrives. Returns an
 * unsubscribe. This is the drain-on-ready logic the root drainer component
 * runs; extracted so the cold-launch seam is testable without a renderer.
 */
export function startPendingRouteDrain(navigate: (href: PendingRouteIntent['href']) => void): () => void {
  const drain = () => {
    const intent = drainPendingRoute();
    if (intent) {
      navigate(intent.href);
    }
  };

  if (peekPendingRoute()) {
    drain();
  }
  return subscribePendingRoute(drain);
}

/** Test-only reset of the module singleton. */
export function resetPendingRouteForTest(): void {
  pending = null;
  consumedKeys.clear();
  listeners.clear();
}
