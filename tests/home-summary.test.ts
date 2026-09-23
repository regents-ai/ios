import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { User as PrivyUser } from '@privy-io/api-types';

import type { AutolaunchAuction } from '../types/autolaunch';
import type { MobileAgent } from '../types/regents';
import {
  agentCountCopy,
  agentsUsdcTotal,
  openAuctionCount,
  openAuctionsCopy,
  websiteWalletAddresses,
} from '../utils/home/homeSummary';

const phoneWallet = '0xAbCdEf1111111111111111111111111111111111';
const websiteEmbedded = '0xDeF0222222222222222222222222222222222222';
const websiteExternal = '0x3333333333333333333333333333333333333333';

function linkedAccounts(accounts: object[]) {
  return accounts as PrivyUser['linked_accounts'];
}

test('website wallets are the linked Ethereum wallets other than the phone wallet, once each', () => {
  const accounts = linkedAccounts([
    { type: 'email', address: 'someone@example.com' },
    { type: 'wallet', chain_type: 'ethereum', address: websiteEmbedded, wallet_client_type: 'privy' },
    { type: 'wallet', chain_type: 'solana', address: 'So1anaAddress111111111111111111111111111111' },
    { type: 'wallet', chain_type: 'ethereum', address: phoneWallet.toLowerCase() },
    { type: 'wallet', chain_type: 'ethereum', address: websiteExternal, wallet_client_type: 'metamask' },
    { type: 'wallet', chain_type: 'ethereum', address: websiteEmbedded.toLowerCase() },
    { type: 'smart_wallet', address: '0x4444444444444444444444444444444444444444' },
  ]);

  assert.deepEqual(websiteWalletAddresses(accounts, phoneWallet), [websiteEmbedded, websiteExternal]);
  assert.deepEqual(websiteWalletAddresses(linkedAccounts([]), phoneWallet), []);
  assert.equal(websiteWalletAddresses(accounts, null).length, 3);
});

test('the agents total adds every readable USDC balance exactly', () => {
  const agent = (usdcBalance: string | null) => ({ usdcBalance }) as MobileAgent;
  assert.equal(agentsUsdcTotal([agent('0.1'), agent('0.2'), agent(null), agent('1000000.000001')]), '1000000.300001');
  assert.equal(agentsUsdcTotal([]), '0');
});

test('open auctions are the ones taking bids, said in plain words', () => {
  const auction = (state: AutolaunchAuction['state']) => ({ state }) as AutolaunchAuction;
  assert.equal(openAuctionCount([auction('active'), auction('created'), auction('active'), auction('failed')]), 2);
  assert.equal(openAuctionsCopy(0), 'No auctions are open right now.');
  assert.equal(openAuctionsCopy(1), '1 auction is open now.');
  assert.equal(openAuctionsCopy(3), '3 auctions are open now.');
  assert.equal(agentCountCopy(1), '1 agent');
  assert.equal(agentCountCopy(4), '4 agents');
});

test('Home reads each card on its own and says plainly when one is unavailable', () => {
  const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

  assert.match(home, /regentApi\.getPortfolio\(\{ wallets: \[phoneWallet\] \}\)/);
  assert.match(home, /websiteWalletAddresses\(privyUser\?\.linked_accounts/);
  assert.match(home, /View only\. Manage it on regents\.sh\./);
  assert.match(home, /No website wallet is linked to your account\./);
  assert.match(home, /regentApi\.listAgents\(\)/);
  assert.match(home, /listAutolaunchAuctions\(\)/);
  assert.match(home, /fetchTechtreeResults\(\)/);
  assert.match(home, /routes\.earn\(\)/);
  assert.equal([...home.matchAll(/failedCopy="/g)].length, 5);
  assert.match(home, /RefreshControl/);
});
