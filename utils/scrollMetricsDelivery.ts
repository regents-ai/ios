/**
 * Coalesced, deduped scroll-metrics delivery.
 *
 * Ported near-verbatim from hermex ChatTranscriptSupportingViews.swift:4-204:
 * raw scroll callbacks can fire several times per frame, so metrics are
 * computed at most once per frame (latest event wins) and delivered only when
 * they actually changed. Follow-state stays in the caller's ref — delivery
 * never forces a render by itself.
 */

export type ScrollMetrics = {
  /** Distance in px between the viewport bottom and the content bottom. */
  distanceFromBottom: number;
};

/** Sub-pixel jitter is noise, not a change worth delivering. */
const METRICS_EPSILON = 0.5;

export function scrollMetricsEqual(a: ScrollMetrics | null, b: ScrollMetrics | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return Math.abs(a.distanceFromBottom - b.distanceFromBottom) < METRICS_EPSILON;
}

type FrameScheduler = (callback: () => void) => number;
type FrameCanceller = (handle: number) => void;

export type ScrollMetricsCoalescer = {
  /** Records the latest raw metrics; at most one delivery happens per frame. */
  push: (metrics: ScrollMetrics) => void;
  /** Drops any pending frame. Call on unmount. */
  cancel: () => void;
};

export function createScrollMetricsCoalescer(
  deliver: (metrics: ScrollMetrics) => void,
  schedule: FrameScheduler = requestAnimationFrame,
  cancelFrame: FrameCanceller = cancelAnimationFrame
): ScrollMetricsCoalescer {
  let pending: ScrollMetrics | null = null;
  let delivered: ScrollMetrics | null = null;
  let frameHandle: number | null = null;

  const flush = () => {
    frameHandle = null;
    if (pending === null || scrollMetricsEqual(pending, delivered)) {
      pending = null;
      return;
    }

    delivered = pending;
    pending = null;
    deliver(delivered);
  };

  return {
    push(metrics) {
      pending = metrics;
      if (frameHandle === null) {
        frameHandle = schedule(flush);
      }
    },
    cancel() {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      pending = null;
    },
  };
}
