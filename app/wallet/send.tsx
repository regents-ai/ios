/**
 * Transfer Page - Send tokens to any address (Base, Ethereum, Solana).
 * Gasless on Base via Paymaster; both Base and Ethereum use the Smart
 * Account (balances are stored there).
 *
 * The screen owns layout and form state; the money-path logic lives in
 * hooks/wallet (recipient resolution, funding choices, EVM and Solana
 * transfer submission, user-op status alerts) and utils/onchain.
 */

import { useCurrentUser, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EaseView } from 'react-native-ease';

import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { ProfileButton } from '@/components/navigation/ProfileButton';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { RecipientQuickPicks, recordRecipientUse } from '@/components/wallet/RecipientQuickPicks';
import { SendConfirmationModal } from '@/components/wallet/SendConfirmationModal';
import { makeSendScreenStyles } from '@/components/wallet/sendScreenStyles';
import {
  SEND_CARD_OFFSET as CARD_OFFSET,
  SEND_SCREEN_OFFSET as SCREEN_OFFSET,
  SEND_STAGGER_STEP as STAGGER_STEP,
  buildTimingTransition,
} from '@/components/wallet/sendTransitions';
import { useTheme } from '@/theme/ThemeProvider';
import { useEvmTransfer } from '@/hooks/wallet/useEvmTransfer';
import { useFundingChoices } from '@/hooks/wallet/useFundingChoices';
import { useRecipientResolution } from '@/hooks/wallet/useRecipientResolution';
import { useSolanaTransfer } from '@/hooks/wallet/useSolanaTransfer';
import { useTransferAlert } from '@/hooks/wallet/useTransferAlert';
import { useUserOpStatusAlerts } from '@/hooks/wallet/useUserOpStatusAlerts';
import { routes } from '@/utils/navigation/routes';
import { formatAddressPreview, getNetworkLabel, isSolanaNetwork } from '@/utils/onchain/networkDisplay';
import { getEnsResolutionCopy } from '@/utils/onchain/recipient';
import { getInsufficientBalanceError, getSelfSendError } from '@/utils/onchain/sendValidation';
import { getTokenBalance, getUsdEstimate } from '@/utils/onchain/tokenDisplay';

const AGENT_FUNDING_FLOW = 'agent-funding';
const SEND_FLOW = 'send';

export default function TransferScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeSendScreenStyles(theme), [theme]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const recipientLabel = typeof params.recipientLabel === 'string' ? params.recipientLabel : null;
  const regentId = typeof params.regentId === 'string' ? params.regentId : null;
  const isAgentFundingFlow = params.flow === AGENT_FUNDING_FLOW;
  const isSendTab = pathname === '/send';
  const isDefaultSendFlow = !isAgentFundingFlow && !params.token && (params.flow === SEND_FLOW || isSendTab);

  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [lastQuickPercentage, setLastQuickPercentage] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [network, setNetwork] = useState('base'); // base, ethereum, solana
  const [sending, setSending] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const reduceMotion = useReducedMotion();
  const quickAmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    alertVisible,
    alertTitle,
    alertMessage,
    alertType,
    explorerUrl,
    isPendingAlert,
    showAlert,
    hideAlert,
  } = useTransferAlert();

  const {
    recipientInput,
    recipientAddress,
    ensResolution,
    resolvingRecipient,
    scanningQrPhoto,
    addressError,
    reviewSubmitInFlightRef,
    handleAddressChange,
    resolveRecipientInput,
    handlePasteRecipient,
    handleQrPhoto,
    setRecipientFromParam,
    resetRecipient,
  } = useRecipientResolution({ network, showAlert });

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

  const {
    sendEvmTransfer,
    userOpStatus,
    userOpData,
    userOpError,
    pendingFundingActionRef,
  } = useEvmTransfer({
    amount,
    isAgentFundingFlow,
    isPaymasterSupported,
    network,
    recipientAddress,
    recipientLabel,
    regentId,
    selectedToken,
    smartAccountAddress,
    tokenSymbol,
    showAlert,
  });

  const { resetUserOpTracking } = useUserOpStatusAlerts({
    amount,
    isAgentFundingFlow,
    isDefaultSendFlow,
    network,
    pendingFundingActionRef,
    recipientAddress,
    recipientLabel,
    selectedToken,
    smartAccountAddress,
    userOpStatus,
    userOpData,
    userOpError,
    showAlert,
  });

  const { sendSolanaTransfer } = useSolanaTransfer({
    amount,
    network,
    recipientAddress,
    selectedToken,
    solanaAddress,
    showAlert,
  });

  const { loadingFundingBalance, fundingBalanceError } = useFundingChoices({
    isAgentFundingFlow,
    isDefaultSendFlow,
    hasTokenParam: !!params.token,
    network,
    smartAccountAddress,
    setSelectedToken,
    setNetwork,
  });

  useEffect(() => {
    return () => {
      if (quickAmountTimer.current) {
        clearTimeout(quickAmountTimer.current);
      }
    };
  }, []);

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
      setRecipientFromParam(params.recipientAddress);
    }
  }, [params.network, params.recipientAddress, params.token, setRecipientFromParam]);

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
    if (reviewSubmitInFlightRef.current || resolvingRecipient) {
      return;
    }

    reviewSubmitInFlightRef.current = true;
    try {
      const recipientReady = await resolveRecipientInput();
      if (!recipientReady.ok) {
        showAlert('Check recipient', recipientReady.error, 'error');
        return;
      }

      const selfSendError = getSelfSendError({
        network,
        recipientAddress: recipientReady.address,
        smartAccountAddress,
        solanaAddress,
      });
      if (selfSendError) {
        showAlert('Check recipient', selfSendError, 'error');
        return;
      }

      if (!amount || parseFloat(amount) <= 0) {
        showAlert('Enter an amount', 'Choose an amount greater than zero.', 'error');
        return;
      }

      if (!selectedToken) {
        showAlert('Add USDC first', 'Add Base USDC, then come back to send it.', 'error');
        return;
      }

      const balanceError = getInsufficientBalanceError(selectedToken, amount);
      if (balanceError) {
        showAlert('Not enough balance', balanceError, 'error');
        return;
      }

      setShowConfirmation(true);
    } finally {
      reviewSubmitInFlightRef.current = false;
    }
  };

  const handleConfirmedSend = async () => {
    setShowConfirmation(false);
    if (!isAgentFundingFlow && recipientAddress) {
      // Remember this recipient for the quick picks. Fire-and-forget: it can
      // never block or alter the transfer itself.
      void recordRecipientUse(recipientAddress);
    }
    resetUserOpTracking();
    setSending(true);
    try {
      if (isSolanaNetwork(network)) {
        await sendSolanaTransfer();
      } else {
        await sendEvmTransfer();
      }
    } catch (error) {
      console.error('Transfer error:', error);
      showAlert('Send failed', error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleAlertDismiss = () => {
    hideAlert();
    if (alertType === 'success') {
      if (isSendTab) {
        setAmount('');
        resetRecipient();
        return;
      }

      router.back();
    }
  };

  const networkDisplayName = getNetworkLabel(network);
  const tokenBalance = getTokenBalance(selectedToken);
  const tokenBalanceUnavailable = tokenBalance === null;
  const usdEstimate = getUsdEstimate(selectedToken, amount);
  const fundingTarget = recipientLabel || 'this agent';
  const payTitle = isDefaultSendFlow ? 'Pay' : 'Send';
  const fromWalletPreview = isSolanaNetwork(network)
    ? formatAddressPreview(solanaAddress)
    : formatAddressPreview(smartAccountAddress);
  const canContinue =
    !!recipientInput &&
    !!amount &&
    !!selectedToken &&
    !sending &&
    !resolvingRecipient &&
    !loadingFundingBalance &&
    (!isAgentFundingFlow || !!recipientAddress);
  const noBaseUsdcForFunding = isAgentFundingFlow && !loadingFundingBalance && !selectedToken && !fundingBalanceError;
  const noBaseUsdcForSend = isDefaultSendFlow && !loadingFundingBalance && !selectedToken && !fundingBalanceError;
  let alertConfirmText = 'Got it';
  if (explorerUrl && !explorerUrl.startsWith('Transaction Hash:')) {
    alertConfirmText = isAgentFundingFlow || isDefaultSendFlow ? 'View payment' : 'View send';
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <EaseView
          initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reduceMotion)}
        >
          {isSendTab ? (
            <View style={styles.backButtonSpacer} />
          ) : (
            <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </RegentPressable>
          )}
        </EaseView>
        <EaseView
          initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reduceMotion, STAGGER_STEP)}
        >
          <Text style={styles.headerTitle}>{isAgentFundingFlow ? 'Fund agent' : payTitle}</Text>
        </EaseView>
        {isDefaultSendFlow ? <ProfileButton /> : <View style={{ width: 40 }} />}
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
              {isAgentFundingFlow ? `Fund ${fundingTarget}` : isDefaultSendFlow ? 'Who are you paying?' : 'Who are you sending to?'}
            </Text>
            <Text style={styles.screenSubtitle}>
              {isAgentFundingFlow
                ? 'Send Base USDC to this agent so it has a working balance for tools, services, and work.'
                : 'Paste an Ethereum address, use an ENS name, or choose a QR photo. You will review before you pay.'}
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
                  {isAgentFundingFlow ? `Funding ${recipientLabel}` : `${isDefaultSendFlow ? 'Paying' : 'Sending to'} ${recipientLabel}`}
                </Text>
              </View>
            ) : null}
            <View style={styles.inputContainer}>
              <View style={styles.fieldIcon}>
                <Ionicons name="person-outline" size={20} color={colors.textMuted} />
              </View>
              <TextInput
                style={[styles.input, styles.recipientInput, { flex: 1 }, addressError && styles.inputError]}
                value={recipientInput}
                onChangeText={handleAddressChange}
                placeholder={isSolanaNetwork(network) ? 'Solana address' : 'Ethereum address or ENS name'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isAgentFundingFlow}
              />
              {isAgentFundingFlow ? null : recipientInput ? (
                <RegentPressable
                  haptic="selection"
                  pressStyle="icon"
                  style={styles.pasteButton}
                  onPress={resetRecipient}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </RegentPressable>
              ) : (
                <View style={styles.pasteButtonSpacer} />
              )}
            </View>

            {!isAgentFundingFlow ? (
              <View style={styles.recipientActions}>
                <RegentPressable
                  haptic="selection"
                  pressStyle="chip"
                  style={styles.recipientActionButton}
                  onPress={handlePasteRecipient}
                >
                  <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
                  <Text style={styles.recipientActionText}>Paste</Text>
                </RegentPressable>
                <RegentPressable
                  haptic="selection"
                  pressStyle="chip"
                  style={styles.recipientActionButton}
                  onPress={handleQrPhoto}
                  disabled={scanningQrPhoto}
                >
                  {scanningQrPhoto ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <Ionicons name="qr-code-outline" size={18} color={colors.accent} />
                  )}
                  <Text style={styles.recipientActionText}>QR photo</Text>
                </RegentPressable>
              </View>
            ) : null}

            {!isAgentFundingFlow ? (
              <RecipientQuickPicks onSelect={handleAddressChange} />
            ) : null}

            {resolvingRecipient ? (
              <Text style={styles.helper}>Checking ENS name...</Text>
            ) : ensResolution ? (
              <View style={styles.resolvedRecipientCard}>
                <Text style={styles.resolvedRecipientTitle}>ENS name found</Text>
                <Text style={styles.resolvedRecipientText}>
                  {ensResolution.name} sends to {formatAddressPreview(ensResolution.address)}.
                </Text>
                <Text style={styles.resolvedRecipientText}>
                  {getEnsResolutionCopy(ensResolution)}
                </Text>
              </View>
            ) : null}

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
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                selectionColor={colors.accent}
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

            <LiveValueFlash value={`available-${tokenBalance ?? 'unavailable'}-${selectedToken?.token?.symbol || ''}`} style={styles.availableFlash}>
              <Text style={[styles.helper, tokenBalanceUnavailable && styles.errorText]}>
                {loadingFundingBalance
                  ? 'Checking Base USDC...'
                  : tokenBalanceUnavailable
                    ? 'We could not read this balance. Close this screen and try again.'
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
                This agent accepts Base USDC. Add USDC, then come back to send it to {fundingTarget}.
              </Text>
              <RegentPressable style={styles.inlinePrimaryButton} onPress={() => router.push(routes.wallet())}>
                <Text style={styles.inlinePrimaryButtonText}>Add USDC</Text>
              </RegentPressable>
            </EaseView>
          ) : null}

          {noBaseUsdcForSend ? (
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildTimingTransition(reduceMotion, STAGGER_STEP * 5)}
              style={[styles.card, styles.noticeCard]}
            >
              <Text style={styles.noticeTitle}>Add USDC first</Text>
              <Text style={styles.noticeText}>
                Pay uses Base USDC. Add funds, then come back to pay.
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
            <Ionicons name="shield-checkmark-outline" size={24} color={colors.textMuted} />
            <View style={styles.reviewCopy}>
              <Text style={styles.reviewTitle}>{isAgentFundingFlow || isDefaultSendFlow ? 'Review payment' : 'Review send'}</Text>
              <Text style={styles.reviewText}>
                {isAgentFundingFlow
                  ? 'Check the agent, amount, and destination before money moves.'
                  : 'Check the recipient, amount, and network before money moves.'}
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
                {fromWalletPreview}
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
              <LiveValueFlash value={`from-wallet-available-${tokenBalance ?? 'unavailable'}-${selectedToken?.token?.symbol || ''}`} style={styles.detailValueFlash}>
                <Text style={styles.detailValue}>
                  {tokenBalance ?? 'Unavailable'} {selectedToken?.token?.symbol || ''}
                </Text>
              </LiveValueFlash>
            </View>
            {isPaymasterSupported ? (
              <Text style={styles.helper}>No network fee will be charged for this {isDefaultSendFlow ? 'payment' : 'send'}.</Text>
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
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.mainSendButtonText}>{isAgentFundingFlow || isDefaultSendFlow ? 'Review payment' : 'Review send'}</Text>
              )}
            </RegentPressable>
          </EaseView>
        </ScrollView>
      </KeyboardAvoidingView>

      <SendConfirmationModal
        visible={showConfirmation}
        reduceMotion={reduceMotion}
        isAgentFundingFlow={isAgentFundingFlow}
        isDefaultSendFlow={isDefaultSendFlow}
        fundingTarget={fundingTarget}
        fromAddressPreview={fromWalletPreview}
        recipientAddress={recipientAddress}
        networkDisplayName={networkDisplayName}
        tokenSymbol={selectedToken?.token?.symbol}
        amount={amount}
        usdEstimate={usdEstimate}
        onCancel={() => setShowConfirmation(false)}
        onConfirm={handleConfirmedSend}
      />

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
