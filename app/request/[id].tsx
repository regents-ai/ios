/**
 * One payment request: who asks, how much, where the money goes and why.
 *
 * Pay prepares the one USDC transfer, the wallet asks the person to confirm
 * it, and the screen follows the wallet's report. Once Base shows the
 * payment, the request is marked paid. Pay stays available whatever the
 * request's status, and every press reaches the wallet, including a repeat
 * press while an earlier payment is still going through.
 *
 * Opened from a notification's Pay or Decline button, the screen starts that
 * step as soon as the request and wallet are ready.
 */

import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { ProgressToast } from '@/components/ui/ProgressToast';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { showUpdatedPaymentRequest } from '@/hooks/usePaymentRequests';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { PaymentRequest } from '@/types/regents';
import { formatRelativeTime } from '@/utils/agent-surfaces/formatters';
import { describeApiError } from '@/utils/apiError';
import { routes } from '@/utils/navigation/routes';
import { getEvmExplorerUrl } from '@/utils/onchain/networkDisplay';
import { paymentRequestCall, paymentRequestNetworkForChain } from '@/utils/onchain/paymentRequestWalletAction';
import { paymentRequestStatusLabel, paysAgentWallet } from '@/utils/paymentRequests/display';
import {
  dismissToast,
  resolveToastSuccess,
  showProgressToast,
  type ProgressToastState,
} from '@/utils/progressToast';
import { regentApi } from '@/utils/regentApi/client';
import { useCurrentUser, useSendUserOperation } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

/** A payment the wallet reported as sent that Base has not yet confirmed for this request. */
type UncheckedPayment = { txHash: string; walletAddress: string };

function smartWalletAddress(value?: string | null): `0x${string}` | null {
  const trimmed = value?.trim();
  return trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? (trimmed as `0x${string}`) : null;
}

export default function PaymentRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; action?: string }>();
  const requestId = typeof params.id === 'string' ? params.id : '';
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { alertProps, showAlert } = useCoinbaseAlert();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation, status: userOpStatus, data: userOpData, error: userOpError } = useSendUserOperation();
  const smartAccount = smartWalletAddress(currentUser?.evmSmartAccounts?.[0] as string | undefined);

  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ProgressToastState | null>(null);
  const [unchecked, setUnchecked] = useState<UncheckedPayment | null>(null);
  // The last payment this screen sent, and the wallet that sent it.
  const sentRef = useRef<{ hash: string; walletAddress: string } | null>(null);
  const lastHandledUserOpRef = useRef<string | null>(null);
  const startedActionRef = useRef(false);

  const showRequest = useCallback((next: PaymentRequest) => {
    setRequest(next);
    showUpdatedPaymentRequest(next);
  }, []);

  const loadRequest = useCallback(async (refresh = false) => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      }
      showRequest(await regentApi.getPaymentRequest(requestId));
    } catch (error) {
      setRequest(null);
      showAlert({ title: 'This request is unavailable right now', message: describeApiError(error).message, type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestId, showAlert, showRequest]);

  useFocusEffect(
    useCallback(() => {
      void loadRequest();
    }, [loadRequest])
  );

  const checkPayment = useCallback(async (payment: UncheckedPayment) => {
    try {
      setToast(() => showProgressToast('Checking your payment...'));
      showRequest(await regentApi.confirmPaymentRequestPaid(requestId, payment));
      setUnchecked(null);
      setToast((current) => resolveToastSuccess(current, 'Paid', Date.now()));
    } catch (error) {
      setUnchecked(payment);
      setToast(() => dismissToast());
      showAlert({ title: 'Your payment was sent', message: describeApiError(error).message, type: 'error' });
    }
  }, [requestId, showAlert, showRequest]);

  // The wallet reports on the last payment it sent; each report is acted on
  // once. A payment that went through is checked on Base and marks the
  // request paid.
  useEffect(() => {
    const transitionKey = `${userOpStatus}:${userOpData?.userOpHash ?? ''}`;
    if (lastHandledUserOpRef.current === transitionKey) {
      return;
    }
    lastHandledUserOpRef.current = transitionKey;

    const sent = sentRef.current;
    if (!sent || (userOpData?.userOpHash && userOpData.userOpHash !== sent.hash)) {
      return;
    }

    if (userOpStatus === 'success') {
      sentRef.current = null;
      const txHash = userOpData?.transactionHash;
      if (txHash) {
        void checkPayment({ txHash, walletAddress: sent.walletAddress });
      } else {
        setToast((current) => resolveToastSuccess(current, 'Payment sent', Date.now()));
      }
    } else if (userOpStatus === 'error') {
      sentRef.current = null;
      setToast(() => dismissToast());
      showAlert({ title: "Your payment didn't go through", message: describeApiError(userOpError).message, type: 'error' });
    }
  }, [checkPayment, showAlert, userOpData, userOpError, userOpStatus]);

  const pay = useCallback(async () => {
    if (!smartAccount) {
      return;
    }

    try {
      setToast(() => showProgressToast('Opening payment...'));
      const walletAction = await regentApi.preparePaymentRequest(requestId, { walletAddress: smartAccount });
      const { userOperationHash } = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: paymentRequestNetworkForChain(walletAction.chain_id),
        calls: [paymentRequestCall(walletAction, smartAccount)],
        useCdpPaymaster: false,
      });

      sentRef.current = { hash: userOperationHash, walletAddress: smartAccount };
      setToast(() => showProgressToast('Paying...'));
    } catch (error) {
      setToast(() => dismissToast());
      const failure = describeApiError(error);
      showAlert({ title: failure.title, message: failure.message, type: 'error' });
    }
  }, [requestId, sendUserOperation, showAlert, smartAccount]);

  const decline = useCallback(async () => {
    try {
      setToast(() => showProgressToast('Declining...'));
      showRequest(await regentApi.declinePaymentRequest(requestId));
      setToast((current) => resolveToastSuccess(current, 'Declined', Date.now()));
    } catch (error) {
      setToast(() => dismissToast());
      const failure = describeApiError(error);
      showAlert({ title: failure.title, message: failure.message, type: 'error' });
    }
  }, [requestId, showAlert, showRequest]);

  // A notification's Pay or Decline button starts its step once, as soon as
  // the request (and, to pay, the wallet) is ready.
  const action = params.action === 'pay' || params.action === 'decline' ? params.action : null;
  useEffect(() => {
    if (!action) {
      startedActionRef.current = false;
      return;
    }
    if (startedActionRef.current || !request || (action === 'pay' && !smartAccount)) {
      return;
    }

    startedActionRef.current = true;
    router.setParams({ action: undefined });
    if (action === 'pay') {
      void pay();
    } else {
      void decline();
    }
  }, [action, decline, pay, request, router, smartAccount]);

  const openPayment = useCallback((txHash: string) => {
    const url = getEvmExplorerUrl('base', txHash);
    if (url) {
      void Linking.openURL(url);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading request…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This request is not in your list</Text>
          <RegentPressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </RegentPressable>
        </View>
        <CoinbaseAlert {...alertProps} />
      </SafeAreaView>
    );
  }

  const toAgent = paysAgentWallet(request);
  const paidTxHash = request.status === 'paid' ? request.txHash : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          pressStyle="icon"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Request</Text>
        <RegentPressable
          accessibilityLabel="Refresh request"
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          pressStyle="icon"
          onPress={() => void loadRequest(true)}
          disabled={refreshing}
          style={styles.iconButton}
        >
          <SpinningRefreshIcon refreshing={refreshing} size={18} color={colors.accent} />
        </RegentPressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{request.agentName} asks for</Text>
              <Text style={styles.amount}>{request.amount} USDC</Text>
              <Text style={styles.metaHint}>On Base · {formatRelativeTime(request.createdAt)}</Text>
            </View>
            {request.status === 'paid' ? (
              <StatusPill label={paymentRequestStatusLabel(request.status)} color={colors.success} backgroundColor={colors.successWash} />
            ) : request.status === 'waiting' ? (
              <StatusPill label={paymentRequestStatusLabel(request.status)} color={colors.accent} backgroundColor={colors.accentWash} showDot />
            ) : (
              <StatusPill label={paymentRequestStatusLabel(request.status)} color={colors.textMuted} backgroundColor={colors.surface} />
            )}
          </View>

          <View style={styles.noteBlock}>
            <Text style={styles.metaLabel}>In {request.agentName}&apos;s words</Text>
            <Text style={styles.noteText}>“{request.note}”</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.metaLabel}>Goes to</Text>
            <Text style={styles.receiver}>{toAgent ? 'Your agent' : 'Another address'}</Text>
            <Text style={styles.address} selectable>{request.to}</Text>
            {toAgent ? null : (
              <Text style={styles.warningText}>
                This is not your agent&apos;s wallet. Pay only if you know who this address belongs to.
              </Text>
            )}
          </View>

          {paidTxHash ? (
            <RegentPressable
              accessibilityHint="Opens in your browser"
              accessibilityRole="link"
              style={styles.linkRow}
              onPress={() => openPayment(paidTxHash)}
            >
              <Ionicons name="open-outline" size={16} color={colors.accent} />
              <Text style={styles.linkText}>See the payment on Basescan</Text>
            </RegentPressable>
          ) : null}
        </View>

        {smartAccount ? (
          <View style={styles.actions}>
            <RegentPressable style={styles.primaryButton} onPress={() => void pay()}>
              <Ionicons name="paper-plane-outline" size={16} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>Pay {request.amount} USDC</Text>
            </RegentPressable>
            {unchecked ? (
              <RegentPressable style={styles.secondaryButton} onPress={() => void checkPayment(unchecked)}>
                <Text style={styles.secondaryButtonText}>Check my payment again</Text>
              </RegentPressable>
            ) : null}
            {request.status === 'waiting' ? (
              <RegentPressable style={styles.secondaryButton} onPress={() => void decline()}>
                <Text style={styles.secondaryButtonText}>Decline</Text>
              </RegentPressable>
            ) : null}
            <Text style={styles.metaHint}>Your wallet asks you to confirm before anything is sent.</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Text style={styles.metaHint}>Requests are paid from your mobile wallet. Open Wallet first, then come back here.</Text>
            <RegentPressable style={styles.primaryButton} onPress={() => router.push(routes.wallet())}>
              <Text style={styles.primaryButtonText}>Open Wallet</Text>
            </RegentPressable>
            {request.status === 'waiting' ? (
              <RegentPressable style={styles.secondaryButton} onPress={() => void decline()}>
                <Text style={styles.secondaryButtonText}>Decline</Text>
              </RegentPressable>
            ) : null}
          </View>
        )}
      </ScrollView>

      <ProgressToast toast={toast} onDismiss={() => setToast(dismissToast())} />
      <CoinbaseAlert {...alertProps} />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 12,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 20,
      lineHeight: 24,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      gap: 16,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 24,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 15,
      fontFamily: fonts.ui,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 22,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 28,
      padding: 22,
      gap: 18,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    titleCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    amount: {
      color: colors.text,
      fontSize: 36,
      lineHeight: 42,
      fontFamily: fonts.title,
    },
    section: {
      gap: 4,
    },
    noteBlock: {
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
    },
    noteText: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 23,
      fontFamily: fonts.ui,
    },
    metaLabel: {
      color: colors.textMuted,
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    metaHint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    receiver: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
    },
    address: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    warningText: {
      color: colors.warning,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    linkText: {
      color: colors.accent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    actions: {
      gap: 10,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 16,
      minHeight: 50,
      paddingHorizontal: 18,
      paddingVertical: 13,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
  });
}
