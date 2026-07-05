/**
 * Secure persistence for paired local Hermes voice gateways, keyed per agent.
 *
 * Each self-run agent pairs its own computer, so a paired gateway is stored
 * under that agent's wallet address. The pairing token is a secret, so gateways
 * live only in the device keychain (via the hardened scoped secure store),
 * never in plain storage, and are never logged.
 *
 * Kept separate from utils/voice/localGateway so the pure parse/URL/mint logic
 * there stays free of native SecureStore.
 */

import { createScopedSecureStore, environmentScope } from '@/utils/scopedSecureStore';
import {
  normalizeAgentWallet,
  parsePairingPayload,
  type LocalVoiceGateway,
} from '@/utils/voice/localGateway';

// One keychain entry per agent wallet within an environment scope. The value is
// the JSON payload; the token lives only inside the keychain.
const PAIRED_GATEWAY_KEY_PREFIX = 'hermesVoice.localGateway';
const store = createScopedSecureStore(environmentScope());

function gatewayKey(agentWallet: string): string {
  return `${PAIRED_GATEWAY_KEY_PREFIX}.${normalizeAgentWallet(agentWallet)}`;
}

/** Persists the paired gateway for its agent to the keychain. */
export async function savePairedGateway(gateway: LocalVoiceGateway): Promise<void> {
  await store.setItem(gatewayKey(gateway.agentWallet), JSON.stringify(gateway));
}

/**
 * Reads the paired gateway for one agent from the keychain, or null when that
 * agent has no paired computer.
 */
export async function readPairedGateway(agentWallet: string): Promise<LocalVoiceGateway | null> {
  const raw = await store.getItem(gatewayKey(agentWallet));
  if (!raw) {
    return null;
  }
  return parsePairingPayload(raw);
}

/** Removes one agent's paired gateway from the keychain (disconnect). */
export async function clearPairedGateway(agentWallet: string): Promise<void> {
  await store.deleteItem(gatewayKey(agentWallet));
}
