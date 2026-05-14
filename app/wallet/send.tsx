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
import { RegentPressable } from '@/components/ui/RegentPressable';
import { runRegentHaptic } from '@/components/ui/haptics';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { fetchWalletFundingChoices } from '@/utils/fetchWalletFundingChoices';
import { buildEvmTransferCall, isNativeEvmToken } from '@/utils/onchain/buildTransferCall';
import { parseSolanaAmountToBaseUnits } from '@/utils/onchain/solanaAmount';
import { regentApi } from '@/utils/regentApi/client';
import { routes } from '@/utils/navigation/routes';
import type { WalletFundingChoice } from '@/types/walletFunding';
import { useCurrentUser, useSendSolanaTransaction, useSendUserOperation, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { EaseView } from 'react-native-ease';
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, BLUE_WASH, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER, ORANGE } = COLORS;
const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;
const AGENT_FUNDING_FLOW = 'agent-funding';

function buildTimingTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

function buildSpringTransition(reduceMotion: boolean, delay = 0) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'spring' as const, damping: 18, stiffness: 190, mass: 1, delay };
}

function getNetworkLabel(network: string) {
  const networkLower = network?.toLowerCase() || '';

  if (networkLower === 'base') return 'Base';
  if (networkLower === 'base-sepolia') return 'Base test network';
  if (networkLower === 'ethereum') return 'Ethereum';
  if (networkLower === 'ethereum-sepolia') return 'Ethereum test network';
  if (networkLower.includes('solana') && networkLower.includes('devnet')) return 'Solana test network';
  if (networkLower.includes('solana')) return 'Solana';

  return network.charAt(0).toUpperCase() + network.slice(1);
}

function getTokenBalance(selectedToken: any) {
  if (!selectedToken?.amount) return '0';

  const rawAmount = parseFloat(selectedToken.amount.amount || '0');
  const decimals = parseInt(selectedToken.amount.decimals || '0', 10);
  const actualBalance = rawAmount / Math.pow(10, decimals);

  return actualBalance.toLocaleString(undefined, {
    maximumFractionDigits: actualBalance >= 1 ? 4 : 6,
  });
}

function getUsdEstimate(selectedToken: any, amount: string) {
  if (!selectedToken?.usdValue || !selectedToken?.amount || !amount) return null;

  const tokenBalance = parseFloat(selectedToken.amount.amount || '0') / Math.pow(10, parseInt(selectedToken.amount.decimals || '0', 10));
  const pricePerToken = tokenBalance > 0 ? selectedToken.usdValue / tokenBalance : 0;
  const estimate = parseFloat(amount) * pricePerToken;

  if (!Number.isFinite(estimate)) return null;

  return estimate.toFixed(2);
}

function formatAddressPreview(address?: string | null) {
  if (!address) return 'Not ready';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isBaseUsdcBalance(balance: WalletFundingChoice) {
  return balance.network === 'Base' && balance.token?.symbol?.toUpperCase() === 'USDC';
}

function fundingIdempotencySegment(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? encodeURIComponent(normalized).slice(0, 80) : 'missing';
}

function buildFundingIdempotencyKey(input: {
  amount: string;
  expectedSigner: string;
  regentId: string;
  recipientAddress: string;
  tokenAddress?: string | null;
}) {
  return [
    'regents-mobile',
    'fund-agent',
    fundingIdempotencySegment(input.regentId),
    fundingIdempotencySegment(input.expectedSigner),
    fundingIdempotencySegment(input.recipientAddress),
    fundingIdempotencySegment(input.tokenAddress),
    fundingIdempotencySegment(input.amount),
    Date.now().toString(36),
  ].join(':');
}

export default function TransferScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const recipientLabel = typeof params.recipientLabel === 'string' ? params.recipientLabel : null;
  const regentId = typeof params.regentId === 'string' ? params.regentId : null;
  const isAgentFundingFlow = params.flow === AGENT_FUNDING_FLOW;

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [lastQuickPercentage, setLastQuickPercentage] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [network, setNetwork] = useState('base'); // base, ethereum, solana
  const [loadingFundingBalance, setLoadingFundingBalance] = useState(false);
  const [fundingBalanceError, setFundingBalanceError] = useState<string | null>(null);
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
  const [isConfirmationPresented, setIsConfirmationPresented] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const quickAmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFundingActionRef = useRef<{ actionId: string; txHash?: string } | null>(null);

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
    if (showConfirmation) {
      setIsConfirmationPresented(true);
    }
  }, [showConfirmation]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (quickAmountTimer.current) {
        clearTimeout(quickAmountTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (userOpStatus === 'pending' && userOpData?.userOpHash) {
      showAlert(
        isAgentFundingFlow ? 'Sending payment' : 'Sending funds',
        isAgentFundingFlow
          ? 'Your agent payment is on the way. This can take a few moments.'
          : 'Your transfer is on the way. This can take a few moments.',
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

      if (isAgentFundingFlow) {
        const pendingAction = pendingFundingActionRef.current;
        if (pendingAction && pendingAction.txHash !== txHash) {
          pendingAction.txHash = txHash;
          void (async () => {
            try {
              await regentApi.confirmWalletAction({
                actionId: pendingAction.actionId,
                txHash,
                chainId: 8453,
              });

              const successInfo = [
                `You sent ${amount} ${selectedToken?.token?.symbol || 'USDC'} to ${recipientLabel || 'this agent'}.`,
                '',
                `Network: ${getNetworkLabel(network)}`,
                `Agent wallet: ${formatAddressPreview(recipientAddress)}`,
              ].join('\n');

              showAlert('Payment complete', successInfo, 'success', explorerUrl);
            } catch {
              const successInfo = [
                `You sent ${amount} ${selectedToken?.token?.symbol || 'USDC'} to ${recipientLabel || 'this agent'}.`,
                '',
                'The payment is on its way. The receipt may take a moment to update.',
              ].join('\n');

              showAlert('Payment sent', successInfo, 'success', explorerUrl);
            }
          })();
          return;
        }

        const successInfo = [
          `You sent ${amount} ${selectedToken?.token?.symbol || 'USDC'} to ${recipientLabel || 'this agent'}.`,
          '',
          `Network: ${getNetworkLabel(network)}`,
          `Agent wallet: ${formatAddressPreview(recipientAddress)}`,
        ].join('\n');

        showAlert('Payment complete', successInfo, 'success', explorerUrl);
        return;
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
  }, [amount, isAgentFundingFlow, network, recipientAddress, recipientLabel, selectedToken?.token?.symbol, smartAccountAddress, userOpStatus, userOpData, userOpError]);

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

  useEffect(() => {
    if (!isAgentFundingFlow || params.token || !smartAccountAddress) {
      return;
    }

    let active = true;
    setLoadingFundingBalance(true);
    setFundingBalanceError(null);

    fetchWalletFundingChoices({ evmAddress: smartAccountAddress, solanaAddress: null })
      .then((choices) => {
        if (!active) {
          return;
        }

        const baseUsdc = choices.find(isBaseUsdcBalance) || null;
        setSelectedToken(baseUsdc);
        setNetwork('base');
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSelectedToken(null);
        setFundingBalanceError('We could not check your Base USDC balance. Try again in a moment.');
      })
      .finally(() => {
        if (active) {
          setLoadingFundingBalance(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isAgentFundingFlow, params.token, smartAccountAddress]);

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
    if (type === 'success') {
      runRegentHaptic('success');
    } else if (type === 'error') {
      runRegentHaptic('warning');
    }

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
    setLastQuickPercentage(percentage);

    if (quickAmountTimer.current) {
      clearTimeout(quickAmountTimer.current);
    }

    quickAmountTimer.current = setTimeout(() => {
      setLastQuickPercentage(null);
    }, 900);
  };

  const handleSend = async () => {
    if (!validateAddress(recipientAddress)) {
      showAlert('Enter a valid address', addressError || 'Add the wallet address you want to use.', 'error');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      showAlert('Enter an amount', 'Choose an amount greater than zero.', 'error');
      return;
    }

    if (!selectedToken) {
      showAlert('Choose something to send', 'Go back and pick the asset you want to send.', 'error');
      return;
    }

    setShowConfirmation(true);
  };

  const handleConfirmedSend = async () => {
    setShowConfirmation(false);
    setSending(true);
    try {
      const isSolanaNetwork = network?.toLowerCase().includes('solana');

      if (isSolanaNetwork) {
        await handleSolanaTransfer();
      } else {
        await handleEvmTransfer();
      }
    } catch (error) {
      console.error('Transfer error:', error);
      showAlert('Transfer failed', error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'error');
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
    const isNativeTransfer = isNativeEvmToken(tokenAddress);
    const call = buildEvmTransferCall({
      recipientAddress,
      amountDecimal: amount,
      tokenAddress,
      decimals: isNativeTransfer ? undefined : parseInt(selectedToken.amount?.decimals || '0', 10),
    });

    try {
      if (isAgentFundingFlow) {
        if (!regentId) {
          throw new Error('Choose an agent before sending funds.');
        }

        if (network !== 'base' || tokenSymbol !== 'USDC' || isNativeTransfer) {
          throw new Error('Add USDC on Base first, then fund this agent.');
        }

        const preparedAction = await regentApi.prepareWalletAction({
          type: 'funding',
          regentId,
          expectedSigner: smartAccountAddress,
          to: call.to,
          value: call.value.toString(),
          data: call.data,
          amount,
          currency: tokenSymbol,
          riskCopy: `You are sending ${amount} ${tokenSymbol} to ${recipientLabel || 'this agent'}.`,
          idempotencyKey: buildFundingIdempotencyKey({
            amount,
            expectedSigner: smartAccountAddress,
            recipientAddress,
            regentId,
            tokenAddress,
          }),
        });
        pendingFundingActionRef.current = { actionId: preparedAction.action_id };
      }

      if (isNativeTransfer) {
        await sendUserOperation({
          evmSmartAccount: smartAccountAddress as `0x${string}`,
          network: network as any,
          calls: [call],
          useCdpPaymaster: isPaymasterSupported,
        });
      } else {
        await sendUserOperation({
          evmSmartAccount: smartAccountAddress as `0x${string}`,
          network: network as any,
          calls: [call],
          useCdpPaymaster: isPaymasterSupported
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
      const tokenSymbol = selectedToken.token?.symbol?.toUpperCase() || 'SOL';
      const isSPLToken = selectedToken.token?.mintAddress && tokenSymbol !== 'SOL';
      const tokenDecimals = selectedToken.amount?.decimals;
      const decimals = isSPLToken
        ? (typeof tokenDecimals === 'string' && /^\d+$/.test(tokenDecimals) ? Number.parseInt(tokenDecimals, 10) : NaN)
        : 9;
      const amountRaw = parseSolanaAmountToBaseUnits(amount, decimals);
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
              ? `Add test SOL from: https://faucet.solana.com`
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
                ? `Add test SOL from: https://faucet.solana.com`
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

      const explorerUrl = isDevnet
        ? `https://explorer.solana.com/tx/${result.transactionSignature}?cluster=devnet`
        : `https://solscan.io/tx/${result.transactionSignature}`;

      const successInfo = [
        `${amount} ${tokenSymbol} sent successfully.`,
        '',
        `Network: Solana ${isDevnet ? 'test network' : 'mainnet'}`,
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
      router.back();
    }
  };

  const networkDisplayName = getNetworkLabel(network);
  const tokenBalance = getTokenBalance(selectedToken);
  const usdEstimate = getUsdEstimate(selectedToken, amount);
  const fundingTarget = recipientLabel || 'this agent';
  const canContinue =
    !!recipientAddress &&
    !!amount &&
    !sending &&
    !loadingFundingBalance &&
    (!isAgentFundingFlow || !!selectedToken);
  const noBaseUsdcForFunding = isAgentFundingFlow && !loadingFundingBalance && !selectedToken && !fundingBalanceError;
  let alertConfirmText = 'Got it';
  if (explorerUrl && !explorerUrl.startsWith('Transaction Hash:')) {
    alertConfirmText = isAgentFundingFlow ? 'View payment' : 'View transfer';
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <EaseView
          initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reduceMotion)}
        >
          <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
          </RegentPressable>
        </EaseView>
        <EaseView
          initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reduceMotion, STAGGER_STEP)}
        >
          <Text style={styles.headerTitle}>{isAgentFundingFlow ? 'Fund agent' : 'Send'}</Text>
        </EaseView>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 2)}
            style={styles.introBlock}
          >
            <Text style={styles.screenTitle}>
              {isAgentFundingFlow ? `Fund ${fundingTarget}` : 'Who are you sending to?'}
            </Text>
            <Text style={styles.screenSubtitle}>
              {isAgentFundingFlow
                ? 'Send Base USDC to this agent so it has a working balance for tools, services, and work.'
                : 'Enter the wallet details first. You will review everything before you send.'}
            </Text>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 3)}
            style={styles.card}
          >
            <Text style={styles.label}>{isAgentFundingFlow ? 'Agent' : 'Recipient'}</Text>
            {recipientLabel ? (
              <View style={styles.recipientPill}>
                <Text style={styles.recipientPillText}>
                  {isAgentFundingFlow ? `Funding ${recipientLabel}` : `Sending to ${recipientLabel}`}
                </Text>
              </View>
            ) : null}
            <View style={styles.inputContainer}>
              <View style={styles.fieldIcon}>
                <Ionicons name="person-outline" size={20} color={TEXT_SECONDARY} />
              </View>
              <TextInput
                style={[styles.input, styles.recipientInput, { flex: 1 }, addressError && styles.inputError]}
                value={recipientAddress}
                onChangeText={handleAddressChange}
                placeholder={network.toLowerCase().includes('solana') ? 'Solana address' : 'Wallet address'}
                placeholderTextColor={TEXT_SECONDARY}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isAgentFundingFlow}
              />
              {isAgentFundingFlow ? null : recipientAddress ? (
                <RegentPressable
                  haptic="selection"
                  pressStyle="icon"
                  style={styles.pasteButton}
                  onPress={() => {
                    setRecipientAddress('');
                    setAddressError(null);
                  }}
                >
                  <Ionicons name="close-circle" size={20} color={TEXT_SECONDARY} />
                </RegentPressable>
              ) : (
                <RegentPressable
                  pressStyle="icon"
                  style={styles.pasteButton}
                  onPress={async () => {
                    const text = await Clipboard.getStringAsync();
                    if (text) handleAddressChange(text);
                  }}
                >
                  <Ionicons name="clipboard-outline" size={20} color={BLUE} />
                </RegentPressable>
              )}
            </View>

            {addressError && (
              <Text style={[styles.helper, styles.errorText]}>{addressError}</Text>
            )}
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 4)}
            style={styles.card}
          >
            <Text style={styles.label}>Amount</Text>
            <View style={[styles.amountField, amountFocused && styles.amountFieldFocused]}>
              <TextInput
                style={[styles.input, styles.amountInput]}
                value={amount}
                onChangeText={setAmount}
                onBlur={() => setAmountFocused(false)}
                onFocus={() => setAmountFocused(true)}
                placeholder="0.00"
                placeholderTextColor={TEXT_SECONDARY}
                keyboardType="decimal-pad"
                selectionColor={BLUE}
              />
              <View style={styles.amountTokenPill}>
                <Text style={styles.amountTokenText}>{selectedToken?.token?.symbol || 'Token'}</Text>
              </View>
            </View>

            {usdEstimate ? (
              <Text style={styles.helper}>About ${usdEstimate} USD</Text>
            ) : isAgentFundingFlow ? (
              <Text style={styles.helper}>Choose how much USDC this agent can use.</Text>
            ) : (
              <Text style={styles.helper}>Choose how much you want to send.</Text>
            )}

            <View style={styles.quickButtons}>
              <RegentPressable
                haptic="selection"
                pressStyle="chip"
                style={[styles.quickButton, lastQuickPercentage === 10 && styles.quickButtonSelected]}
                onPress={() => handleQuickAmount(10)}
              >
                <Text style={[styles.quickButtonText, lastQuickPercentage === 10 && styles.quickButtonTextSelected]}>10%</Text>
              </RegentPressable>
              <RegentPressable
                haptic="selection"
                pressStyle="chip"
                style={[styles.quickButton, lastQuickPercentage === 50 && styles.quickButtonSelected]}
                onPress={() => handleQuickAmount(50)}
              >
                <Text style={[styles.quickButtonText, lastQuickPercentage === 50 && styles.quickButtonTextSelected]}>50%</Text>
              </RegentPressable>
              <RegentPressable
                haptic="selection"
                pressStyle="chip"
                style={[styles.quickButton, lastQuickPercentage === 100 && styles.quickButtonSelected]}
                onPress={() => handleQuickAmount(100)}
              >
                <Text style={[styles.quickButtonText, lastQuickPercentage === 100 && styles.quickButtonTextSelected]}>Max</Text>
              </RegentPressable>
            </View>

            <LiveValueFlash value={`available-${tokenBalance}-${selectedToken?.token?.symbol || ''}`} style={styles.availableFlash}>
              <Text style={styles.helper}>
                {loadingFundingBalance
                  ? 'Checking Base USDC...'
                  : `Available: ${tokenBalance} ${selectedToken?.token?.symbol || ''}`}
              </Text>
            </LiveValueFlash>

            {needsGasFee && (
              <Text style={[styles.helper, styles.warningText]}>
                Leave a small amount of {selectedToken?.token?.symbol} behind to cover network fees.
              </Text>
            )}
          </EaseView>

          {fundingBalanceError ? (
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 5)}
              style={[styles.card, styles.noticeCard]}
            >
              <Text style={styles.noticeTitle}>Base USDC is not ready</Text>
              <Text style={styles.noticeText}>{fundingBalanceError}</Text>
            </EaseView>
          ) : null}

          {noBaseUsdcForFunding ? (
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 5)}
              style={[styles.card, styles.noticeCard]}
            >
              <Text style={styles.noticeTitle}>Add USDC first</Text>
              <Text style={styles.noticeText}>
                This agent funding path uses Base USDC. Add USDC, then come back to send it to {fundingTarget}.
              </Text>
              <RegentPressable style={styles.inlinePrimaryButton} onPress={() => router.push(routes.wallet())}>
                <Text style={styles.inlinePrimaryButtonText}>Add USDC</Text>
              </RegentPressable>
            </EaseView>
          ) : null}

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 5)}
            style={styles.reviewCard}
          >
            <Ionicons name="shield-checkmark-outline" size={24} color={TEXT_SECONDARY} />
            <View style={styles.reviewCopy}>
              <Text style={styles.reviewTitle}>{isAgentFundingFlow ? 'Review payment' : 'Review transfer'}</Text>
              <Text style={styles.reviewText}>
                {isAgentFundingFlow
                  ? 'Check the agent, amount, and destination before money moves.'
                  : 'You will have a chance to check the details before you send.'}
              </Text>
            </View>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 6)}
            style={styles.card}
          >
            <Text style={styles.label}>{isAgentFundingFlow ? 'From your wallet' : 'From wallet'}</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Wallet</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {network.toLowerCase().includes('solana')
                  ? formatAddressPreview(solanaAddress)
                  : formatAddressPreview(smartAccountAddress)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Network</Text>
              <Text style={styles.detailValue}>{networkDisplayName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{isAgentFundingFlow ? 'Funds' : 'Asset'}</Text>
              <Text style={styles.detailValue}>{selectedToken?.token?.symbol || 'Choose from your wallet'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Available</Text>
              <LiveValueFlash value={`from-wallet-available-${tokenBalance}-${selectedToken?.token?.symbol || ''}`} style={styles.detailValueFlash}>
                <Text style={styles.detailValue}>
                  {tokenBalance} {selectedToken?.token?.symbol || ''}
                </Text>
              </LiveValueFlash>
            </View>
            {isPaymasterSupported ? (
              <Text style={styles.helper}>No network fee will be charged for this send.</Text>
            ) : (
              <Text style={[styles.helper, styles.warningText]}>
                Network fees in {isNativeToken ? selectedToken?.token?.symbol : 'ETH'} will apply.
              </Text>
            )}
          </EaseView>

          {selectedToken?.token?.mintAddress && selectedToken?.token?.symbol?.toUpperCase() !== 'SOL' && (
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 7)}
              style={[styles.card, styles.noticeCard]}
            >
              <Text style={styles.noticeTitle}>Solana token send</Text>
              <Text style={styles.noticeText}>
                {network?.toLowerCase().includes('devnet')
                  ? 'You may need a small amount of test SOL to finish this send.'
                  : 'You need a small amount of SOL in your wallet to finish this send.'}
              </Text>
            </EaseView>
          )}

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 8)}
            style={styles.mainButtonWrap}
          >
            <RegentPressable
              style={[styles.mainSendButton, !canContinue && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={!canContinue}
            >
              {sending ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={styles.mainSendButtonText}>{isAgentFundingFlow ? 'Review payment' : 'Continue'}</Text>
              )}
            </RegentPressable>
          </EaseView>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isConfirmationPresented}
        transparent
        animationType="none"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <EaseView
          initialAnimate={{ opacity: 0 }}
          animate={{ opacity: showConfirmation ? 1 : 0 }}
          transition={buildTimingTransition(reduceMotion, 0, 180)}
          style={styles.modalOverlay}
        >
          <EaseView
            initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET, scale: 0.985 }}
            animate={{ opacity: showConfirmation ? 1 : 0, translateY: showConfirmation ? 0 : SCREEN_OFFSET, scale: showConfirmation ? 1 : 0.985 }}
            onTransitionEnd={({ finished }) => {
              if (finished && !showConfirmation) {
                setIsConfirmationPresented(false);
              }
            }}
            transition={buildSpringTransition(reduceMotion, 30)}
            style={styles.confirmationCard}
          >
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP)}
              style={styles.confirmationHeader}
            >
              <Ionicons name="shield-checkmark" size={48} color={BLUE} />
              <Text style={styles.confirmationTitle}>{isAgentFundingFlow ? 'Review payment' : 'Review transfer'}</Text>
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 2)}
              style={styles.confirmationBody}
            >
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>From</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>
                  {network.toLowerCase().includes('solana')
                    ? formatAddressPreview(solanaAddress)
                    : formatAddressPreview(smartAccountAddress)}
                </Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{isAgentFundingFlow ? 'Agent' : 'To'}</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>
                  {isAgentFundingFlow ? fundingTarget : `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`}
                </Text>
              </View>

              {isAgentFundingFlow ? (
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Agent wallet</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>
                    {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Network</Text>
                <Text style={styles.confirmValue}>
                  {networkDisplayName}
                </Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{isAgentFundingFlow ? 'Funds' : 'Token'}</Text>
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

              {usdEstimate ? (
                <Text style={styles.confirmUsd}>
                  About ${usdEstimate} USD
                </Text>
              ) : null}
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 3)}
              style={styles.confirmationButtons}
            >
              <RegentPressable
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={() => setShowConfirmation(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </RegentPressable>
              <RegentPressable
                haptic="warning"
                style={[styles.confirmButton, styles.sendButton]}
                onPress={handleConfirmedSend}
              >
                <Text style={styles.sendButtonText}>{isAgentFundingFlow ? 'Send to agent' : 'Send now'}</Text>
              </RegentPressable>
            </EaseView>
          </EaseView>
        </EaseView>
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
        confirmText={alertConfirmText}
        hideButton={isPendingAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  scrollView: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pasteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: DARK_BG,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.heading,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 18,
  },
  introBlock: {
    gap: 8,
  },
  screenTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.heading,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: TEXT_SECONDARY,
    fontFamily: FONTS.body,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 12,
  },
  label: {
    fontSize: 14,
    color: TEXT_SECONDARY,
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
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  recipientPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CARD_ALT,
  },
  recipientPillText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  fieldIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 16,
    fontSize: 16,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.body,
  },
  recipientInput: {
    minHeight: 60,
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  amountFieldFocused: {
    borderColor: BLUE,
    shadowColor: BLUE,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  amountInput: {
    flex: 1,
    minWidth: 120,
    minHeight: 72,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: FONTS.heading,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  amountTokenPill: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: CARD_ALT,
  },
  amountTokenText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  quickButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  quickButton: {
    flex: 1,
    minWidth: 84,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    minHeight: 52,
  },
  quickButtonSelected: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  quickButtonText: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.body,
  },
  quickButtonTextSelected: {
    color: WHITE,
  },
  mainSendButton: {
    backgroundColor: BLUE,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    alignSelf: 'stretch',
  },
  mainButtonWrap: {
    marginTop: 2,
  },
  mainSendButtonText: {
    color: WHITE,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    alignSelf: 'stretch',
  },
  reviewCopy: {
    flex: 1,
    gap: 4,
  },
  reviewTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  reviewText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  detailLabel: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  detailValueFlash: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
  },
  detailValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
    flexShrink: 1,
    textAlign: 'right',
  },
  availableFlash: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  noticeCard: {
    backgroundColor: CARD_ALT,
  },
  noticeTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: FONTS.heading,
    marginBottom: 6,
  },
  noticeText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  inlinePrimaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 4,
  },
  inlinePrimaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  inputError: {
    borderColor: COLORS.DANGER,
  },
  errorText: {
    color: COLORS.DANGER,
    marginTop: 8,
  },
  warningText: {
    color: ORANGE,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(49, 85, 105, 0.16)',
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
    padding: 22,
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
    padding: 22,
    gap: 14,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
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
    lineHeight: 26,
    flexShrink: 1,
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
    padding: 18,
    gap: 12,
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  confirmButton: {
    flex: 1,
    minWidth: 130,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
