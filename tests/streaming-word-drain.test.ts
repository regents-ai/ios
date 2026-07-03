import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORD_DRAIN_MAX_LAG_MS,
  drainQuota,
  splitAtUnitBoundary,
  unitCount,
} from '../utils/streamingWordDrain';

const FAMILY = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}'; // 👨‍👩‍👧‍👦 (ZWJ sequence)
const THUMBS_UP_MEDIUM = '\u{1F44D}\u{1F3FD}'; // 👍🏽 (skin-tone modifier)
const MATH_SCRIPT = '\u{1D518}\u{1D52B}\u{1D526}'; // 𝔘𝔫𝔦 (surrogate pairs)

const SAMPLE_TEXTS = [
  '',
  ' ',
  'hello',
  'hello world',
  '  leading and trailing  ',
  'line one\nline two\n\tindented',
  `Great ${THUMBS_UP_MEDIUM} job`,
  `${FAMILY} arrives home`,
  `${MATH_SCRIPT}code mixes ${FAMILY}${THUMBS_UP_MEDIUM} clusters`,
  'multiple   spaces\t\tbetween    words',
  '句読点、そして改行\nもある文章です',
];

test('unitCount counts maximal non-whitespace runs', () => {
  assert.equal(unitCount(''), 0);
  assert.equal(unitCount('   \n\t '), 0);
  assert.equal(unitCount('hello'), 1);
  assert.equal(unitCount('hello world'), 2);
  assert.equal(unitCount('  spaced   out  '), 2);
  assert.equal(unitCount('a\nb\tc d'), 4);
});

test('unitCount treats emoji clusters as part of their word unit', () => {
  assert.equal(unitCount(`Great ${THUMBS_UP_MEDIUM} job`), 3);
  assert.equal(unitCount(`${FAMILY} arrives`), 2);
  assert.equal(unitCount(`${FAMILY}${THUMBS_UP_MEDIUM}`), 1);
});

test('splitAtUnitBoundary clamps below zero and beyond the unit count', () => {
  assert.deepEqual(splitAtUnitBoundary('hello world', 0), { head: '', tail: 'hello world' });
  assert.deepEqual(splitAtUnitBoundary('hello world', -3), { head: '', tail: 'hello world' });
  assert.deepEqual(splitAtUnitBoundary('hello world ', 99), { head: 'hello world ', tail: '' });
});

test('splitAtUnitBoundary keeps boundary whitespace at the start of the tail', () => {
  assert.deepEqual(splitAtUnitBoundary('hello  world', 1), { head: 'hello', tail: '  world' });
  assert.deepEqual(splitAtUnitBoundary(' lead word', 1), { head: ' lead', tail: ' word' });
});

test('head + tail === input holds for every text and every boundary', () => {
  for (const text of SAMPLE_TEXTS) {
    const total = unitCount(text);
    let previousHead = '';

    for (let n = 0; n <= total + 2; n += 1) {
      const { head, tail } = splitAtUnitBoundary(text, n);
      assert.equal(head + tail, text, `head+tail must equal input for ${JSON.stringify(text)} at n=${n}`);
      assert.ok(head.startsWith(previousHead), 'heads must grow monotonically');
      previousHead = head;
    }

    assert.equal(splitAtUnitBoundary(text, total).head + splitAtUnitBoundary(text, total).tail, text);
  }
});

test('splits never break a surrogate pair or emoji sequence', () => {
  for (const text of SAMPLE_TEXTS) {
    const total = unitCount(text);

    for (let n = 0; n <= total; n += 1) {
      const { head, tail } = splitAtUnitBoundary(text, n);
      assert.equal(/[\uD800-\uDBFF]$/.test(head), false, 'head must not end on an unpaired high surrogate');
      assert.equal(/^[\uDC00-\uDFFF]/.test(tail), false, 'tail must not start on an unpaired low surrogate');
      assert.equal(/‍$/.test(head), false, 'head must not end mid ZWJ sequence');
    }
  }
});

test('splitAtUnitBoundary reveals a complete ZWJ emoji as one unit', () => {
  const { head, tail } = splitAtUnitBoundary(`${FAMILY} arrives`, 1);
  assert.equal(head, FAMILY);
  assert.equal(tail, ' arrives');
});

test('drainQuota is zero with no backlog and at least one otherwise', () => {
  assert.equal(drainQuota(0, 48, WORD_DRAIN_MAX_LAG_MS), 0);
  assert.equal(drainQuota(-5, 48, WORD_DRAIN_MAX_LAG_MS), 0);

  for (const backlog of [1, 2, 7, 50, 1000]) {
    const quota = drainQuota(backlog, 48, WORD_DRAIN_MAX_LAG_MS);
    assert.ok(quota >= 1, 'a live backlog always advances');
    assert.ok(quota <= backlog, 'quota never exceeds the backlog');
  }
});

test('drainQuota drains any backlog within the lag bound', () => {
  const cadence = 48;

  for (const backlog of [1, 3, 12, 49, 50, 51, 100, 377, 5000]) {
    let remaining = backlog;
    let ticks = 0;

    while (remaining > 0) {
      remaining -= drainQuota(remaining, cadence, WORD_DRAIN_MAX_LAG_MS);
      ticks += 1;
      assert.ok(ticks <= 10_000, 'drain must terminate');
    }

    assert.ok(
      ticks * cadence <= WORD_DRAIN_MAX_LAG_MS,
      `backlog ${backlog} must drain within ${WORD_DRAIN_MAX_LAG_MS}ms, took ${ticks * cadence}ms`
    );
  }
});

test('drainQuota re-scales after mid-drain appends so new text also meets the bound', () => {
  const cadence = 48;
  let remaining = 40;

  for (let tick = 0; tick < 5; tick += 1) {
    remaining -= drainQuota(remaining, cadence, WORD_DRAIN_MAX_LAG_MS);
  }

  remaining += 300;
  let ticksAfterAppend = 0;
  while (remaining > 0) {
    remaining -= drainQuota(remaining, cadence, WORD_DRAIN_MAX_LAG_MS);
    ticksAfterAppend += 1;
  }

  assert.ok(ticksAfterAppend * cadence <= WORD_DRAIN_MAX_LAG_MS);
});

test('drainQuota catches up instantly when the lag bound is tighter than one tick', () => {
  assert.equal(drainQuota(25, 48, 10), 25);
  assert.equal(drainQuota(25, 0, 480), 1);
});
