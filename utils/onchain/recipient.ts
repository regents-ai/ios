/**
 * Recipient resolution helpers for the send flow.
 *
 * Pure parsing (candidate extraction, address checksum, ENS shape checks)
 * plus the async ENS forward/reverse resolution used before money moves.
 */

import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

const ETHEREUM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
const ENS_NAME_PATTERN = /(?:[a-z0-9-]+\.)+[a-z0-9-]+\b/i;

export type EnsResolution = {
  address: string;
  name: string;
  reverseName: string | null;
  reverseMatches: boolean;
};

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

function readRecipientFromQuery(value: string) {
  const queryIndex = value.indexOf('?');
  if (queryIndex === -1) return null;

  const query = value.slice(queryIndex + 1);
  const params = new URLSearchParams(query);

  for (const key of ['address', 'to', 'recipient']) {
    const candidate = params.get(key);
    if (candidate) return candidate;
  }

  return null;
}

export function extractRecipientCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const queryRecipient = readRecipientFromQuery(trimmed);
  if (queryRecipient) return queryRecipient.trim();

  const addressMatch = trimmed.match(ETHEREUM_ADDRESS_PATTERN);
  if (addressMatch) return addressMatch[0];

  const ensMatch = trimmed.match(ENS_NAME_PATTERN);
  if (ensMatch) return ensMatch[0];

  let candidate = trimmed;
  if (candidate.toLowerCase().startsWith('ethereum:')) {
    candidate = candidate.slice('ethereum:'.length);
  }
  if (candidate.toLowerCase().startsWith('pay-')) {
    candidate = candidate.slice('pay-'.length);
  }

  candidate = candidate.split('?')[0]?.split('@')[0]?.split('/')[0] || candidate;
  return candidate.trim();
}

export function getEthereumRecipientAddress(value: string) {
  const candidate = extractRecipientCandidate(value);
  return isAddress(candidate) ? getAddress(candidate) : null;
}

export function isLikelyEnsName(value: string) {
  const candidate = extractRecipientCandidate(value);
  if (!candidate.includes('.')) return false;

  try {
    normalize(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolveEnsRecipient(value: string): Promise<EnsResolution> {
  const name = normalize(extractRecipientCandidate(value));
  const address = await ensClient.getEnsAddress({ name });

  if (!address) {
    throw new Error('That ENS name does not point to an Ethereum wallet.');
  }

  const checksummedAddress = getAddress(address);
  let reverseName: string | null = null;

  try {
    reverseName = await ensClient.getEnsName({ address: checksummedAddress });
  } catch {
    reverseName = null;
  }

  const normalizedReverseName = reverseName ? normalize(reverseName) : null;

  return {
    address: checksummedAddress,
    name,
    reverseName: normalizedReverseName,
    reverseMatches: normalizedReverseName?.toLowerCase() === name.toLowerCase(),
  };
}

export function getEnsResolutionCopy(resolution: EnsResolution) {
  if (resolution.reverseMatches && resolution.reverseName) {
    return `Wallet name confirmed: ${resolution.reverseName}`;
  }

  if (resolution.reverseName) {
    return `Wallet name: ${resolution.reverseName}`;
  }

  return 'No wallet name found. Check the address before you send.';
}
