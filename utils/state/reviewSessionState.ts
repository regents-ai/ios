import AsyncStorage from '@react-native-async-storage/async-storage';

import { TEST_ACCOUNTS } from '@/constants/TestAccounts';

const TEST_SESSION_KEY = '@onramp_test_session';

let testSessionActive = false;
let testWalletEvm: string | null = null;
let testWalletSol: string | null = null;

function applySessionState(active: boolean, evm: string | null, sol: string | null) {
  testSessionActive = active;
  testWalletEvm = evm;
  testWalletSol = sol;
}

export function isLocalTestSessionEnabled() {
  return process.env.EXPO_PUBLIC_ENABLE_TEST_SESSION === 'true';
}

export function isTestSessionActive() {
  return testSessionActive;
}

export function getTestWalletEvm() {
  return testWalletEvm;
}

export function getTestWalletSol() {
  return testWalletSol;
}

export function activateLocalTestSession() {
  applySessionState(true, TEST_ACCOUNTS.wallets.evm, TEST_ACCOUNTS.wallets.solana);
}

export async function setTestSession(evmAddress: string, solAddress: string) {
  applySessionState(true, evmAddress, solAddress);

  await AsyncStorage.setItem(
    TEST_SESSION_KEY,
    JSON.stringify({
      active: true,
      evm: evmAddress,
      sol: solAddress,
    })
  );
}

export async function clearTestSession() {
  applySessionState(false, null, null);
  await AsyncStorage.removeItem(TEST_SESSION_KEY);
}

export async function hydrateTestSession() {
  try {
    const data = await AsyncStorage.getItem(TEST_SESSION_KEY);

    if (!data) {
      return;
    }

    const parsed = JSON.parse(data);
    if (parsed.active && parsed.evm && parsed.sol) {
      applySessionState(true, parsed.evm, parsed.sol);
      return;
    }

    await clearTestSession();
  } catch (error) {
    console.error('❌ Error hydrating test session:', error);
    await clearTestSession();
  }
}
