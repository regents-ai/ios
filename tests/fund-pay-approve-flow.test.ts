import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test('main mobile tabs are Home, Fund, Pay and Earn, in that order', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const sendTab = read('app/(tabs)/send.tsx');
  const earnTab = read('app/(tabs)/earn.tsx');
  const profileButton = read('components/navigation/ProfileButton.tsx');

  assert.match(
    layout,
    /name="index"[\s\S]*title: 'Home'[\s\S]*name="wallet"[\s\S]*title: 'Fund'[\s\S]*name="send"[\s\S]*title: 'Pay'[\s\S]*name="earn"[\s\S]*title: 'Earn'/
  );
  assert.match(layout, /name="agents"[\s\S]*href: null/);
  assert.match(layout, /name="autolaunch"[\s\S]*href: null/);
  assert.match(sendTab, /export \{ default \} from '\.\.\/wallet\/send'/);
  assert.match(earnTab, /regentApi\.getRegentStaking\(/);
  assert.match(profileButton, /accessibilityLabel="Open profile"/);
});

test('my agents list and wallet screens use the agent money story', () => {
  const agents = read('app/(tabs)/agents.tsx');
  const wallet = read('app/(tabs)/wallet.tsx');
  const onramp = read('components/onramp/onramp-form-sections.tsx');

  assert.match(agents, /regentApi\.listAgents\(\)/);
  assert.match(agents, /Add your first agent/);
  assert.match(agents, /routes\.addAgent\(\)/);
  assert.match(agents, /Add USDC/);
  assert.match(agents, /formatUsdcBalance\(agent\.usdcBalance\)/);
  assert.match(agents, /label="Paired"/);

  assert.match(wallet, /Add funds for agent work/);
  assert.match(wallet, /label: 'Pay'/);
  assert.match(wallet, /Apple Pay to USDC on Base/);
  assert.match(onramp, /Fund an agent working balance/);
  assert.match(onramp, /Swipe to add USDC/);
});

test('agent detail starts the fund-agent send flow without a server prepare step', () => {
  const agentDetail = read('app/agent/[id].tsx');
  const routes = read('utils/navigation/routes.ts');

  assert.match(routes, /walletSend\(params\?:/);
  assert.match(agentDetail, /routes\.walletSend\(\{/);
  assert.match(agentDetail, /flow: 'agent-funding'/);
  assert.match(agentDetail, /recipientAddress: agent\.walletAddress/);
  assert.match(agentDetail, /recipientLabel: agent\.name/);
  assert.match(agentDetail, /Add funds/);
  assert.match(agentDetail, /regentApi\.renameAgent/);
  assert.match(agentDetail, /regentApi\.removeAgent/);
  assert.match(agentDetail, /routes\.agentPairing\(/);
});

test('agent funding mode prefers Base USDC and points to the Fund tab when short', () => {
  const send = read('app/wallet/send.tsx');
  const fundingChoicesHook = read('hooks/wallet/useFundingChoices.ts');
  const userOpAlertsHook = read('hooks/wallet/useUserOpStatusAlerts.ts');
  const confirmationModal = read('components/wallet/SendConfirmationModal.tsx');
  const fundingChoices = read('utils/fetchWalletFundingChoices.ts');

  assert.match(send, /const AGENT_FUNDING_FLOW = 'agent-funding'/);
  assert.match(send, /const SEND_FLOW = 'send'/);
  assert.match(fundingChoicesHook, /fetchWalletFundingChoices\(\{ evmAddress: smartAccountAddress \}\)/);
  assert.match(fundingChoicesHook, /choices\.find\(isBaseUsdcBalance\)/);
  assert.match(fundingChoicesHook, /setNetwork\('base'\)/);
  assert.match(send, /Add USDC first/);
  assert.match(send, /router\.push\(routes\.wallet\(\)\)/);
  assert.match(send, /noBaseUsdcForSend/);
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
  assert.match(send, /placeholder=\{isSolanaNetwork\(network\) \? 'Solana address' : 'Address or ENS'\}/);
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
