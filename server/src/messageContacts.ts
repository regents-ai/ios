import { createPublicClient, getAddress, http, isAddress, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';
import { z } from 'zod';

export type MessageContactKind = 'recent_ens' | 'regent_agent' | 'regent_human';

export type MessageContactLookupTarget = {
  input: string;
  address: string;
  ensName?: string;
};

export type MessageContactSuggestion = {
  id: string;
  kind: MessageContactKind;
  label: string;
  address: string;
  ensName?: string;
  detail?: string;
  agentId?: string;
};

export type RecentEnsContactLookup =
  | { kind: 'ok'; target: MessageContactLookupTarget; contacts: MessageContactSuggestion[] }
  | { kind: 'bad_request'; message: string }
  | { kind: 'missing_config'; requiredEnv: 'ETHEREUM_RPC_URL' | 'ETHERSCAN_API_KEY' }
  | { kind: 'upstream_error'; message: string };

export type MessageContactClient = {
  lookupRecentEnsContacts(addressOrName: string): Promise<RecentEnsContactLookup>;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const etherscanTransactionSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const etherscanResponseSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  result: z.union([z.array(etherscanTransactionSchema), z.string()]),
});

const etherscanBaseUrl = 'https://api.etherscan.io/v2/api';
const etherscanChainId = '1';
const recentTransactionLimit = 50;
const contactLimit = 12;

function normalizeAddress(address: string) {
  return getAddress(address);
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function publicEthereumClient(rpcUrl: string) {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

async function resolveLookupTarget(input: string, rpcUrl: string): Promise<MessageContactLookupTarget | null> {
  const value = input.trim();
  if (isAddress(value)) {
    const address = normalizeAddress(value);
    const client = publicEthereumClient(rpcUrl);
    const reverseName = await client.getEnsName({ address: address as Address }).catch(() => null);
    const target: MessageContactLookupTarget = {
      input: value,
      address,
    };
    if (reverseName) {
      target.ensName = reverseName;
    }
    return target;
  }

  if (!value.includes('.')) {
    return null;
  }

  const ensName = normalize(value);
  const client = publicEthereumClient(rpcUrl);
  const address = await client.getEnsAddress({ name: ensName }).catch(() => null);
  if (!address) {
    return null;
  }

  return {
    input: value,
    address: normalizeAddress(address),
    ensName,
  };
}

async function recentCounterparties(fetchImpl: FetchLike, targetAddress: string, etherscanApiKey: string) {
  const url = new URL(etherscanBaseUrl);
  url.searchParams.set('chainid', etherscanChainId);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'txlist');
  url.searchParams.set('address', targetAddress);
  url.searchParams.set('startblock', '0');
  url.searchParams.set('endblock', '99999999');
  url.searchParams.set('page', '1');
  url.searchParams.set('offset', String(recentTransactionLimit));
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('apikey', etherscanApiKey);

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`Etherscan returned HTTP ${response.status}.`);
  }

  const parsed = etherscanResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Etherscan returned an unexpected response.');
  }

  if (typeof parsed.data.result === 'string') {
    if (parsed.data.message === 'No transactions found') {
      return [];
    }
    throw new Error(parsed.data.result);
  }

  const addresses: string[] = [];
  for (const tx of parsed.data.result) {
    const peers = [tx.from, tx.to].filter((value) => isAddress(value) && !sameAddress(value, targetAddress));
    for (const peer of peers) {
      const normalized = normalizeAddress(peer);
      if (!addresses.some((existing) => sameAddress(existing, normalized))) {
        addresses.push(normalized);
      }
      if (addresses.length >= contactLimit) {
        return addresses;
      }
    }
  }

  return addresses;
}

async function contactForReverseEns(rpcUrl: string, address: string): Promise<MessageContactSuggestion | null> {
  const client = publicEthereumClient(rpcUrl);
  const normalizedAddress = normalizeAddress(address);
  const ensName = await client.getEnsName({ address: normalizedAddress as Address }).catch(() => null);
  if (!ensName) {
    return null;
  }

  const forwardAddress = await client.getEnsAddress({ name: normalize(ensName) }).catch(() => null);
  if (!forwardAddress || !sameAddress(forwardAddress, normalizedAddress)) {
    return null;
  }

  return {
    id: `recent:${ensName}:${normalizedAddress}`,
    kind: 'recent_ens',
    label: ensName,
    address: normalizedAddress,
    ensName,
    detail: 'Recent contact',
  };
}

export function createMessageContactClient(fetchImpl: FetchLike = fetch): MessageContactClient {
  return {
    async lookupRecentEnsContacts(addressOrName: string) {
      const rpcUrl = process.env.ETHEREUM_RPC_URL?.trim();
      if (!rpcUrl) {
        return { kind: 'missing_config', requiredEnv: 'ETHEREUM_RPC_URL' };
      }

      const etherscanApiKey = process.env.ETHERSCAN_API_KEY?.trim();
      if (!etherscanApiKey) {
        return { kind: 'missing_config', requiredEnv: 'ETHERSCAN_API_KEY' };
      }

      let target: MessageContactLookupTarget | null;
      try {
        target = await resolveLookupTarget(addressOrName, rpcUrl);
      } catch {
        return { kind: 'bad_request', message: 'Enter an Ethereum address or ENS name.' };
      }

      if (!target) {
        return { kind: 'bad_request', message: 'Enter an Ethereum address or ENS name.' };
      }

      try {
        const counterparties = await recentCounterparties(fetchImpl, target.address, etherscanApiKey);
        const contacts = (await Promise.all(
          counterparties.map((address) => contactForReverseEns(rpcUrl, address)),
        )).filter((contact): contact is MessageContactSuggestion => !!contact);

        return { kind: 'ok', target, contacts };
      } catch (error) {
        return {
          kind: 'upstream_error',
          message: error instanceof Error ? error.message : 'Recent contacts are unavailable right now.',
        };
      }
    },
  };
}
