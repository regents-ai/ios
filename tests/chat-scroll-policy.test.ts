import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createChatScrollState,
  followBottomThreshold,
  jumpToLatest,
  noteUserScrollStart,
  shouldAutoScroll,
  shouldShowJumpToLatest,
  trackChatScroll,
} from '../utils/chatScrollPolicy';

test('pinned-to-bottom threshold widens while streaming', () => {
  assert.equal(followBottomThreshold(false), 80);
  assert.equal(followBottomThreshold(true), 160);
});

test('leaving the bottom requires hysteresis beyond the threshold', () => {
  const following = createChatScrollState();

  assert.equal(trackChatScroll(following, { distanceFromBottom: 0, streaming: false }).mode, 'following');
  assert.equal(trackChatScroll(following, { distanceFromBottom: 80, streaming: false }).mode, 'following');
  assert.equal(trackChatScroll(following, { distanceFromBottom: 144, streaming: false }).mode, 'following');
  assert.equal(trackChatScroll(following, { distanceFromBottom: 145, streaming: false }).mode, 'readingOlder');

  assert.equal(trackChatScroll(following, { distanceFromBottom: 224, streaming: true }).mode, 'following');
  assert.equal(trackChatScroll(following, { distanceFromBottom: 225, streaming: true }).mode, 'readingOlder');
});

test('returning within the threshold re-pins to the bottom', () => {
  const readingOlder = trackChatScroll(createChatScrollState(), {
    distanceFromBottom: 400,
    streaming: false,
  });
  assert.equal(readingOlder.mode, 'readingOlder');

  assert.equal(trackChatScroll(readingOlder, { distanceFromBottom: 81, streaming: false }).mode, 'readingOlder');
  assert.equal(trackChatScroll(readingOlder, { distanceFromBottom: 80, streaming: false }).mode, 'following');
  assert.equal(trackChatScroll(readingOlder, { distanceFromBottom: 160, streaming: true }).mode, 'following');
});

test('scroll samples that change nothing return the same state object', () => {
  const following = createChatScrollState();
  assert.equal(trackChatScroll(following, { distanceFromBottom: 20, streaming: false }), following);

  const readingOlder = trackChatScroll(following, { distanceFromBottom: 400, streaming: false });
  assert.equal(trackChatScroll(readingOlder, { distanceFromBottom: 400, streaming: false }), readingOlder);
});

test('a user touch pauses auto-scroll for the cooldown window', () => {
  const touched = noteUserScrollStart(createChatScrollState(), 1_000);

  assert.equal(shouldAutoScroll(touched, 1_000), false);
  assert.equal(shouldAutoScroll(touched, 1_249), false);
  assert.equal(shouldAutoScroll(touched, 1_250), true);
});

test('auto-scroll only runs while following the bottom', () => {
  const following = createChatScrollState();
  assert.equal(shouldAutoScroll(following, 0), true);

  const readingOlder = trackChatScroll(following, { distanceFromBottom: 400, streaming: false });
  assert.equal(shouldAutoScroll(readingOlder, Number.MAX_SAFE_INTEGER), false);
});

test('jump-to-latest re-follows immediately and bypasses the touch cooldown', () => {
  const readingOlder = trackChatScroll(createChatScrollState(), {
    distanceFromBottom: 400,
    streaming: false,
  });
  const touched = noteUserScrollStart(readingOlder, 5_000);
  const jumped = jumpToLatest(touched);

  assert.equal(jumped.mode, 'following');
  assert.equal(shouldAutoScroll(jumped, 5_001), true);
  assert.equal(shouldShowJumpToLatest(jumped), false);
});

test('jump pill shows only while reading older messages', () => {
  const following = createChatScrollState();
  assert.equal(shouldShowJumpToLatest(following), false);

  const readingOlder = trackChatScroll(following, { distanceFromBottom: 400, streaming: false });
  assert.equal(shouldShowJumpToLatest(readingOlder), true);

  const rePinned = trackChatScroll(readingOlder, { distanceFromBottom: 0, streaming: false });
  assert.equal(shouldShowJumpToLatest(rePinned), false);
});
