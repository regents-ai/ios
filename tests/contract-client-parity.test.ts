import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contract = readFileSync('api-contract.openapiv3.yaml', 'utf8');
const regentClient = readFileSync('utils/regentApi/client.ts', 'utf8');
const regentTypes = readFileSync('types/regents.ts', 'utf8');

test('OpenAPI operations have stable operation IDs', () => {
  const operations = [...contract.matchAll(/^    (get|post|put|patch|delete):$/gm)];
  const operationIds = [...contract.matchAll(/^\s+operationId:\s+([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);

  assert.equal(operations.length, 37);
  assert.equal(operationIds.length, operations.length);
  assert.equal(new Set(operationIds).size, operationIds.length);
});

test('transaction event feed is declared in the contract and covered by the client', () => {
  const eventsClient = readFileSync('utils/fetchOnrampEvents.ts', 'utf8');

  assert.match(contract, /\/events\/onramp:[\s\S]*operationId: listOnrampTransactionEvents/);
  assert.match(contract, /TransactionEvent:[\s\S]*required: \[eventType, transactionId, occurredAt\]/);
  assert.match(eventsClient, /fetchOnrampEvents\(accessToken\?: string\)/);
  assert.match(eventsClient, /\/events\/onramp/);
});

test('inbound Coinbase webhook contract covers both ramps and the widget alias', () => {
  const webhookSchema = contract.slice(
    contract.indexOf('    CoinbaseTransactionWebhook:'),
    contract.indexOf('    TransactionEvent:')
  );

  assert.match(webhookSchema, /- onramp\.transaction\.completed/);
  assert.match(webhookSchema, /- offramp\.transaction\.success/);
  assert.match(webhookSchema, /- offramp\.transaction\.failed/);
  // Coinbase owns this payload: unknown vendor fields must be tolerated.
  assert.match(webhookSchema, /additionalProperties: true/);
});

test('OpenAPI 3.0 schemas use nullable instead of array-typed nulls', () => {
  assert.doesNotMatch(contract, /type:\s*\[[^\]]*['"]null['"][^\]]*\]/);
});

test('Nous Portal pairing is additive, authenticated, and covered by the client', () => {
  const pairingContract = contract.slice(
    contract.indexOf('  /oauth/callback:'),
    contract.indexOf('  /mobile/agents:'),
  );
  assert.match(contract, /\/oauth\/callback:[\s\S]*operationId: bouncePortalOAuthCallback[\s\S]*security: \[\]/);
  assert.match(contract, /\/mobile\/portal-pairing\/start:[\s\S]*operationId: startMobilePortalPairing[\s\S]*bearerAuth/);
  assert.match(contract, /\/mobile\/portal-pairing\/complete:[\s\S]*operationId: completeMobilePortalPairing[\s\S]*'409':/);
  assert.match(contract, /\/mobile\/portal-pairing:[\s\S]*operationId: getMobilePortalPairing[\s\S]*operationId: disconnectMobilePortalPairing/);
  assert.match(contract, /PortalPairingStatus:[\s\S]*required: \[paired, accountLabel, pairedAt\]/);
  assert.match(regentClient, /startPortalPairing\(\)/);
  assert.match(regentClient, /completePortalPairing\(input: \{ code: string; state: string \}\)/);
  assert.match(regentClient, /getPortalPairing\(\)/);
  assert.match(regentClient, /disconnectPortalPairing\(\)/);
  assert.doesNotMatch(regentClient, /refreshToken|accessToken/);
  assert.equal(
    [...pairingContract.matchAll(/'401':[\s\S]{0,180}\$ref: '#\/components\/schemas\/ErrorEnvelope'/g)].length,
    4,
  );
});

test('my agents contract is owned by the phone backend and covered by the client', () => {
  assert.match(contract, /\/mobile\/agents:[\s\S]*operationId: listMobileAgents[\s\S]*operationId: addMobileAgent/);
  assert.match(contract, /\/mobile\/agents\/pairing-codes:[\s\S]*operationId: createMobileAgentPairingCode/);
  assert.match(contract, /\/mobile\/agents\/pairing-codes\/\{code\}:[\s\S]*operationId: getMobileAgentPairingCode[\s\S]*operationId: discardMobileAgentPairingCode/);
  assert.match(contract, /\/mobile\/agents\/pairing-codes\/\{code\}\/confirm:[\s\S]*operationId: confirmMobileAgentPairing/);
  assert.match(contract, /\/mobile\/agents\/\{agent_id\}:[\s\S]*operationId: renameMobileAgent[\s\S]*operationId: removeMobileAgent/);
  // The agent itself calls /agent/pair with a SIWA-signed request, never with a user's bearer token.
  assert.match(contract, /\/agent\/pair:[\s\S]*operationId: pairMobileAgent[\s\S]*security: \[\]/);
  assert.match(contract, /MobileAgentKind:[\s\S]*enum: \[muse, grok_bot, hermes, other\]/);
  assert.match(contract, /MobileAgent:[\s\S]*required: \[id, name, kind, walletAddress, paired, createdAt, usdcBalance\]/);
  assert.match(regentTypes, /export type MobileAgentKind = 'muse' \| 'grok_bot' \| 'hermes' \| 'other'/);
  assert.match(contract, /MobileAgentPairingStatus:/);
  assert.match(regentClient, /listAgents\(\): Promise<MobileAgentsList>/);
  assert.match(regentClient, /addAgent\(input: \{ name: string; kind: MobileAgentKind; walletAddress: string \}\)/);
  assert.match(regentClient, /renameAgent\(agentId: string, input: \{ name: string \}\)/);
  assert.match(regentClient, /removeAgent\(agentId: string\)/);
  assert.match(regentClient, /createAgentPairingCode\(input: \{ name: string; kind: MobileAgentKind \}\)/);
  assert.match(regentClient, /getAgentPairingStatus\(code: string\): Promise<MobileAgentPairingStatus>/);
  assert.match(regentClient, /confirmAgentPairing\(code: string\): Promise<MobileAgent>/);
  assert.match(regentClient, /discardAgentPairingCode\(code: string\): Promise<void>/);
  assert.doesNotMatch(regentClient, /\/agent\/pair/);
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

test('staking wallet-action contract uses even-byte calldata constraints', () => {
  const platformAction = contract.slice(
    contract.indexOf('    RegentStakingWalletAction:'),
    contract.indexOf('    MobileRegentStakingActionResponse:')
  );
  const approval = platformAction.slice(platformAction.indexOf('        approval:'));

  assert.match(platformAction, /data:[\s\S]*pattern: '\^0x\(\[a-fA-F0-9\]\{2\}\)\*\$'/);
  assert.match(approval, /data:[\s\S]*pattern: '\^0x\(\[a-fA-F0-9\]\{2\}\)\*\$'/);
});
