import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contract = readFileSync('api-contract.openapiv3.yaml', 'utf8');
const regentClient = readFileSync('utils/regentApi/client.ts', 'utf8');

test('OpenAPI operations have stable operation IDs', () => {
  const operations = [...contract.matchAll(/^    (get|post|put|patch|delete):$/gm)];
  const operationIds = [...contract.matchAll(/^\s+operationId:\s+([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);

  assert.equal(operations.length, 34);
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
    section('CreateRegentReturnRequest', 'TerminalSessionStatus'),
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
  assert.match(contractSlices[1]!, /chainId:[\s\S]*enum: \[8453\]/);
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
