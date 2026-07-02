import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contract = readFileSync('api-contract.openapiv3.yaml', 'utf8');
const regentClient = readFileSync('utils/regentApi/client.ts', 'utf8');
const regentTypes = readFileSync('types/regents.ts', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

test('OpenAPI operations have stable operation IDs', () => {
  const operations = [...contract.matchAll(/^    (get|post|put|patch|delete):$/gm)];
  const operationIds = [...contract.matchAll(/^\s+operationId:\s+([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);

  assert.equal(operations.length, 41);
  assert.equal(operationIds.length, operations.length);
  assert.equal(new Set(operationIds).size, operationIds.length);
});

test('OpenAPI 3.0 schemas use nullable instead of array-typed nulls', () => {
  assert.doesNotMatch(contract, /type:\s*\[[^\]]*['"]null['"][^\]]*\]/);
});

test('Regent app client covers declared return request lookup route', () => {
  assert.match(contract, /\/mobile\/regents\/\{id\}\/return-requests\/\{return_request_id\}:[\s\S]*operationId: getRegentReturnRequest/);
  assert.match(regentClient, /getReturnRequest\(input:/);
  assert.match(regentClient, /regentReturnRequestPath\(input\.regentId, input\.returnRequestId\)/);
});

test('Hermes voice contract exposes only the live ChatGPT-gated mobile surface', () => {
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}\/voice\/status:[\s\S]*operationId: getMobileHermesVoiceStatus/);
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}\/voice\/session:[\s\S]*operationId: createMobileHermesVoiceSession/);
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}\/voice\/prewarm:[\s\S]*operationId: prewarmMobileHermesVoice/);
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}\/voice\/disconnect:[\s\S]*operationId: disconnectMobileHermesVoice/);
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}\/voice\/tool-results:[\s\S]*operationId: submitMobileHermesVoiceToolResult/);
  assert.match(contract, /HermesVoiceAccount:[\s\S]*required: \[required, satisfied, provider\][\s\S]*provider:[\s\S]*enum: \[openai_chatgpt\]/);
  assert.match(contract, /HermesVoiceStatus:[\s\S]*required: \[enabled, health, agent_id, account\]/);
  assert.doesNotMatch(contract, /\/mobile-preview\/voice/);
});

test('Regent app client includes Hermes voice calls without exposing long-lived provider keys', () => {
  const appConfig = readFileSync('app.config.ts', 'utf8');
  const voiceClient = readFileSync('utils/regentApi/voice.ts', 'utf8');

  assert.match(voiceClient, /getHermesVoiceStatus\(agentId: string\)/);
  assert.match(voiceClient, /createHermesVoiceSession\(input:/);
  assert.match(voiceClient, /prewarmHermesVoice\(agentId: string\)/);
  assert.match(voiceClient, /disconnectHermesVoice\(input:/);
  assert.match(voiceClient, /submitHermesVoiceToolResult\(input:/);
  assert.match(appConfig, /NSMicrophoneUsageDescription/);
  assert.doesNotMatch(appConfig, /OPENAI_API_KEY|HERMES_VOICE_GATEWAY_TOKEN|SPRITES_[A-Z_]*SECRET|sk-[A-Za-z0-9]/);
  assert.doesNotMatch(regentClient, /OPENAI_API_KEY|HERMES_VOICE_GATEWAY_TOKEN|SPRITES_[A-Z_]*SECRET|sk-[A-Za-z0-9]/);
  assert.doesNotMatch(voiceClient, /OPENAI_API_KEY|HERMES_VOICE_GATEWAY_TOKEN|SPRITES_[A-Z_]*SECRET|sk-[A-Za-z0-9]/);
});

test('prepared wallet-action contract and client require idempotency and risk copy', () => {
  assert.match(contract, /\/mobile\/wallet-actions\/\{type\}\/prepare:[\s\S]*name: Idempotency-Key[\s\S]*required: true/);
  assert.match(contract, /PrepareWalletActionRequest:[\s\S]*required: \[regentId, expectedSigner, to, value, data, riskCopy\]/);
  assert.match(contract, /PreparedWalletAction:[\s\S]*- owner_product[\s\S]*- resource_id[\s\S]*- simulation[\s\S]*- risk_copy/);
  assert.match(regentClient, /idempotencyKey: string;/);
  assert.match(regentClient, /riskCopy: string;/);
  assert.match(regentClient, /wallet_action: PreparedWalletAction/);
  assert.match(regentClient, /'Idempotency-Key': input\.idempotencyKey/);
});

test('money-action contract declares current Base address and calldata constraints', () => {
  const section = (name: string, nextName: string) =>
    contract.slice(contract.indexOf(`    ${name}:`), contract.indexOf(`    ${nextName}:`));
  const contractSlices = [
    section('CreateRegentReturnRequest', 'MessageThreadStatus'),
    section('CreateRegentFundingIntent', 'RegentFundingIntent'),
    section('PrepareWalletActionRequest', 'PreparedWalletAction'),
    section('PreparedWalletAction', 'RegentDetail'),
  ];

  for (const slice of contractSlices) {
    assert.match(slice, /pattern: '\^0x\[a-fA-F0-9\]\{40\}\$'/);
    assert.match(slice, /pattern: '\^\[0-9\]\+\$'/);
    assert.match(slice, /pattern: '\^0x\(\[a-fA-F0-9\]\{2\}\)\*\$'/);
  }

  assert.match(contractSlices[0]!, /chainId:[\s\S]*enum: \[8453\]/);
  assert.match(contractSlices[0]!, /destinationWalletAddress:[\s\S]*Must match the transaction `to` address/);
  assert.match(contractSlices[1]!, /chainId:[\s\S]*enum: \[8453\]/);
  assert.match(contractSlices[1]!, /destinationWalletAddress:[\s\S]*Must match the Regent wallet address from the current Platform projection/);
  assert.match(contractSlices[3]!, /chain_id:[\s\S]*enum: \[8453\]/);
});

test('Regent staking contract and client use the live staking surface only', () => {
  assert.match(contract, /\/mobile\/regent\/staking:[\s\S]*operationId: getMobileRegentStaking/);
  assert.match(contract, /\/mobile\/regent\/staking\/stake:[\s\S]*operationId: stakeMobileRegent/);
  assert.match(contract, /\/mobile\/regent\/staking\/unstake:[\s\S]*operationId: unstakeMobileRegent/);
  assert.match(contract, /\/mobile\/regent\/staking\/claim-usdc:[\s\S]*operationId: claimMobileRegentStakingUsdc/);
  assert.match(contract, /\/mobile\/regent\/staking\/claim-regent:[\s\S]*operationId: claimMobileRegentStakingRegent/);
  assert.match(contract, /\/mobile\/regent\/staking\/claim-and-restake-regent:[\s\S]*operationId: claimAndRestakeMobileRegentStakingRegent/);
  assert.match(regentClient, /getRegentStaking\(input:/);
  assert.match(regentClient, /stakeRegent\(input:/);
  assert.match(regentClient, /unstakeRegent\(input:/);
  assert.match(regentClient, /claimRegentStakingUsdc\(input:/);
  assert.match(regentClient, /claimRegentStakingRegent\(input:/);
  assert.match(regentClient, /claimAndRestakeRegent\(input:/);
});

test('Platform staking wallet-action contract uses even-byte calldata constraints', () => {
  const platformAction = contract.slice(
    contract.indexOf('    PlatformWalletAction:'),
    contract.indexOf('    MobileRegentStakingActionResponse:')
  );
  const approval = platformAction.slice(platformAction.indexOf('        approval:'));

  assert.match(platformAction, /data:[\s\S]*pattern: '\^0x\(\[a-fA-F0-9\]\{2\}\)\*\$'/);
  assert.match(approval, /data:[\s\S]*pattern: '\^0x\(\[a-fA-F0-9\]\{2\}\)\*\$'/);
});

test('Message contract keeps Platform RWR as the source of truth', () => {
  const messageThreadSchema = contract.slice(
    contract.indexOf('    MessageThread:'),
    contract.indexOf('    MessageThreadDetail:'),
  );

  assert.match(contract, /x-regent-message-contract:[\s\S]*talk_source: Platform Regent Work Runtime/);
  assert.match(contract, /transport_boundary: Mobile Message threads are sourced from Platform Regent Work Runtime/);
  assert.match(contract, /routes:[\s\S]*\/mobile\/message\/threads/);

  assert.match(contract, /\/mobile\/message\/threads:[\s\S]*operationId: listMobileMessageThreads/);
  assert.match(contract, /\/mobile\/message\/threads:[\s\S]*operationId: createMobileMessageThread/);
  assert.match(contract, /\/mobile\/message\/threads\/\{thread_id\}:[\s\S]*operationId: getMobileMessageThread/);
  assert.match(contract, /\/mobile\/message\/threads\/\{thread_id\}\/events:[\s\S]*operationId: getMobileMessageThreadEvents/);
  assert.match(contract, /\/mobile\/message\/threads\/\{thread_id\}\/messages:[\s\S]*operationId: postMobileMessageThreadMessage/);
  assert.match(contract, /\/mobile\/message\/threads\/\{thread_id\}\/approvals\/\{approval_id\}:[\s\S]*operationId: resolveMobileMessageThreadApproval/);

  for (const field of ['id', 'platformThreadId', 'agentId', 'agentName', 'source', 'title', 'status', 'latestNote', 'lastUpdatedAt']) {
    assert.match(messageThreadSchema, new RegExp(`- ${field}\\b`));
  }
  assert.match(messageThreadSchema, /source:[\s\S]*enum: \[platform_rwr\]/);
  assert.doesNotMatch(contract, /\/mobile\/message\/contacts\/recent-addresses/);
  assert.doesNotMatch(contract, /\/mobile\/message\/contacts\/regent-users/);
  assert.doesNotMatch(contract, /\/mobile\/message\/xmtp|xmtp-links|Xmtp|XMTP/);
  assert.doesNotMatch(contract, /MessageContactLookupTarget|MessageContactSuggestion/);
});

test('Regent app client uses only backend-sourced Message threads', () => {
  assert.doesNotMatch(packageJson, /"@xmtp\/react-native-sdk"/);
  assert.match(regentTypes, /export type MessageThread = [\s\S]*source: 'platform_rwr'/);
  assert.doesNotMatch(regentTypes, /Xmtp|xmtp|MessageContact|PhoneXmtp|AgentXmtp/);

  assert.match(regentClient, /const mobileMessageThreadsPath = '\/mobile\/message\/threads'/);
  assert.match(regentClient, /listMessageThreads\(\): Promise<MessageThread\[\]>/);
  assert.match(regentClient, /createMessageThread\(input:/);
  assert.match(regentClient, /getMessageThread\(threadId: string\)/);
  assert.match(regentClient, /getMessageThreadEvents\(input:/);
  assert.match(regentClient, /sendMessageThreadMessage\(input:/);
  assert.match(regentClient, /resolveMessageThreadApproval\(input:/);
  assert.doesNotMatch(regentClient, /lookupRecentMessageContacts|listRegentMessageContacts|registerPhoneXmtpIdentity/);
  assert.doesNotMatch(regentClient, /getAgentXmtpIdentity|linkXmtpConversation|xmtp|Xmtp|MessageContact/);
});
