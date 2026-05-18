import { regentApi } from '@/utils/regentApi/client';
import { getOrCreateSecureMessagingDbKey } from '@/utils/xmtp/secureMessagingKeys';
import type { MessageThread, PhoneXmtpIdentity, XmtpEnvironment } from '@/types/regents';
import { useCurrentUser, useEvmAccounts, useSignEvmMessage } from '@coinbase/cdp-hooks';
import { Client, PublicIdentity, XmtpProvider, type Signer } from '@xmtp/react-native-sdk';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type SecureMessagingStatus = 'idle' | 'connecting' | 'ready' | 'error';

type SecureMessagingContextValue = {
  client: Client | null;
  environment: XmtpEnvironment;
  phoneIdentity: PhoneXmtpIdentity | null;
  status: SecureMessagingStatus;
  errorMessage: string | null;
  connectPhoneIdentity: () => Promise<{ client: Client; identity: PhoneXmtpIdentity }>;
  connectAgentChannel: (input: { threadId: string; agentId: string }) => Promise<MessageThread>;
  connectWalletChannel: (input: { recipientAddress: string }) => Promise<{ conversationId: string }>;
};

type ClientRecord = {
  client: Client;
  userId: string;
  walletAddress: string;
  environment: XmtpEnvironment;
};

const SecureMessagingContext = createContext<SecureMessagingContextValue | null>(null);

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function isEthereumAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function appVersion() {
  return `regents-mobile/${Constants.expoConfig?.version || 'dev'}`;
}

export function RegentsXmtpProvider({
  children,
  environment,
}: {
  children: React.ReactNode;
  environment: XmtpEnvironment;
}) {
  const { currentUser } = useCurrentUser();
  const { evmAccounts } = useEvmAccounts();
  const { signEvmMessage } = useSignEvmMessage();
  const [client, setClient] = useState<Client | null>(null);
  const [phoneIdentity, setPhoneIdentity] = useState<PhoneXmtpIdentity | null>(null);
  const [status, setStatus] = useState<SecureMessagingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientRef = useRef<ClientRecord | null>(null);
  const userId = currentUser?.userId || '';
  const eoaAddress = evmAccounts?.[0]?.address || '';

  useEffect(() => {
    if (!userId) {
      clientRef.current = null;
      setClient(null);
      setPhoneIdentity(null);
      setStatus('idle');
      setErrorMessage(null);
    }
  }, [userId]);

  const createSigner = useCallback((walletAddress: string): Signer => ({
    getIdentifier: async () => new PublicIdentity(normalizeAddress(walletAddress), 'ETHEREUM'),
    getChainId: () => undefined,
    getBlockNumber: () => undefined,
    signerType: () => 'EOA',
    signMessage: async (message: string) => {
      const result = await signEvmMessage({
        evmAccount: walletAddress as `0x${string}`,
        message,
      });
      return { signature: result.signature };
    },
  }), [signEvmMessage]);

  const connectPhoneIdentity = useCallback(async () => {
    if (!userId || !eoaAddress) {
      throw new Error('Secure messages are not ready yet.');
    }

    setStatus('connecting');
    setErrorMessage(null);

    try {
      const normalizedWallet = normalizeAddress(eoaAddress);
      const existing = clientRef.current;
      let nextClient = existing?.userId === userId &&
        existing.walletAddress === normalizedWallet &&
        existing.environment === environment
        ? existing.client
        : null;

      if (!nextClient) {
        const dbEncryptionKey = await getOrCreateSecureMessagingDbKey(
          { userId, walletAddress: normalizedWallet, environment },
          {
            store: {
              getItemAsync: SecureStore.getItemAsync,
              setItemAsync: (key, value) =>
                SecureStore.setItemAsync(key, value, {
                  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
                }),
            },
            randomBytes: (size) => Crypto.getRandomBytesAsync(size),
          },
        );

        nextClient = await Client.create(createSigner(normalizedWallet), {
          env: environment,
          dbEncryptionKey,
          appVersion: appVersion(),
        });

        clientRef.current = {
          client: nextClient,
          userId,
          walletAddress: normalizedWallet,
          environment,
        };
        setClient(nextClient);
      }

      const identity = await regentApi.registerPhoneXmtpIdentity({
        inboxId: nextClient.inboxId,
        installationId: nextClient.installationId,
        walletAddress: normalizedWallet,
        environment,
      });

      setPhoneIdentity(identity);
      setStatus('ready');
      return { client: nextClient, identity };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not connect secure messages.';
      setErrorMessage(message);
      setStatus('error');
      throw error;
    }
  }, [createSigner, environment, eoaAddress, userId]);

  const connectAgentChannel = useCallback(async (input: { threadId: string; agentId: string }) => {
    const { client: readyClient } = await connectPhoneIdentity();
    const agentIdentity = await regentApi.getAgentXmtpIdentity(input.agentId).catch(() => null);
    if (!agentIdentity || agentIdentity.environment !== environment) {
      throw new Error('This agent is not ready for secure messages yet.');
    }

    const dm = await readyClient.conversations.findOrCreateDm(agentIdentity.inboxId);
    await dm.updateConsent('allowed');

    return regentApi.linkXmtpConversation({
      threadId: input.threadId,
      conversationId: dm.id,
      conversationKind: 'dm',
      environment,
    });
  }, [connectPhoneIdentity, environment]);

  const connectWalletChannel = useCallback(async (input: { recipientAddress: string }) => {
    const walletAddress = input.recipientAddress.trim();
    if (!isEthereumAddress(walletAddress)) {
      throw new Error('Enter an Ethereum address or ENS name.');
    }

    const { client: readyClient } = await connectPhoneIdentity();
    const peerIdentity = new PublicIdentity(normalizeAddress(walletAddress), 'ETHEREUM');
    const peerInboxId = await readyClient.findInboxIdFromIdentity(peerIdentity);
    if (!peerInboxId) {
      throw new Error('This address is not ready for secure messages yet.');
    }

    const dm = await readyClient.conversations.findOrCreateDm(peerInboxId);
    await dm.updateConsent('allowed');
    return { conversationId: dm.id };
  }, [connectPhoneIdentity]);

  const value = useMemo<SecureMessagingContextValue>(() => ({
    client,
    environment,
    phoneIdentity,
    status,
    errorMessage,
    connectPhoneIdentity,
    connectAgentChannel,
    connectWalletChannel,
  }), [client, connectAgentChannel, connectPhoneIdentity, connectWalletChannel, environment, errorMessage, phoneIdentity, status]);

  return (
    <SecureMessagingContext.Provider value={value}>
      <XmtpProvider client={client ?? undefined}>
        {children}
      </XmtpProvider>
    </SecureMessagingContext.Provider>
  );
}

export function useRegentsXmtp() {
  const value = useContext(SecureMessagingContext);
  if (!value) {
    throw new Error('Secure messages are not available.');
  }
  return value;
}
