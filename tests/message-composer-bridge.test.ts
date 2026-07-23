import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendToMessageComposer,
  applyDictationTranscript,
  beginDictationDraft,
  captureMessageComposerController,
  insertComposerText,
  registerMessageComposer,
  resetMessageComposerBridgeForTest,
  runMessageComposerAction,
  type MessageComposerController,
} from '../utils/messageComposerBridge';

function controllerWithCalls(calls: string[]): MessageComposerController {
  return {
    appendText: (text) => calls.push(`append:${text}`),
    focus: () => calls.push('focus'),
    openCommands: () => {
      calls.push('commands');
      return true;
    },
    openQrScanner: () => calls.push('scanQr'),
    startDictation: () => calls.push('voice'),
  };
}

test('composer insertions use the current selection and otherwise append at the end', () => {
  assert.deepEqual(insertComposerText('hello', ' world'), {
    text: 'hello world',
    selection: { start: 11, end: 11 },
  });
  assert.deepEqual(insertComposerText('say now', 'hello ', { start: 0, end: 0 }), {
    text: 'hello say now',
    selection: { start: 6, end: 6 },
  });
  assert.deepEqual(insertComposerText('say this now', 'that', { start: 4, end: 8 }), {
    text: 'say that now',
    selection: { start: 8, end: 8 },
  });
});

test('updated partial transcripts replace the previous partial instead of appending twice', () => {
  const firstDraft = 'Typed before  typed after';
  const session = beginDictationDraft(firstDraft, { start: 13, end: 13 });

  const firstUpdate = applyDictationTranscript(firstDraft, session, 'Regent');
  assert.deepEqual(firstUpdate.edit, {
    text: 'Typed before Regent typed after',
    selection: { start: 19, end: 19 },
  });

  const draftWithNewTypedText = `${firstUpdate.edit.text}!`;
  const secondUpdate = applyDictationTranscript(
    draftWithNewTypedText,
    firstUpdate.session,
    'Regent to review'
  );
  assert.deepEqual(secondUpdate.edit, {
    text: 'Typed before Regent to review typed after!',
    selection: { start: 29, end: 29 },
  });
});

test('popping the top composer restores the previous composer', () => {
  resetMessageComposerBridgeForTest();
  const firstCalls: string[] = [];
  const secondCalls: string[] = [];
  const unregisterFirst = registerMessageComposer(controllerWithCalls(firstCalls));
  const unregisterSecond = registerMessageComposer(controllerWithCalls(secondCalls));

  assert.equal(runMessageComposerAction('keyboard'), true);
  assert.deepEqual(firstCalls, []);
  assert.deepEqual(secondCalls, ['focus']);

  unregisterSecond();
  assert.equal(runMessageComposerAction('keyboard'), true);
  assert.equal(runMessageComposerAction('commands'), true);
  assert.equal(runMessageComposerAction('voice'), true);
  assert.equal(runMessageComposerAction('scanQr'), true);
  assert.deepEqual(firstCalls, [
    'focus',
    'commands',
    'voice',
    'scanQr',
  ]);

  unregisterFirst();
  assert.equal(runMessageComposerAction('keyboard'), false);
  resetMessageComposerBridgeForTest();
});

test('paste can only append to the composer captured at gesture commit', () => {
  resetMessageComposerBridgeForTest();
  const firstCalls: string[] = [];
  const secondCalls: string[] = [];
  const unregisterFirst = registerMessageComposer(controllerWithCalls(firstCalls));
  const captured = captureMessageComposerController();
  const unregisterSecond = registerMessageComposer(controllerWithCalls(secondCalls));

  assert.equal(appendToMessageComposer(captured, 'clipboard'), false);
  assert.deepEqual(firstCalls, []);
  assert.deepEqual(secondCalls, []);

  unregisterSecond();
  assert.equal(appendToMessageComposer(captured, 'clipboard'), true);
  assert.deepEqual(firstCalls, ['append:clipboard']);

  unregisterFirst();
  resetMessageComposerBridgeForTest();
});
