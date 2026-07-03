/**
 * Secure persistence for the paired local Hermes voice gateway.
 *
 * The pairing token is a secret, so the paired gateway is stored only in the
 * device keychain (via the hardened scoped secure store), never in plain
 * storage, and it is never logged. Kept separate from utils/voice/localGateway
 * so the pure parse/URL/mint logic there stays free of native SecureStore.
 */

import { createScopedSecureStore, environmentScope } from '@/utils/scopedSecureStore';
import { parsePairingPayload, type LocalVoiceGateway } from '@/utils/voice/localGateway';

// One keychain entry per environment scope. The value is the JSON payload; the
// token lives only inside the keychain.
const PAIRED_GATEWAY_KEY = 'hermesVoice.localGateway';
const store = createScopedSecureStore(environmentScope());

/** Persists the paired gateway to the keychain. */
export async function savePairedGateway(gateway: LocalVoiceGateway): Promise<void> {
  await store.setItem(PAIRED_GATEWAY_KEY, JSON.stringify(gateway));
}

/** Reads the paired gateway from the keychain, or null when none is paired. */
export async function readPairedGateway(): Promise<LocalVoiceGateway | null> {
  const raw = await store.getItem(PAIRED_GATEWAY_KEY);
  if (!raw) {
    return null;
  }
  return parsePairingPayload(raw);
}

/** Removes the paired gateway from the keychain (disconnect / switch to hosted). */
export async function clearPairedGateway(): Promise<void> {
  await store.deleteItem(PAIRED_GATEWAY_KEY);
}
