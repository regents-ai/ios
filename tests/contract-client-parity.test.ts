import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contract = readFileSync('api-contract.openapiv3.yaml', 'utf8');
const regentClient = readFileSync('utils/regentApi/client.ts', 'utf8');

test('OpenAPI operations have stable operation IDs', () => {
  const operations = [...contract.matchAll(/^    (get|post|put|patch|delete):$/gm)];
  const operationIds = [...contract.matchAll(/^\s+operationId:\s+([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);

  assert.equal(operations.length, 29);
  assert.equal(operationIds.length, operations.length);
  assert.equal(new Set(operationIds).size, operationIds.length);
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
