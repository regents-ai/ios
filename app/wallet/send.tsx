/**
 * Transfer Page - Send tokens to any address
 *
 * Features:
 * - Network selection (Base, Ethereum, Solana)
 * - Token selector
 * - Recipient address input with validation
 * - Amount input with quick % buttons (10%, 50%, 100%)
 * - USD value preview
 * - Gasless transfers on Base via Paymaster
 * - Transaction confirmation and status
 *
 * IMPORTANT: Both Base and Ethereum use Smart Account (balances stored there)
 */

import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { isTestSessionActive, recordPendingAgentFunding } from '@/utils/sharedState';
import { useCurrentUser, useSendSolanaTransaction, useSendUserOperation, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { parseEther, parseUnits } from 'viem';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER } = COLORS;

export default function TransferScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const recipientLabel = typeof params.recipientLabel === 'string' ? params.recipientLabel : null;
  const sourceAgentId = typeof params.sourceAgentId === 'string' ? params.sourceAgentId : null;
  const sourceAgentName = typeof params.sourceAgentName === 'string' ? params.sourceAgentName : recipientLabel;

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [network, setNetwork] = useState('base'); // base, ethereum, solana
  const [sending, setSending] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  // Alert states
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'error' | 'info'>('info');
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [isPendingAlert, setIsPendingAlert] = useState(false); // Track if alert is showing pending state

  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = useState(false);

  const { sendSolanaTransaction } = useSendSolanaTransaction();
  const { sendUserOperation, status: userOpStatus, data: userOpData, error: userOpError } = useSendUserOperation();
  const { solanaAddress } = useSolanaAddress();
  const { currentUser } = useCurrentUser();

  // Get smart account address (where balances are stored for both Base and Ethereum)
  const smartAccountAddress = currentUser?.evmSmartAccounts?.[0] || null;

  // Paymaster only supports specific tokens on Base: USDC, EURC, BTC (CBBTC)
  const tokenSymbol = selectedToken?.token?.symbol?.toUpperCase() || '';
  // Paymaster support:
  // - Base mainnet: USDC, EURC, BTC only
  // - Base Sepolia: All tokens (all transactions sponsored)
  const isPaymasterSupported =
    (network === 'base' && ['USDC', 'EURC', 'BTC'].includes(tokenSymbol)) ||
    (network === 'base-sepolia');

  // Check if this is a native token transfer (ETH on EVM, SOL on Solana)
  // Native tokens don't have contract addresses and require gas fees
  // Also check for sentinel addresses: 0x0000... or 0xeeee... (used by SDKs to represent native tokens)
  const contractAddress = selectedToken?.token?.contractAddress;
  const mintAddress = selectedToken?.token?.mintAddress;

  // For Solana: native SOL has no mintAddress, SPL tokens have mintAddress
  // For EVM: native ETH has no/sentinel contractAddress, ERC-20s have real contractAddress
  const isNativeToken = !mintAddress && (
    !contractAddress ||
    contractAddress === '0x0000000000000000000000000000000000000000' ||
    contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  );
  const needsGasFee = isNativeToken && !isPaymasterSupported;

  useEffect(() => {
    if (userOpStatus === 'pending' && userOpData?.userOpHash) {
      showAlert(
        'Sending funds',
        'Your transfer is on the way. This can take a few moments.',
        'info',
        undefined,
        true
      );
    } else if (userOpStatus === 'success' && userOpData) {
      const txHash = userOpData.transactionHash || userOpData.userOpHash;
      const networkLower = network.toLowerCase();

      let explorerUrl = '';
      if (networkLower === 'base') {
        explorerUrl = `https://basescan.org/tx/${txHash}`;
      } else if (networkLower === 'base-sepolia') {
        explorerUrl = `https://sepolia.basescan.org/tx/${txHash}`;
      } else if (networkLower === 'ethereum') {
        explorerUrl = `https://etherscan.io/tx/${txHash}`;
      } else if (networkLower === 'ethereum-sepolia') {
        explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
      } else {
        explorerUrl = `Transaction Hash: ${txHash}`;
      }

      const successInfo = [
        `${amount} ${selectedToken?.token?.symbol || ''} sent successfully.`,
        '',
        `Network: ${network.charAt(0).toUpperCase() + network.slice(1)}`,
        `From: ${smartAccountAddress?.slice(0, 6)}...${smartAccountAddress?.slice(-4)}`,
      ].join('\n');

      showAlert(
        'Transfer complete',
        successInfo,
        'success',
        explorerUrl
      );
    } else if (userOpStatus === 'error' && userOpError) {
      showAlert(
        'Transfer failed',
        userOpError.message || 'Please try again.',
        'error'
      );
    }
  }, [amount, network, selectedToken?.token?.symbol, smartAccountAddress, userOpStatus, userOpData, userOpError]);

  // Load token data from params (only on mount)
  useEffect(() => {
    if (params.token) {
      try {
        const tokenData = JSON.parse(params.token as string);
        setSelectedToken(tokenData);
      } catch (e) {
        console.error('Error parsing token data:', e);
      }
    }
    if (params.network) {
      setNetwork(params.network as string);
    }
    if (typeof params.recipientAddress === 'string') {
      setRecipientAddress(params.recipientAddress);
    }
  }, [params.network, params.recipientAddress, params.token]);

  // Validate address format
  const validateAddress = (address: string) => {
    if (!address) {
      setAddressError(null);
      return false;
    }

    const isSolanaNetwork = network?.toLowerCase().includes('solana');

    if (isSolanaNetwork) {
      if (!address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        setAddressError('Enter a valid Solana address.');
        return false;
      }
    } else {
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        setAddressError('Enter a valid Base or Ethereum address.');
        return false;
      }
    }

    setAddressError(null);
    return true;
  };

  // Update address and validate
  const handleAddressChange = (address: string) => {
    setRecipientAddress(address);
    if (address) {
      validateAddress(address);
    } else {
      setAddressError(null);
    }
  };

  // Helper to show custom alerts
  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info', url?: string, isPending = false) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setExplorerUrl(url || null);
    setIsPendingAlert(isPending);
    setAlertVisible(true);
  };

  // Calculate token balance and set percentage
  const handleQuickAmount = (percentage: number) => {
    if (!selectedToken?.amount) return;

    const tokenAmount = parseFloat(selectedToken.amount.amount || '0');
    const decimals = parseInt(selectedToken.amount.decimals || '0');
    const actualBalance = tokenAmount / Math.pow(10, decimals);
    const calculatedAmount = (actualBalance * percentage) / 100;

    setAmount(calculatedAmount.toFixed(6));
  };

  const handleSend = async () => {
    if (!validateAddress(recipientAddress)) {
      showAlert('Invalid Address', addressError || 'Please enter a valid recipient address', 'error');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount', 'error');
      return;
    }

    if (!selectedToken) {
      showAlert('No Token Selected', 'Please select a token to transfer', 'error');
      return;
    }

    setShowConfirmation(true);
  };

  const handleConfirmedSend = async () => {
    setShowConfirmation(false);
    setSending(true);
    try {
      if (isTestSessionActive()) {
        if (sourceAgentId && sourceAgentName) {
          recordPendingAgentFunding({
            agentId: sourceAgentId,
            agentName: sourceAgentName,
            amount,
            currency: selectedToken.token.symbol,
            network,
            createdAt: new Date().toISOString(),
          });
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
        showAlert(
          'Review transfer complete',
          `${amount} ${selectedToken.token.symbol} was sent in review mode.\n\nRecipient: ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
          'success'
        );
        return;
      }

      const isSolanaNetwork = network?.toLowerCase().includes('solana');

      if (isSolanaNetwork) {
        await handleSolanaTransfer();
      } else {
        await handleEvmTransfer();
      }
    } catch (error) {
      console.error('Transfer error:', error);
      showAlert('Transfer Failed', error instanceof Error ? error.message : 'Unknown error occurred', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleEvmTransfer = async () => {
    if (!selectedToken) return;

    if (!smartAccountAddress) {
      showAlert('Wallet not ready', 'Your wallet is still getting ready. Try again in a moment.', 'error');
      return;
    }

    const tokenAddress = selectedToken.token?.contractAddress;
    const isNativeTransfer = !tokenAddress ||
      tokenAddress === '0x0000000000000000000000000000000000000000' ||
      tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    const amountInSmallestUnit = isNativeTransfer
      ? parseEther(amount)
      : parseUnits(amount, parseInt(selectedToken.amount?.decimals || '0'));

    try {
      if (isNativeTransfer) {
        await sendUserOperation({
          evmSmartAccount: smartAccountAddress as `0x${string}`,
          network: network as any,
          calls: [{
            to: recipientAddress as `0x${string}`,
            value: amountInSmallestUnit,
            data: '0x'
          }],
          useCdpPaymaster: isPaymasterSupported,
        });
      } else {
        const transferFunctionSelector = '0xa9059cbb';
        const encodedRecipient = recipientAddress.slice(2).padStart(64, '0');
        const encodedAmount = amountInSmallestUnit.toString(16).padStart(64, '0');
        const calldata = `${transferFunctionSelector}${encodedRecipient}${encodedAmount}`;

        await sendUserOperation({
          evmSmartAccount: smartAccountAddress as `0x${string}`,
          network: network as any,
          calls: [{
            to: tokenAddress as `0x${string}`,
            value: 0n,
            data: calldata as `0x${string}`,
          }],
          useCdpPaymaster: isPaymasterSupported
        });
      }

      if (sourceAgentId && sourceAgentName) {
        recordPendingAgentFunding({
          agentId: sourceAgentId,
          agentName: sourceAgentName,
          amount,
          currency: selectedToken.token?.symbol || 'Token',
          network,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('EVM transfer error:', error);
      throw error;
    }
  };

  const handleSolanaTransfer = async () => {
    if (!solanaAddress || !selectedToken) return;

    try {
      const amountFloat = parseFloat(amount);
      const decimals = parseInt(selectedToken.amount?.decimals || '9');
      const amountRaw = Math.floor(amountFloat * Math.pow(10, decimals));

      const tokenSymbol = selectedToken.token?.symbol?.toUpperCase() || 'SOL';
      const isSPLToken = selectedToken.token?.mintAddress && tokenSymbol !== 'SOL';
      const isDevnet = network?.toLowerCase().includes('devnet');
      showAlert(
        'Sending funds',
        `Sending ${amount} ${tokenSymbol}. This can take a few moments.`,
        'info',
        undefined,
        true
      );

      const { Connection, clusterApiUrl } = await import('@solana/web3.js');
      const cluster = isDevnet ? 'devnet' : 'mainnet-beta';
      const connection = new Connection(clusterApiUrl(cluster));

      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      let transaction: Transaction;

      if (isSPLToken) {
        const mintAddress = new PublicKey(selectedToken.token.mintAddress);
        const fromPubkey = new PublicKey(solanaAddress);
        const toPubkey = new PublicKey(recipientAddress);

        const fromTokenAccount = await getAssociatedTokenAddress(
          mintAddress,
          fromPubkey
        );

        try {
          await getAccount(connection, fromTokenAccount);
        } catch {
          throw new Error(
            `You do not have any ${tokenSymbol} in this wallet yet.\n\nPlease receive ${tokenSymbol} before you try to send it.`
          );
        }

        const senderSolBalance = await connection.getBalance(fromPubkey);
        const minFeeRequired = 0.00001 * 1e9;

        if (senderSolBalance < minFeeRequired) {
          throw new Error(
            `Insufficient SOL for transaction fees.\n\n` +
            `Current SOL balance: ${(senderSolBalance / 1e9).toFixed(9)} SOL\n` +
            `Required: At least 0.00001 SOL\n\n` +
            (isDevnet
              ? `Get devnet SOL from: https://faucet.solana.com`
              : `Add SOL to your wallet and try again.`)
          );
        }

        const toTokenAccount = await getAssociatedTokenAddress(
          mintAddress,
          toPubkey
        );

        let needsATACreation = false;
        try {
          await getAccount(connection, toTokenAccount);
        } catch {
          needsATACreation = true;

          const senderBalance = await connection.getBalance(fromPubkey);
          const minRequired = 0.003 * 1e9;

          if (senderBalance < minRequired) {
            throw new Error(
              `The receiving wallet needs a little SOL before this send can finish.\n\n` +
              `Current balance: ${(senderBalance / 1e9).toFixed(6)} SOL\n` +
              `Required: ~0.003 SOL\n\n` +
              (isDevnet
                ? `Get devnet SOL from: https://faucet.solana.com`
                : `Add SOL to your wallet and try again.`)
            );
          }
        }

        transaction = new Transaction({
          recentBlockhash: blockhash,
          feePayer: fromPubkey
        });

        if (needsATACreation) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              fromPubkey, // payer
              toTokenAccount, // ata
              toPubkey, // owner
              mintAddress // mint
            )
          );
        }

        transaction.add(
          createTransferInstruction(
            fromTokenAccount, // source
            toTokenAccount, // destination
            fromPubkey, // owner
            amountRaw // amount
          )
        );
      } else {
        transaction = new Transaction({
          recentBlockhash: blockhash,
          feePayer: new PublicKey(solanaAddress)
        }).add(
          SystemProgram.transfer({
            fromPubkey: new PublicKey(solanaAddress),
            toPubkey: new PublicKey(recipientAddress),
            lamports: amountRaw
          })
        );
      }

      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');
      const cdpNetwork = isDevnet ? 'solana-devnet' : 'solana';

      const result = await sendSolanaTransaction({
        solanaAccount: solanaAddress,
        network: cdpNetwork as any,
        transaction: serializedTransaction
      });

      if (sourceAgentId && sourceAgentName) {
        recordPendingAgentFunding({
          agentId: sourceAgentId,
          agentName: sourceAgentName,
          amount,
          currency: tokenSymbol,
          network,
          createdAt: new Date().toISOString(),
          transactionId: result.transactionSignature,
        });
      }

      const explorerUrl = isDevnet
        ? `https://explorer.solana.com/tx/${result.transactionSignature}?cluster=devnet`
        : `https://solscan.io/tx/${result.transactionSignature}`;

      const successInfo = [
        `${amount} ${tokenSymbol} sent successfully.`,
        '',
        `Network: Solana ${isDevnet ? 'Devnet' : 'Mainnet'}`,
        `From: ${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}`,
        `To: ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
      ].join('\n');

      showAlert(
        'Transfer complete',
        successInfo,
        'success',
        explorerUrl
      );
    } catch (error) {
      console.error('Solana transfer error:', error);
      throw error;
    }
  };

  const handleAlertDismiss = () => {
    setAlertVisible(false);
    if (alertType === 'success') {
      if (sourceAgentId) {
        router.replace({ pathname: '/agent/[id]' as any, params: { id: sourceAgentId } });
        return;
      }
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>Send funds</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: CARD_BG }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {selectedToken?.token?.mintAddress && selectedToken?.token?.symbol?.toUpperCase() !== 'SOL' && (
            <View style={[styles.card, { backgroundColor: '#E3F2FD', borderColor: '#2196F3' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Ionicons name="information-circle" size={20} color="#1976D2" style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.helper, { color: '#1976D2', fontWeight: '600' }]}>
                    Solana token send
                  </Text>
                  <Text style={[styles.helper, { color: '#1976D2', marginTop: 4 }]}>
                    {network?.toLowerCase().includes('devnet')
                      ? 'You may need a small amount of devnet SOL to finish this send.'
                      : 'You need a small amount of SOL in your wallet to cover this send.'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.label}>Network</Text>
            <Text style={styles.networkText}>
              {(() => {
                const networkLower = network?.toLowerCase() || '';
                if (networkLower === 'base') return 'Base';
                if (networkLower === 'base-sepolia') return 'Base Sepolia';
                if (networkLower === 'ethereum') return 'Ethereum';
                if (networkLower === 'ethereum-sepolia') return 'Ethereum Sepolia';
                if (networkLower.includes('solana') && networkLower.includes('devnet')) return 'Solana Devnet';
                if (networkLower.includes('solana')) return 'Solana';
                return network.charAt(0).toUpperCase() + network.slice(1);
              })()}
            </Text>
            {isPaymasterSupported ? (
              <Text style={styles.helper}>
                No network fee will be charged for this send.
                {network === 'base-sepolia' && ' This applies to all supported testnet sends.'}
              </Text>
            ) : (
              <Text style={[styles.helper, { color: '#FF9800' }]}>
                Network fees in {isNativeToken ? selectedToken?.token?.symbol : 'ETH'} will apply to this send.
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Token</Text>
            {selectedToken ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={styles.tokenSymbol}>{selectedToken.token?.symbol}</Text>
                    <Text style={styles.tokenName}>{selectedToken.token?.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.label}>Balance</Text>
                    <Text style={styles.tokenAmount}>
                      {(parseFloat(selectedToken.amount?.amount || '0') / Math.pow(10, parseInt(selectedToken.amount?.decimals || '0'))).toFixed(6)}
                    </Text>
                    {selectedToken.usdValue && (
                      <Text style={styles.tokenUsd}>
                        ≈ ${selectedToken.usdValue.toFixed(2)} USD
                      </Text>
                    )}
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.helper}>No token selected</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Recipient</Text>
            {recipientLabel ? (
              <Text style={styles.helper}>
                Funds will be sent to {recipientLabel}.
              </Text>
            ) : null}
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { flex: 1 } , addressError && { borderColor: '#FF6B6B' }]}
                value={recipientAddress}
                onChangeText={handleAddressChange}
                placeholder={network === 'solana' ? 'Solana address' : '0x...'}
                placeholderTextColor={TEXT_SECONDARY}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {recipientAddress ? (
                <Pressable
                  style={styles.pasteButton}
                  onPress={() => {
                    setRecipientAddress('');
                    setAddressError(null);
                  }}
                >
                  <Ionicons name="close-circle" size={20} color={TEXT_SECONDARY} />
                </Pressable>
              ) : (
                <Pressable
                  style={styles.pasteButton}
                  onPress={async () => {
                    const text = await Clipboard.getStringAsync();
                    if (text) handleAddressChange(text);
                  }}
                >
                  <Ionicons name="clipboard-outline" size={20} color={BLUE} />
                </Pressable>
              )}
            </View>

            {addressError && (
              <Text style={[styles.helper, { color: '#FF6B6B', marginTop: 8 }]}>
                {addressError}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={TEXT_SECONDARY}
              keyboardType="decimal-pad"
            />

            <View style={styles.quickButtons}>
              <Pressable
                style={styles.quickButton}
                onPress={() => handleQuickAmount(10)}
              >
                <Text style={styles.quickButtonText}>10%</Text>
              </Pressable>
              <Pressable
                style={styles.quickButton}
                onPress={() => handleQuickAmount(50)}
              >
                <Text style={styles.quickButtonText}>50%</Text>
              </Pressable>
              <Pressable
                style={styles.quickButton}
                onPress={() => handleQuickAmount(100)}
              >
                <Text style={styles.quickButtonText}>Max</Text>
              </Pressable>
            </View>

            {needsGasFee && (
              <Text style={[styles.helper, { color: '#FF9800', marginTop: 12 }]}>
                Leave a small amount of {selectedToken?.token?.symbol} behind to cover network fees.
              </Text>
            )}
          </View>

          <Pressable
            style={[styles.mainSendButton, (!recipientAddress || !amount) && styles.buttonDisabled]}
            onPress={handleSend}
            disabled={!recipientAddress || !amount || sending}
          >
            {sending ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <Text style={styles.mainSendButtonText}>Send</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmationCard}>
            <View style={styles.confirmationHeader}>
              <Ionicons name="shield-checkmark" size={48} color={BLUE} />
              <Text style={styles.confirmationTitle}>Review send</Text>
            </View>

            <View style={styles.confirmationBody}>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>From</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>
                  {network.toLowerCase().includes('solana')
                    ? (solanaAddress?.slice(0, 6) + '...' + solanaAddress?.slice(-4))
                    : (smartAccountAddress?.slice(0, 6) + '...' + smartAccountAddress?.slice(-4))}
                </Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>To</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>
                  {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
                </Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Network</Text>
                <Text style={styles.confirmValue}>
                  {network.charAt(0).toUpperCase() + network.slice(1)}
                </Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Token</Text>
                <Text style={styles.confirmValue}>
                  {selectedToken?.token?.symbol || 'Unknown'}
                </Text>
              </View>

              <View style={[styles.confirmRow, styles.confirmAmount]}>
                <Text style={styles.confirmLabel}>Amount</Text>
                <Text style={styles.confirmAmountValue}>
                  {amount} {selectedToken?.token?.symbol}
                </Text>
              </View>

              {selectedToken?.usdValue && selectedToken?.amount && (
                <Text style={styles.confirmUsd}>
                  ≈ ${(() => {
                    // Calculate price per token from total USD value and token balance
                    const tokenBalance = parseFloat(selectedToken.amount.amount || '0') / Math.pow(10, parseInt(selectedToken.amount.decimals || '0'));
                    const pricePerToken = tokenBalance > 0 ? selectedToken.usdValue / tokenBalance : 0;
                    return (parseFloat(amount) * pricePerToken).toFixed(2);
                  })()} USD
                </Text>
              )}
            </View>

            <View style={styles.confirmationButtons}>
              <Pressable
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={() => setShowConfirmation(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, styles.sendButton]}
                onPress={handleConfirmedSend}
              >
                <Text style={styles.sendButtonText}>Send now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CoinbaseAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        type={alertType}
        onConfirm={() => {
          if (explorerUrl && !explorerUrl.startsWith('Transaction Hash:')) {
            Linking.openURL(explorerUrl);
          }
          handleAlertDismiss();
        }}
        confirmText={explorerUrl && !explorerUrl.startsWith('Transaction Hash:') ? "View transfer" : "Got it"}
        hideButton={isPendingAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CARD_BG, // was DARK_BG
  },
  content: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pasteButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.heading,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
  },
  label: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 12,
    fontFamily: FONTS.body,
  },
  networkText: {
    fontSize: 18,
    color: TEXT_PRIMARY,
    marginBottom: 8,
    fontFamily: FONTS.heading,
  },
  helper: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 16,
    fontFamily: FONTS.body,
  },
  input: {
    backgroundColor: DARK_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.body,
  },
  usdValue: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    marginTop: 8,
    marginBottom: 4,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickButton: {
    flex: 1,
    backgroundColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  quickButtonText: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.body,
  },
  mainSendButton: {
    backgroundColor: BLUE,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 52,
  },
  mainSendButtonText: {
    color: WHITE,
    fontSize: 16,
    fontFamily: FONTS.body,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  tokenSymbol: {
    fontSize: 18,
    color: TEXT_PRIMARY,
    marginBottom: 4,
    fontFamily: FONTS.heading,
  },
  tokenName: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontFamily: FONTS.body,
  },
  tokenAmount: {
    fontSize: 16,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.body,
  },
  tokenUsd: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 4,
    fontFamily: FONTS.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmationCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  confirmationHeader: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  confirmationTitle: {
    fontSize: 22,
    color: TEXT_PRIMARY,
    marginTop: 12,
    fontFamily: FONTS.heading,
  },
  confirmationBody: {
    padding: 24,
    gap: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmLabel: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontFamily: FONTS.body,
  },
  confirmValue: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
    fontFamily: FONTS.body,
  },
  confirmAmount: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 8,
  },
  confirmAmountValue: {
    fontSize: 20,
    color: BLUE,
    fontFamily: FONTS.heading,
  },
  confirmUsd: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'right',
    marginTop: -8,
    fontFamily: FONTS.body,
  },
  confirmationButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: BORDER,
  },
  sendButton: {
    backgroundColor: BLUE,
  },
  cancelButtonText: {
    fontSize: 16,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.body,
  },
  sendButtonText: {
    fontSize: 16,
    color: WHITE,
    fontFamily: FONTS.body,
  },
});
