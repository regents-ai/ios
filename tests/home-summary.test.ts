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
  regentsBalanceWallet,
} from '../utils/home/homeSummary';
import { usdcTopUp } from '../utils/onchain/baseUsdc';

const phoneWallet = '0xAbCdEf1111111111111111111111111111111111';
const websiteEmbedded = '0xDeF0222222222222222222222222222222222222';
const websiteExternal = '0x3333333333333333333333333333333333333333';

function linkedAccounts(accounts: object[]) {
  return accounts as PrivyUser['linked_accounts'];
}

test('the Regents Balance is the most recently verified linked Ethereum wallet other than the phone wallet', () => {
  const accounts = linkedAccounts([
    { type: 'email', address: 'someone@example.com', latest_verified_at: 900 },
    { type: 'wallet', chain_type: 'ethereum', address: websiteEmbedded, wallet_client_type: 'privy', latest_verified_at: 100 },
    { type: 'wallet', chain_type: 'solana', address: 'So1anaAddress111111111111111111111111111111', latest_verified_at: 800 },
    { type: 'wallet', chain_type: 'ethereum', address: phoneWallet.toLowerCase(), latest_verified_at: 700 },
    { type: 'wallet', chain_type: 'ethereum', address: websiteExternal, wallet_client_type: 'metamask', latest_verified_at: 300 },
    { type: 'wallet', chain_type: 'ethereum', address: '0x5555555555555555555555555555555555555555', latest_verified_at: null },
    { type: 'smart_wallet', address: '0x4444444444444444444444444444444444444444', latest_verified_at: 600 },
  ]);

  assert.equal(regentsBalanceWallet(accounts, phoneWallet), websiteExternal);
  assert.equal(regentsBalanceWallet(accounts, null), phoneWallet.toLowerCase());
});

test('there is no Regents Balance without a verified linked Ethereum wallet besides the phone wallet', () => {
  assert.equal(regentsBalanceWallet(linkedAccounts([]), phoneWallet), null);
  assert.equal(
    regentsBalanceWallet(
      linkedAccounts([
        { type: 'wallet', chain_type: 'ethereum', address: phoneWallet.toLowerCase(), latest_verified_at: 700 },
        { type: 'wallet', chain_type: 'ethereum', address: websiteEmbedded, latest_verified_at: null },
      ]),
      phoneWallet,
    ),
    null,
  );
});

test('the USDC to add covers the shortfall to the cent and never goes below the smallest purchase', () => {
  assert.equal(usdcTopUp('10', '10'), null);
  assert.equal(usdcTopUp('10', '12.5'), null);
  assert.equal(usdcTopUp('25', '10'), '15.00');
  assert.equal(usdcTopUp('10.001', '0'), '10.01');
  assert.equal(usdcTopUp('3', '2.5'), '2.00');
  assert.equal(usdcTopUp('', '0'), null);
  assert.equal(usdcTopUp('1.2.3', '0'), null);
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
  assert.match(home, /regentApi\.getPortfolio\(\{ wallets: \[regentsBalanceWallet\] \}\)/);
  assert.match(home, /View only here\. Add to it from Fund\./);
  assert.match(home, /<RegentsBalanceSetup \/>/);
  assert.match(home, /regentApi\.listAgents\(\)/);
  assert.match(home, /listAutolaunchAuctions\(\)/);
  assert.match(home, /fetchTechtreeResults\(\)/);
  assert.match(home, /routes\.earn\(\)/);
  assert.equal([...home.matchAll(/failedCopy="/g)].length, 5);
  assert.match(home, /RefreshControl/);
});
