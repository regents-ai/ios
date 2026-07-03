import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MessageThreadDetail, RegentDetail, RegentReturnRequest } from '../types/regents';
import {
  normalizeMessageThread,
  normalizeMessageThreadEvents,
  normalizeRegentDetail,
  normalizeReturnRequest,
  resetEnumDriftWarningsForTest,
  tolerantEnum,
} from '../utils/regentApi/tolerantDecode';

const globalWithDev = globalThis as { __DEV__?: boolean };

/** Runs `fn` capturing console.warn calls. */
function captureWarnings(fn: () => void): string[] {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(' '));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

function contractEnums(): string[][] {
  const contract = readFileSync(join(__dirname, '..', 'api-contract.openapiv3.yaml'), 'utf8');
  return [...contract.matchAll(/enum: \[([^\]]+)\]/g)].map((match) =>
    match[1].split(',').map((value) => value.trim())
  );
}

function hasEnum(enums: string[][], values: string[]) {
  return enums.some(
    (candidate) => candidate.length === values.length && values.every((value) => candidate.includes(value))
  );
}

test('decoder enum sets match the OpenAPI contract', () => {
  const enums = contractEnums();
  assert.ok(hasEnum(enums, ['idle', 'running', 'waiting', 'failed']), 'thread status enum');
  assert.ok(hasEnum(enums, ['online', 'waiting', 'offline']), 'runtime status enum');
  assert.ok(
    hasEnum(enums, ['requested', 'approved', 'broadcasting', 'confirmed', 'failed']),
    'return request status enum'
  );
});

test('tolerantEnum keeps known members and maps anything else to unknown', () => {
  const decode = tolerantEnum(['online', 'waiting', 'offline'], 'test.enum');
  assert.equal(decode('online'), 'online');
  assert.equal(decode('hibernating'), 'unknown');
  assert.equal(decode(42), 'unknown');
  assert.equal(decode(undefined), 'unknown');
});

test('unknown thread fields pass through untouched', () => {
  const wire = {
    id: 't1',
    platformThreadId: 'p1',
    title: 'Thread',
    agentId: 'a1',
    agentName: 'Agent',
    source: 'platform_rwr',
    status: 'daydreaming',
    latestNote: 'note',
    lastUpdatedAt: 'now',
    composerPlaceholder: 'Say hi',
    futureField: { nested: true },
  } as unknown as MessageThreadDetail;

  const thread = normalizeMessageThread(wire);
  assert.equal(thread.status, 'unknown');
  assert.deepEqual((thread as unknown as { futureField: unknown }).futureField, { nested: true });
});

test('event batches skip unidentifiable entries instead of crashing', () => {
  const events = normalizeMessageThreadEvents([
    { eventId: 'e1', type: 'message', ts: '2026-07-01T00:00:00Z', text: 'hi' },
    null,
    'garbage',
    { type: 'missing-id', ts: 'now' },
    { eventId: 'e2', type: 'brand.new.event', ts: 'now', status: 'mystery', extra: 1 },
  ]);

  assert.equal(events.length, 2);
  assert.equal(events[0].eventId, 'e1');
  assert.equal(events[1].eventId, 'e2');
  assert.equal(events[1].type, 'brand.new.event');
  assert.equal(events[1].status, 'unknown');
  assert.equal((events[1] as unknown as { extra: number }).extra, 1);
});

test('non-array event payloads decode to an empty batch', () => {
  assert.deepEqual(normalizeMessageThreadEvents({ oops: true }), []);
  assert.deepEqual(normalizeMessageThreadEvents(undefined), []);
});

test('regent detail normalizes runtime and return request enums', () => {
  const wire = {
    id: 'r1',
    name: 'Regent',
    status: 'active',
    runtimeStatus: 'rebooting',
    walletAddress: '0x1',
    platformState: {},
    voice: {},
    lastActiveAt: 'now',
    runtimeHeadline: 'headline',
    mission: 'mission',
    recentActivity: [],
    returnRequests: [{ id: 'rr1', status: 'teleporting' } as unknown as RegentReturnRequest],
  } as unknown as RegentDetail;

  const detail = normalizeRegentDetail(wire);
  assert.equal(detail.runtimeStatus, 'unknown');
  assert.equal(detail.returnRequests[0].status, 'unknown');
});

test('return request known statuses survive unchanged', () => {
  const wire = { id: 'rr2', status: 'broadcasting' } as unknown as RegentReturnRequest;
  assert.equal(normalizeReturnRequest(wire).status, 'broadcasting');
});

test('contract-drift: an unknown enum value warns once per field in dev', () => {
  const prevDev = globalWithDev.__DEV__;
  globalWithDev.__DEV__ = true;
  resetEnumDriftWarningsForTest();

  const decode = tolerantEnum(['online', 'offline'], 'regent.runtimeStatus');
  const warnings = captureWarnings(() => {
    decode('hibernating');
    decode('warp-speed');
    decode('another-unknown');
  });

  const driftWarnings = warnings.filter((line) => line.includes('contract drift'));
  assert.equal(driftWarnings.length, 1, 'warns once, not per unknown value');
  assert.match(driftWarnings[0], /regent\.runtimeStatus/);
  assert.match(driftWarnings[0], /api-contract\.openapiv3\.yaml/, 'points at the contract');

  globalWithDev.__DEV__ = prevDev;
});

test('contract-drift: known values never warn', () => {
  globalWithDev.__DEV__ = true;
  resetEnumDriftWarningsForTest();

  const decode = tolerantEnum(['online', 'offline'], 'regent.runtimeStatus');
  const warnings = captureWarnings(() => {
    decode('online');
    decode('offline');
  });
  assert.equal(warnings.filter((line) => line.includes('contract drift')).length, 0);
  globalWithDev.__DEV__ = undefined;
});

test('contract-drift: production builds emit no drift warning', () => {
  globalWithDev.__DEV__ = false;
  resetEnumDriftWarningsForTest();

  const decode = tolerantEnum(['online', 'offline'], 'regent.runtimeStatus');
  const warnings = captureWarnings(() => {
    decode('unheard-of');
  });
  assert.equal(warnings.filter((line) => line.includes('contract drift')).length, 0);
  globalWithDev.__DEV__ = undefined;
});
