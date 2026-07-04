import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAgentLinkQr } from '../utils/agentLink/qrPayload';

test('parses a valid agent-link QR into a code and baseUrl', () => {
  const raw = JSON.stringify({
    v: 1,
    kind: 'regents-agent-link',
    baseUrl: 'https://agent.example',
    code: 'ABC234',
  });

  const result = parseAgentLinkQr(raw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.code, 'ABC234');
    assert.equal(result.payload.baseUrl, 'https://agent.example');
  }
});

test('trims surrounding whitespace from the code', () => {
  const raw = JSON.stringify({ v: 1, kind: 'regents-agent-link', code: '  ABC234  ' });
  const result = parseAgentLinkQr(raw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.code, 'ABC234');
    assert.equal(result.payload.baseUrl, null);
  }
});

test('rejects a payload with the wrong kind', () => {
  const raw = JSON.stringify({ v: 1, kind: 'some-other-code', code: 'ABC234' });
  const result = parseAgentLinkQr(raw);
  assert.equal(result.ok, false);
});

test('rejects a payload with an empty code', () => {
  const raw = JSON.stringify({ v: 1, kind: 'regents-agent-link', code: '   ' });
  const result = parseAgentLinkQr(raw);
  assert.equal(result.ok, false);
});

test('rejects a payload missing the code entirely', () => {
  const raw = JSON.stringify({ v: 1, kind: 'regents-agent-link', baseUrl: 'https://agent.example' });
  const result = parseAgentLinkQr(raw);
  assert.equal(result.ok, false);
});

test('rejects text that is not JSON', () => {
  const result = parseAgentLinkQr('https://example.com/not-a-code');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /agent code/);
  }
});

test('rejects a bare JSON value that is not an object', () => {
  assert.equal(parseAgentLinkQr('"ABC234"').ok, false);
  assert.equal(parseAgentLinkQr('null').ok, false);
});
