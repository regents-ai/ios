import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SLASH_COMMANDS,
  filterCommands,
  parseSlashInput,
  requiresConfirmRouting,
} from '../utils/slashCommands';

test('non-slash input is not autocomplete', () => {
  assert.equal(parseSlashInput('hello').mode, 'none');
  assert.equal(parseSlashInput('').mode, 'none');
});

test('a bare slash lists commands; typing filters them', () => {
  const all = parseSlashInput('/');
  assert.equal(all.mode, 'command');
  assert.equal(filterCommands('').length, SLASH_COMMANDS.length);

  assert.deepEqual(filterCommands('s').map((c) => c.name).sort(), ['send', 'stake']);
  assert.deepEqual(filterCommands('bal').map((c) => c.name), ['balance']);
});

test('a known command plus a space enters sub-argument mode', () => {
  const parse = parseSlashInput('/send 25');
  assert.equal(parse.mode, 'argument');
  if (parse.mode !== 'argument') {
    return;
  }
  assert.equal(parse.command.name, 'send');
  assert.equal(parse.argument, '25');
});

test('an unknown command name stays in command mode, not argument mode', () => {
  const parse = parseSlashInput('/bogus xyz');
  assert.equal(parse.mode, 'command');
});

test('money commands require confirm routing; read-only commands do not', () => {
  assert.equal(requiresConfirmRouting(parseSlashInput('/send 10')), true);
  assert.equal(requiresConfirmRouting(parseSlashInput('/stake 5')), true);
  assert.equal(requiresConfirmRouting(parseSlashInput('/balance ')), false);
  assert.equal(requiresConfirmRouting(parseSlashInput('/')), false);
});

test('send and stake are marked as confirming commands', () => {
  for (const name of ['send', 'stake']) {
    assert.equal(SLASH_COMMANDS.find((c) => c.name === name)?.confirms, true);
  }
  assert.equal(SLASH_COMMANDS.find((c) => c.name === 'balance')?.confirms, false);
});
