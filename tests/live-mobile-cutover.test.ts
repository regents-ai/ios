import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('mobile Regent contract exposes the current route family', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');

  assert.match(contract, /\/mobile\/regents/);
  assert.match(contract, /\/mobile\/message\/threads/);
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}\/voice\/session/);
  assert.match(contract, /RegentReturnRequest/);
  assert.match(contract, /HermesVoiceAccount/);
});

test('mobile app and backend do not use the old preview route family', () => {
  const result = spawnSync('rg', ['-n', '/mobile-preview|mobile-preview', 'app', 'utils', 'types', 'server/src', 'server/api', 'api-contract.openapiv3.yaml'], {
    cwd: resolve(testDir, '..'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
});

test('mobile Message surfaces use the contracted message routes', () => {
  const appFiles = [
    '../app/(tabs)/agents.tsx',
    '../app/(tabs)/message.tsx',
    '../app/agent/[id].tsx',
    '../app/message/[id].tsx',
  ];
  const helperFiles = [
    '../utils/regentApi/client.ts',
    '../utils/navigation/routes.ts',
  ];
  const messageTab = readFileSync(resolve(testDir, '../app/(tabs)/message.tsx'), 'utf8');
  const messageDetail = readFileSync(resolve(testDir, '../app/message/[id].tsx'), 'utf8');
  const agentsTab = readFileSync(resolve(testDir, '../app/(tabs)/agents.tsx'), 'utf8');
  const agentDetail = readFileSync(resolve(testDir, '../app/agent/[id].tsx'), 'utf8');
  const regentClient = readFileSync(resolve(testDir, '../utils/regentApi/client.ts'), 'utf8');
  const navigationRoutes = readFileSync(resolve(testDir, '../utils/navigation/routes.ts'), 'utf8');

  assert.match(messageTab, /regentApi\.listMessageThreads/);
  assert.match(messageTab, /routes\.messageThread\(thread\.id\)/);
  assert.match(messageDetail, /regentApi\.getMessageThread/);
  assert.match(messageDetail, /regentApi\.getMessageThreadEvents/);
  assert.match(messageDetail, /regentApi\.sendMessageThreadMessage/);
  assert.match(messageDetail, /effectiveThreadId/);
  assert.match(messageDetail, /adoptMessageThreadId\(requestThreadId, nextThread\.id\)/);
  assert.match(messageDetail, /router\.replace\(routes\.messageThread\(nextThreadId\)\)/);
  assert.match(messageDetail, /regentApi\.resolveMessageThreadApproval/);
  assert.match(agentsTab, /router\.push\(routes\.message\(\)\)/);
  assert.match(agentDetail, /router\.push\(routes\.message\(\)\)/);
  assert.match(regentClient, /listMessageThreads\(\)/);
  assert.match(regentClient, /createMessageThread\(input:/);
  assert.match(regentClient, /getMessageThread\(threadId: string\)/);
  assert.match(regentClient, /getMessageThreadEvents\(input:/);
  assert.match(regentClient, /sendMessageThreadMessage\(input:/);
  assert.match(regentClient, /resolveMessageThreadApproval\(input:/);
  assert.match(navigationRoutes, /messageThread\(threadId: string\)/);

  for (const file of [...appFiles, ...helperFiles]) {
    const contents = readFileSync(resolve(testDir, file), 'utf8');
    assert.doesNotMatch(contents, /TalkComingSoon|Hermes Talk is coming soon|Talk coming soon/, file);
  }
});

test('mobile voice surfaces use ChatGPT account gate and short-lived sessions', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');
  const agentDetail = readFileSync(resolve(testDir, '../app/agent/[id].tsx'), 'utf8');
  const voiceButton = readFileSync(resolve(testDir, '../components/voice/HermesVoiceButton.tsx'), 'utf8');
  const voiceSheet = readFileSync(resolve(testDir, '../components/voice/HermesVoiceSheet.tsx'), 'utf8');
  const voiceHook = readFileSync(resolve(testDir, '../hooks/useHermesVoiceSession.ts'), 'utf8');
  const appConfig = readFileSync(resolve(testDir, '../app.config.ts'), 'utf8');

  assert.match(agentDetail, /HermesVoiceButton/);
  assert.match(voiceButton, /Connect ChatGPT/);
  assert.match(voiceSheet, /Connect ChatGPT/);
  assert.match(voiceHook, /createHermesVoiceSession/);
  assert.match(voiceHook, /disconnectHermesVoice/);
  assert.match(contract, /ChatGptAccountRequired/);
  assert.doesNotMatch(`${appConfig}\n${voiceHook}\n${voiceSheet}`, /OPENAI_API_KEY|HERMES_VOICE_GATEWAY_TOKEN|SPRITES_[A-Z_]*SECRET|sk-[A-Za-z0-9]/);
});

test('mobile navigation uses typed route helpers instead of route casts', () => {
  const onrampSubmit = readFileSync(resolve(testDir, '../hooks/onramp/use-wallet-onramp-submit.ts'), 'utf8');
  const navigationRoutes = readFileSync(resolve(testDir, '../utils/navigation/routes.ts'), 'utf8');
  const result = spawnSync('rg', [
    '-n',
    'router\\.(push|replace)\\([^\\n]*as any|navigationPath\\?: string|as unknown as Href',
    'app',
    'hooks',
    'utils/navigation',
    'components',
  ], {
    cwd: resolve(testDir, '..'),
    encoding: 'utf8',
  });

  assert.match(navigationRoutes, /emailVerify\(params: \{ mode: EmailVerifyMode; initialEmail\?: string \}\)/);
  assert.match(navigationRoutes, /phoneVerify\(params: \{/);
  assert.match(onrampSubmit, /navigationPath: routes\.emailVerify\(\{ mode: 'link' \}\)/);
  assert.match(onrampSubmit, /navigationPath: routes\.phoneVerify\(\{ mode: 'link' \}\)/);
  assert.match(onrampSubmit, /router\.push\(navigationPath\)/);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
});
