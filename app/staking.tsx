import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { RegentStakingAction, RegentStakingState } from '@/types/regents';
import { ProgressToast } from '@/components/ui/ProgressToast';
import { describeApiError } from '@/utils/apiError';
import {
  dismissToast,
  resolveToastSuccess,
  showProgressToast,
  type ProgressToastState,
} from '@/utils/progressToast';
import { regentApi } from '@/utils/regentApi/client';
import {
  hasPositiveRawAmount,
  needsStakingApproval,
  stakingActionCall,
  stakingApprovalCall,
  stakingNetworkForChain,
} from '@/utils/onchain/stakingWalletAction';
import { useCurrentUser, useSendUserOperation } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

const {
  DARK_BG,
  CARD_BG,
  CARD_ALT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  BLUE,
  BORDER,
  WHITE,
  SUCCESS,
  ORANGE,
} = COLORS;

function smartWalletAddress(value?: string | null): `0x${string}` | null {
  const trimmed = value?.trim();
  return trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed as `0x${string}` : null;
}

function displayAmount(value?: string | null) {
  if (!value) {
    return '0';
  }

  const [whole, decimal] = value.split('.');
  if (!decimal) {
    return whole;
  }

  return `${whole}.${decimal.slice(0, 4)}`.replace(/\.?0+$/, '');
}

function actionTitle(action: RegentStakingAction) {
  switch (action) {
    case 'stake':
      return 'Stake sent';
    case 'unstake':
      return 'Unstake sent';
    case 'claim_usdc':
      return 'USDC claim sent';
    case 'claim_regent':
      return 'REGENT claim sent';
    case 'claim_and_restake_regent':
      return 'Claim and restake sent';
  }
}

function actionLoadingCopy(action: RegentStakingAction, approval?: boolean) {
  if (approval) {
    return 'Approving REGENT...';
  }

  switch (action) {
    case 'stake':
      return 'Opening stake review...';
    case 'unstake':
      return 'Opening unstake review...';
    case 'claim_usdc':
      return 'Opening USDC claim...';
    case 'claim_regent':
      return 'Opening REGENT claim...';
    case 'claim_and_restake_regent':
      return 'Opening claim and restake...';
  }
}

function positiveDecimal(value: string) {
  return /^\d+(\.\d+)?$/.test(value.trim()) && Number.parseFloat(value) > 0;
}

export default function RegentStakingScreen() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const smartAccount = smartWalletAddress(currentUser?.evmSmartAccounts?.[0] as string | undefined);
  const [staking, setStaking] = useState<RegentStakingState | null>(null);
  const [amount, setAmount] = useState('');
  const [stakeForDifferentWallet, setStakeForDifferentWallet] = useState(false);
  const [receiver, setReceiver] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<RegentStakingAction | null>(null);
  const [approvalStep, setApprovalStep] = useState(false);
  const [alertState, setAlertState] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info',
  });
  const [toast, setToast] = useState<ProgressToastState | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToastDismiss = useCallback(() => {
    setToast(dismissToast());
  }, []);

  const clearScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const loadStaking = useCallback(async (refresh = false) => {
    if (!smartAccount) {
      setStaking(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setStaking(await regentApi.getRegentStaking({ walletAddress: smartAccount }));
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Staking is not available',
        message: describeApiError(error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [smartAccount]);

  useFocusEffect(
    useCallback(() => {
      void loadStaking();
      return clearScheduledRefresh;
    }, [clearScheduledRefresh, loadStaking])
  );

  const canStake = !!smartAccount && !!staking && !staking.paused && positiveDecimal(amount);
  const canUnstake = !!smartAccount && !!staking && positiveDecimal(amount);
  const canClaimUsdc = hasPositiveRawAmount(staking?.wallet_claimable_usdc_raw);
  const canClaimRegent = hasPositiveRawAmount(staking?.wallet_claimable_regent_raw);
  const pendingCopy = pendingAction ? actionLoadingCopy(pendingAction, approvalStep) : null;

  const metricRows = useMemo(() => [
    { label: 'Your stake', value: `${displayAmount(staking?.wallet_stake_balance)} REGENT` },
    { label: 'REGENT in wallet', value: `${displayAmount(staking?.wallet_token_balance)} REGENT` },
    { label: 'USDC ready', value: `${displayAmount(staking?.wallet_claimable_usdc)} USDC` },
    { label: 'REGENT ready', value: `${displayAmount(staking?.wallet_claimable_regent)} REGENT` },
  ], [staking]);

  const runStakingAction = useCallback(async (action: RegentStakingAction) => {
    if (!smartAccount) {
      setAlertState({
        visible: true,
        title: 'Wallet is not ready',
        message: 'Open Wallet first, then come back to staking.',
        type: 'error',
      });
      return;
    }

    try {
      setPendingAction(action);
      setApprovalStep(false);
      setToast(showProgressToast(actionLoadingCopy(action)));
      const walletAddress = smartAccount;
      const response =
        action === 'stake'
          ? await regentApi.stakeRegent({
              walletAddress,
              amount,
              ...(stakeForDifferentWallet && receiver.trim() ? { receiver: receiver.trim() } : {}),
            })
          : action === 'unstake'
            ? await regentApi.unstakeRegent({ walletAddress, amount })
            : action === 'claim_usdc'
              ? await regentApi.claimRegentStakingUsdc({ walletAddress })
              : action === 'claim_regent'
                ? await regentApi.claimRegentStakingRegent({ walletAddress })
                : await regentApi.claimAndRestakeRegent({ walletAddress });

      const walletAction = response.wallet_action;
      const network = stakingNetworkForChain(walletAction.chain_id);
      const approvalRequired = await needsStakingApproval(walletAction, walletAddress);
      const approvalCall = stakingApprovalCall(walletAction, walletAddress);

      if (approvalRequired && approvalCall) {
        setApprovalStep(true);
        await sendUserOperation({
          evmSmartAccount: walletAddress,
          network,
          calls: [approvalCall],
          useCdpPaymaster: false,
        });
      }

      setApprovalStep(false);
      await sendUserOperation({
        evmSmartAccount: walletAddress,
        network,
        calls: [stakingActionCall(walletAction, walletAddress)],
        useCdpPaymaster: false,
      });

      setToast((current) => resolveToastSuccess(current, actionTitle(action), Date.now()));
      setAmount('');
      clearScheduledRefresh();
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void loadStaking(true);
      }, 2200);
    } catch (error) {
      setToast(dismissToast());
      setAlertState({
        visible: true,
        title: 'Staking did not finish',
        message: describeApiError(error).message,
        type: 'error',
      });
    } finally {
      setPendingAction(null);
      setApprovalStep(false);
    }
  }, [amount, clearScheduledRefresh, loadStaking, receiver, sendUserOperation, smartAccount, stakeForDifferentWallet]);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadStaking(true)} tintColor={BLUE} />}
        >
          <View style={styles.headerRow}>
            <RegentPressable pressStyle="icon" style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
            </RegentPressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>REGENT staking</Text>
              <Text style={styles.title}>Stake, claim, and compound</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={BLUE} />
              <Text style={styles.loadingText}>Loading staking...</Text>
            </View>
          ) : !smartAccount ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={30} color={BLUE} />
              <Text style={styles.emptyTitle}>Open Wallet first</Text>
              <Text style={styles.emptyText}>Your staking controls appear after your mobile wallet is ready.</Text>
              <RegentPressable style={styles.primaryButton} onPress={() => router.push('/wallet')}>
                <Text style={styles.primaryButtonText}>Open Wallet</Text>
              </RegentPressable>
            </View>
          ) : (
            <>
              <View style={styles.heroPanel}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroLabel}>Total staked</Text>
                    <LiveValueFlash value={`total-${staking?.total_staked || '0'}`}>
                      <Text style={styles.heroValue}>{displayAmount(staking?.total_staked)} REGENT</Text>
                    </LiveValueFlash>
                  </View>
                  <View style={[styles.statusPill, staking?.paused && styles.statusPillWarning]}>
                    <View style={[styles.statusDot, staking?.paused && styles.statusDotWarning]} />
                    <Text style={styles.statusText}>{staking?.paused ? 'Paused' : staking?.chain_label || 'Base'}</Text>
                  </View>
                </View>
                <Text style={styles.heroBody}>
                  Rewards come from the live REGENT staking pool. Claim buttons use your current balances.
                </Text>
              </View>

              <View style={styles.metricGrid}>
                {metricRows.map((metric) => (
                  <View key={metric.label} style={styles.metricTile}>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    <LiveValueFlash value={`${metric.label}-${metric.value}`}>
                      <Text style={styles.metricValue}>{metric.value}</Text>
                    </LiveValueFlash>
                  </View>
                ))}
              </View>

              {pendingCopy ? (
                <View style={styles.noticeRow}>
                  <ActivityIndicator size="small" color={BLUE} />
                  <Text style={styles.noticeText}>{pendingCopy}</Text>
                </View>
              ) : null}

              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={TEXT_SECONDARY}
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                />
                <View style={styles.switchRow}>
                  <View style={styles.switchCopy}>
                    <Text style={styles.switchTitle}>Stake for another wallet</Text>
                    <Text style={styles.switchText}>Send the staked position to a wallet you enter.</Text>
                  </View>
                  <Switch
                    value={stakeForDifferentWallet}
                    onValueChange={setStakeForDifferentWallet}
                    trackColor={{ false: CARD_ALT, true: BLUE }}
                    thumbColor={WHITE}
                  />
                </View>
                {stakeForDifferentWallet ? (
                  <TextInput
                    value={receiver}
                    onChangeText={setReceiver}
                    placeholder="0x... or name.eth"
                    placeholderTextColor={TEXT_SECONDARY}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.receiverInput}
                  />
                ) : null}
              </View>

              <View style={styles.actionGrid}>
                <ActionButton
                  label="Stake"
                  icon="lock-closed-outline"
                  disabled={!canStake || !!pendingAction}
                  onPress={() => void runStakingAction('stake')}
                />
                <ActionButton
                  label="Unstake"
                  icon="lock-open-outline"
                  disabled={!canUnstake || !!pendingAction}
                  onPress={() => void runStakingAction('unstake')}
                />
                <ActionButton
                  label="Claim USDC"
                  icon="cash-outline"
                  disabled={!canClaimUsdc || !!pendingAction}
                  onPress={() => void runStakingAction('claim_usdc')}
                />
                <ActionButton
                  label="Claim REGENT"
                  icon="sparkles-outline"
                  disabled={!canClaimRegent || !!pendingAction}
                  onPress={() => void runStakingAction('claim_regent')}
                />
              </View>

              <RegentPressable
                style={[styles.compoundButton, (!canClaimRegent || !!pendingAction) && styles.disabledButton]}
                disabled={!canClaimRegent || !!pendingAction}
                onPress={() => void runStakingAction('claim_and_restake_regent')}
              >
                <Ionicons name="sync-outline" size={18} color={WHITE} />
                <Text style={styles.compoundButtonText}>Claim and restake REGENT</Text>
              </RegentPressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ProgressToast toast={toast} onDismiss={handleToastDismiss} />
      <CoinbaseAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onConfirm={() => setAlertState((current) => ({ ...current, visible: false }))}
        onCancel={() => setAlertState((current) => ({ ...current, visible: false }))}
      />
    </View>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <RegentPressable
      disabled={disabled}
      pressStyle="card"
      style={[styles.actionButton, disabled && styles.disabledButton]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={18} color={disabled ? TEXT_SECONDARY : BLUE} />
      <Text style={[styles.actionButtonText, disabled && styles.disabledText]}>{label}</Text>
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  keyboardWrap: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 42,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 25,
    lineHeight: 30,
    fontFamily: FONTS.heading,
  },
  centerState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  emptyState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  heroPanel: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  heroLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  heroValue: {
    color: TEXT_PRIMARY,
    fontSize: 28,
    lineHeight: 33,
    fontFamily: FONTS.heading,
  },
  heroBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statusPillWarning: {
    backgroundColor: '#F2E7DA',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: SUCCESS,
  },
  statusDotWarning: {
    backgroundColor: ORANGE,
  },
  statusText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 92,
    padding: 14,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
  },
  metricLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  metricValue: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  noticeText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  formSection: {
    gap: 12,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 19,
    fontFamily: FONTS.heading,
  },
  amountInput: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  switchTitle: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  switchText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.body,
  },
  receiverInput: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  actionButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  compoundButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: BLUE,
  },
  compoundButtonText: {
    color: WHITE,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  disabledButton: {
    opacity: 0.48,
  },
  disabledText: {
    color: TEXT_SECONDARY,
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
});
