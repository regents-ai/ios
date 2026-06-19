import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test('main mobile tabs lead with fund, pay, earn, and message', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const sendTab = read('app/(tabs)/send.tsx');
  const earnTab = read('app/(tabs)/earn.tsx');
  const profileButton = read('components/navigation/ProfileButton.tsx');

  assert.match(layout, /name="wallet"[\s\S]*title: 'Fund'/);
  assert.match(layout, /name="send"[\s\S]*title: 'Pay'/);
  assert.match(layout, /name="earn"[\s\S]*title: 'Earn'/);
  assert.match(layout, /name="terminal"[\s\S]*title: 'Message'/);
  assert.match(layout, /name="agents"[\s\S]*href: null/);
  assert.match(layout, /name="autolaunch"[\s\S]*href: null/);
  assert.match(sendTab, /export \{ default \} from '\.\.\/wallet\/send'/);
  assert.match(earnTab, /Bring people into Regents/);
  assert.match(profileButton, /accessibilityLabel="Open profile"/);
});

test('agents and wallet screens use the agent money story', () => {
  const agents = read('app/(tabs)/agents.tsx');
  const wallet = read('app/(tabs)/wallet.tsx');
  const onramp = read('components/onramp/onramp-form-sections.tsx');

  assert.match(agents, /Fund an AI agent in seconds/);
  assert.match(agents, /Fund Agent/);
  assert.match(agents, /Add USDC/);
  assert.match(agents, /Message Agent/);
  assert.match(agents, /Track Rewards/);
  assert.match(agents, /Working balance/);

  assert.match(wallet, /Add funds for agent work/);
  assert.match(wallet, /label: 'Pay'/);
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
  const fundingChoicesHook = read('hooks/wallet/useFundingChoices.ts');
  const evmTransferHook = read('hooks/wallet/useEvmTransfer.ts');
  const userOpAlertsHook = read('hooks/wallet/useUserOpStatusAlerts.ts');
  const confirmationModal = read('components/wallet/SendConfirmationModal.tsx');
  const fundingChoices = read('utils/fetchWalletFundingChoices.ts');

  assert.match(send, /const AGENT_FUNDING_FLOW = 'agent-funding'/);
  assert.match(send, /const SEND_FLOW = 'send'/);
  assert.match(fundingChoicesHook, /fetchWalletFundingChoices\(\{ evmAddress: smartAccountAddress \}\)/);
  assert.match(fundingChoicesHook, /choices\.find\(isBaseUsdcBalance\)/);
  assert.match(fundingChoicesHook, /setNetwork\('base'\)/);
  assert.match(send, /Add USDC first/);
  assert.match(send, /noBaseUsdcForSend/);
  assert.match(evmTransferHook, /regentApi\.prepareWalletAction/);
  assert.match(evmTransferHook, /type: 'funding'/);
  assert.match(userOpAlertsHook, /regentApi\.confirmWalletAction/);
  assert.match(send, /Review payment/);
  assert.match(confirmationModal, /Review payment/);
  assert.match(confirmationModal, /Pay now/);
  assert.match(confirmationModal, /Send to agent/);
  assert.match(userOpAlertsHook, /You sent \$\{amount\} \$\{selectedToken\?\.token\?\.symbol \|\| 'USDC'\} to/);
  assert.match(fundingChoices, /network=base/);
  assert.doesNotMatch(fundingChoices, /network=ethereum|balances\/solana|Promise\.all/);
});

test('pay flow accepts Ethereum addresses, ENS names, paste, and QR photos', () => {
  const send = read('app/wallet/send.tsx');
  const recipientHook = read('hooks/wallet/useRecipientResolution.ts');
  const recipientUtils = read('utils/onchain/recipient.ts');
  const routes = read('utils/navigation/routes.ts');

  assert.match(routes, /flow\?: 'agent-funding' \| 'send'/);
  assert.match(send, /const payTitle = isDefaultSendFlow \? 'Pay' : 'Send'/);
  assert.match(send, /placeholder=\{isSolanaNetwork\(network\) \? 'Solana address' : 'Ethereum address or ENS name'\}/);
  assert.match(recipientHook, /getEthereumRecipientAddress/);
  assert.match(recipientUtils, /isAddress\(candidate\) \? getAddress\(candidate\)/);
  assert.match(recipientHook, /resolveEnsRecipient/);
  assert.match(recipientUtils, /ensClient\.getEnsAddress/);
  assert.match(recipientUtils, /ensClient\.getEnsName/);
  assert.doesNotMatch(send, /\+eth\\b/);
  assert.doesNotMatch(recipientUtils, /\+eth\\b/);
  assert.match(recipientUtils, /candidate\.includes\('\.'\)/);
  assert.match(send, /Checking ENS name/);
  assert.match(recipientUtils, /Wallet name confirmed/);
  assert.match(recipientHook, /handlePasteRecipient/);
  assert.match(recipientHook, /Clipboard\.getStringAsync/);
  assert.match(send, /QR photo/);
  assert.match(recipientHook, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(recipientHook, /scanFromURLAsync/);
});

test('message screens present agent messages and payment approvals plainly', () => {
  const terminal = read('app/(tabs)/terminal.tsx');
  const detail = read('app/terminal/[id].tsx');

  assert.match(terminal, /Message your agent/);
  assert.match(terminal, /approve payment requests/);
  assert.match(terminal, /Agent messages, payment requests, and work updates/);
  assert.match(terminal, /listTerminalSessions/);
  assert.doesNotMatch(terminal, /New message|ENS or Ethereum address|Lookup Recent Addresses|Lookup Regent Users/);
  assert.doesNotMatch(terminal, /lookupRecentMessageContacts|listRegentMessageContacts|connectWalletChannel/);
  assert.doesNotMatch(terminal, /Secure channel|secure agent chats/);
  assert.match(terminal, /Payment approval/);
  assert.match(detail, /Payment requested/);
  assert.match(detail, /Agent requests \$\{approval\.amount\} \$\{approval\.currency\}/);
  assert.match(detail, /Approve payment/);
  assert.match(detail, /sendTerminalMessage/);
  assert.match(detail, /resolveTerminalApproval/);
  assert.doesNotMatch(detail, /Connect secure channel|connectAgentChannel/);
});

test('approval card shows the full structured review schema', () => {
  const detail = read('app/terminal/[id].tsx');
  const types = read('types/regents.ts');
  const contract = read('api-contract.openapiv3.yaml');

  // Contract and types carry the structured fields.
  assert.match(contract, /PendingTerminalApproval:[\s\S]*?required: \[requestId, action, regentName, riskCopy, resolved\]/);
  assert.match(contract, /PendingTerminalApproval:[\s\S]*?amountUsd:/);
  assert.match(types, /export type PendingTerminalApproval = \{[\s\S]*?amountUsd\?: string;[\s\S]*?expiresAt\?: string;[\s\S]*?\}/);

  // Every schema field renders with a plain label.
  assert.match(detail, />Action<\/Text>/);
  assert.match(detail, />Requested by<\/Text>/);
  assert.match(detail, />Amount<\/Text>/);
  assert.match(detail, />Contract<\/Text>/);
  assert.match(detail, />Expires<\/Text>/);
  assert.match(detail, /\{pendingApproval\.riskCopy\}/);
  assert.match(detail, /approvalAmountLabel/);
  assert.match(detail, /approval\.amountUsd \? `\$\{base\} · \$\$\{approval\.amountUsd\} USD` : base/);
  assert.match(detail, /approvalExpiryLabel/);
  assert.match(detail, /In less than a minute/);
});

test('approve and deny are explicit, double-submit safe, and blocked once expired', () => {
  const detail = read('app/terminal/[id].tsx');

  // Both decisions disable while either is in flight.
  const denyButton = detail.slice(detail.indexOf("resolveApproval('denied')") - 400, detail.indexOf("resolveApproval('denied')"));
  const approveButton = detail.slice(detail.indexOf("resolveApproval('approved')") - 400, detail.indexOf("resolveApproval('approved')"));
  assert.match(denyButton, /disabled=\{!!resolvingDecision\}/);
  assert.match(approveButton, /disabled=\{!!resolvingDecision\}/);
  assert.match(detail, /resolvingDecision === 'denied' \? 'Denying\.\.\.' : 'Deny'/);
  assert.match(detail, /resolvingDecision === 'approved' \? 'Approving\.\.\.'/);

  // Expired approvals cannot be resolved: render guard plus action guard.
  assert.match(detail, /\{approvalExpired \? \(/);
  assert.match(detail, /This request expired before a decision was made/);
  assert.match(detail, /if \(isApprovalExpired\(approval, Date\.now\(\)\)\) \{\s*return;/);
  assert.match(detail, /isApprovalExpired\(pendingApproval, nowMs\)/);
});
