import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createScrollMetricsCoalescer,
  scrollMetricsEqual,
  type ScrollMetrics,
} from '../utils/scrollMetricsDelivery';

function manualFrames() {
  const queue = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    schedule: (callback: () => void) => {
      const handle = nextHandle++;
      queue.set(handle, callback);
      return handle;
    },
    cancel: (handle: number) => {
      queue.delete(handle);
    },
    runFrame: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback());
    },
    pendingCount: () => queue.size,
  };
}

test('many pushes in one frame deliver once, with the latest metrics', () => {
  const frames = manualFrames();
  const delivered: ScrollMetrics[] = [];
  const coalescer = createScrollMetricsCoalescer((m) => delivered.push(m), frames.schedule, frames.cancel);

  coalescer.push({ distanceFromBottom: 300 });
  coalescer.push({ distanceFromBottom: 200 });
  coalescer.push({ distanceFromBottom: 120 });
  assert.equal(delivered.length, 0);
  assert.equal(frames.pendingCount(), 1);

  frames.runFrame();
  assert.deepEqual(delivered, [{ distanceFromBottom: 120 }]);
});

test('unchanged metrics are deduped, changed metrics are delivered', () => {
  const frames = manualFrames();
  const delivered: ScrollMetrics[] = [];
  const coalescer = createScrollMetricsCoalescer((m) => delivered.push(m), frames.schedule, frames.cancel);

  coalescer.push({ distanceFromBottom: 100 });
  frames.runFrame();
  coalescer.push({ distanceFromBottom: 100.2 }); // sub-pixel jitter
  frames.runFrame();
  coalescer.push({ distanceFromBottom: 40 });
  frames.runFrame();

  assert.deepEqual(delivered, [{ distanceFromBottom: 100 }, { distanceFromBottom: 40 }]);
});

test('cancel drops the pending frame and its metrics', () => {
  const frames = manualFrames();
  const delivered: ScrollMetrics[] = [];
  const coalescer = createScrollMetricsCoalescer((m) => delivered.push(m), frames.schedule, frames.cancel);

  coalescer.push({ distanceFromBottom: 10 });
  coalescer.cancel();
  frames.runFrame();
  assert.equal(delivered.length, 0);

  // Still usable after cancel.
  coalescer.push({ distanceFromBottom: 5 });
  frames.runFrame();
  assert.deepEqual(delivered, [{ distanceFromBottom: 5 }]);
});

test('scrollMetricsEqual treats sub-pixel differences as equal', () => {
  assert.equal(scrollMetricsEqual({ distanceFromBottom: 1 }, { distanceFromBottom: 1.4 }), true);
  assert.equal(scrollMetricsEqual({ distanceFromBottom: 1 }, { distanceFromBottom: 2 }), false);
  assert.equal(scrollMetricsEqual(null, null), true);
  assert.equal(scrollMetricsEqual(null, { distanceFromBottom: 0 }), false);
});
