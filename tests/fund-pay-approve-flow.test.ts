import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test('main mobile tabs lead with agents, funding, review, and buy', () => {
  const layout = read('app/(tabs)/_layout.tsx');

  assert.match(layout, /name="agents"[\s\S]*title: 'Agents'/);
  assert.match(layout, /name="wallet"[\s\S]*title: 'Fund'/);
  assert.match(layout, /name="terminal"[\s\S]*title: 'Review'/);
  assert.match(layout, /name="autolaunch"[\s\S]*title: 'Buy'/);
});

test('agents and wallet screens use the agent money story', () => {
  const agents = read('app/(tabs)/agents.tsx');
  const wallet = read('app/(tabs)/wallet.tsx');
  const onramp = read('components/onramp/onramp-form-sections.tsx');

  assert.match(agents, /Fund an AI agent in seconds/);
  assert.match(agents, /Fund Agent/);
  assert.match(agents, /Add USDC/);
  assert.match(agents, /Review Approvals/);
  assert.match(agents, /Track Rewards/);
  assert.match(agents, /Working balance/);

  assert.match(wallet, /Add funds for agent work/);
  assert.match(wallet, /Apple Pay to USDC on Base/);
  assert.match(onramp, /Fund an agent working balance/);
  assert.match(onramp, /Swipe to add USDC/);
});

test('agent detail starts the tracked fund-agent send flow', () => {
  const agentDetail = read('app/agent/[id].tsx');
  const routes = read('utils/navigation/routes.ts');

  assert.match(routes, /walletSend\(params\?:/);
  assert.match(agentDetail, /routes\.walletSend\(\{/);
  assert.match(agentDetail, /flow: 'agent-funding'/);
  assert.match(agentDetail, /regentId: agent\.id/);
  assert.match(agentDetail, /recipientAddress: agent\.walletAddress/);
  assert.match(agentDetail, /recipientLabel: agent\.name/);
  assert.match(agentDetail, /Fund Agent/);
});

test('agent funding mode prefers Base USDC and records wallet actions', () => {
  const send = read('app/wallet/send.tsx');

  assert.match(send, /const AGENT_FUNDING_FLOW = 'agent-funding'/);
  assert.match(send, /fetchWalletFundingChoices\(\{ evmAddress: smartAccountAddress, solanaAddress: null \}\)/);
  assert.match(send, /choices\.find\(isBaseUsdcBalance\)/);
  assert.match(send, /setNetwork\('base'\)/);
  assert.match(send, /Add USDC first/);
  assert.match(send, /regentApi\.prepareWalletAction/);
  assert.match(send, /type: 'funding'/);
  assert.match(send, /regentApi\.confirmWalletAction/);
  assert.match(send, /Review payment/);
  assert.match(send, /Send to agent/);
  assert.match(send, /You sent \$\{amount\} \$\{selectedToken\?\.token\?\.symbol \|\| 'USDC'\} to/);
});

test('review screens present payment approvals plainly', () => {
  const terminal = read('app/(tabs)/terminal.tsx');
  const detail = read('app/terminal/[id].tsx');

  assert.match(terminal, /Approvals and payments/);
  assert.match(terminal, /Payment review/);
  assert.match(detail, /Payment requested/);
  assert.match(detail, /Agent requests \$\{approval\.amount\} \$\{approval\.currency\}/);
  assert.match(detail, /Approve payment/);
});
