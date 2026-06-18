import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurrentWalletAddress,
  getWalletAddressForNetwork,
  setCurrentNetwork,
  setCurrentSolanaAddress,
  setCurrentWalletAddress,
} from '../utils/state/walletRuntimeState';

const evmAddress = '0x1111111111111111111111111111111111111111';
const solanaAddress = '9xQeWvG816bnpHmjTuiCGB1zSxhGfWSFNdRKnyhVbqRb';

test('an EVM wallet address is never returned for Solana networks', () => {
  setCurrentWalletAddress(evmAddress);
  setCurrentSolanaAddress(null);

  assert.equal(getWalletAddressForNetwork('base'), evmAddress);
  assert.equal(getWalletAddressForNetwork('ethereum'), evmAddress);
  assert.equal(getWalletAddressForNetwork('solana'), null);
  assert.equal(getWalletAddressForNetwork('solana-devnet'), null);
});

test('a Solana wallet address is never returned for EVM networks', () => {
  setCurrentWalletAddress(null);
  setCurrentSolanaAddress(solanaAddress);

  assert.equal(getWalletAddressForNetwork('solana'), solanaAddress);
  assert.equal(getWalletAddressForNetwork('base'), null);
  assert.equal(getWalletAddressForNetwork('ethereum'), null);
});

test('unknown networks resolve no wallet address at all', () => {
  setCurrentWalletAddress(evmAddress);
  setCurrentSolanaAddress(solanaAddress);

  assert.equal(getWalletAddressForNetwork('bitcoin'), null);
});

test('the current wallet address follows the selected network', () => {
  setCurrentWalletAddress(evmAddress);
  setCurrentSolanaAddress(solanaAddress);

  setCurrentNetwork('Base');
  assert.equal(getCurrentWalletAddress(), evmAddress);

  setCurrentNetwork('Solana');
  assert.equal(getCurrentWalletAddress(), solanaAddress);
});
