import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { ShimmerBlock } from '@/components/motion/ShimmerBlock';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { BalanceRecord, useWalletDetailsState } from '@/hooks/wallet/useWalletDetailsState';

const { CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, DANGER, BLUE_WASH, SUCCESS } = COLORS;
const GREEN_WASH = '#E6F0EA';

function formatAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function getActualTokenAmount(balance: BalanceRecord) {
  const rawAmount = parseFloat(balance.amount?.amount || '0');
  const decimals = parseInt(balance.amount?.decimals || '0', 10);
  return rawAmount / Math.pow(10, decimals || 1);
}

function formatTokenAmount(balance: BalanceRecord) {
  const amount = getActualTokenAmount(balance);
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatUsdValue(usdValue?: number) {
  if (typeof usdValue !== 'number') return 'Price unavailable';
  if (usdValue >= 1000) {
    return usdValue.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return usdValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export function WalletDetailsSection() {
  const {
    primaryAddress,
    solanaAddress,
    loadingBalances,
    balancesError,
    balancesExpanded,
    setBalancesExpanded,
    loadingTestnetBalances,
    testnetBalancesError,
    testnetExpanded,
    setTestnetExpanded,
    recentCopyKey,
    alertState,
    setAlertState,
    groupedMainnetBalances,
    groupedTestnetBalances,
    featuredBaseUsdc,
    walletUsdTotal,
    hasAnyWalletBalance,
    copyAddress,
    refreshWalletSnapshot,
    handleTransfer,
    handleCashOut,
    handlePrimarySend,
    handlePrimaryCashOut,
    fetchBalances,
    fetchTestnetBalances,
  } = useWalletDetailsState();
  const refreshingWallet = loadingBalances || loadingTestnetBalances;

  const renderBalanceRow = (balance: BalanceRecord, network: string, cashOutEnabled: boolean) => {
    const symbol = balance.token?.symbol || 'UNKNOWN';
    const amountText = formatTokenAmount(balance);
    const usdText = formatUsdValue(balance.usdValue);

    return (
      <View
        key={`${network}-${balance.token?.contractAddress || balance.token?.mintAddress || symbol}`}
        style={[styles.balanceRow, network === 'Base' && styles.balanceRowFeatured]}
      >
        <View style={styles.balanceHeader}>
          <View style={styles.balanceCopy}>
            <Text style={styles.balanceSymbol}>{symbol}</Text>
            {balance.token?.name ? <Text style={styles.balanceName}>{balance.token.name}</Text> : null}
          </View>
          <View style={styles.balanceRight}>
            <LiveValueFlash value={`${network}-${symbol}-${amountText}`} style={styles.balanceValueFlash}>
              <Text style={styles.balanceAmount}>{amountText}</Text>
            </LiveValueFlash>
            <LiveValueFlash value={`${network}-${symbol}-${usdText}`} style={styles.balanceValueFlash}>
              <Text style={styles.balanceUsd}>{usdText}</Text>
            </LiveValueFlash>
          </View>
        </View>

        <View style={styles.balanceActions}>
          <RegentPressable pressStyle="chip" style={styles.actionChip} onPress={() => handleTransfer(balance, network)}>
            <Text style={styles.actionChipText}>Send</Text>
          </RegentPressable>
          {cashOutEnabled ? (
            <RegentPressable
              pressStyle="chip"
              style={[styles.actionChip, styles.cashOutChip]}
              onPress={() => handleCashOut(balance, network)}
            >
              <Text style={styles.actionChipText}>Cash out</Text>
            </RegentPressable>
          ) : null}
        </View>
      </View>
    );
  };

  const renderLoadingSkeleton = () => (
    <View style={styles.loadingShell}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.loadingSkeletonRow}>
          <View style={styles.loadingSkeletonLeft}>
            <ShimmerBlock style={[styles.skeletonBlock, styles.skeletonTitle]} />
            <ShimmerBlock style={[styles.skeletonBlock, styles.skeletonLine]} />
          </View>
          <View style={styles.loadingSkeletonRight}>
            <ShimmerBlock style={[styles.skeletonBlock, styles.skeletonValue]} />
            <ShimmerBlock style={[styles.skeletonBlock, styles.skeletonLineShort]} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.cardTitle}>Wallet actions</Text>
            <Text style={styles.cardHint}>Keep your main address, recent activity, and everyday actions in one place.</Text>
          </View>
          <RegentPressable pressStyle="icon" onPress={refreshWalletSnapshot} disabled={refreshingWallet} style={styles.iconButton}>
            <SpinningRefreshIcon refreshing={refreshingWallet} size={18} color={TEXT_PRIMARY} />
          </RegentPressable>
        </View>

        <View style={styles.featuredCard}>
          <View style={styles.featuredTopRow}>
            <View style={styles.featuredCopy}>
              <Text style={styles.featuredEyebrow}>Base first</Text>
              <Text style={styles.featuredTitle}>USDC stays front and center.</Text>
            </View>
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>Primary route</Text>
            </View>
          </View>
          <Text style={styles.featuredBody}>
            Use Base for the quickest Regents path, then keep Ethereum and Solana nearby when you need them.
          </Text>
          <View style={styles.featuredStats}>
            <View style={styles.featuredStat}>
              <Text style={styles.featuredStatLabel}>Base USDC</Text>
              <LiveValueFlash
                value={loadingBalances ? 'updating-base-usdc' : featuredBaseUsdc ? `${formatTokenAmount(featuredBaseUsdc)} USDC` : 'add-funds'}
              >
                <Text style={styles.featuredStatValue}>
                  {loadingBalances ? 'Updating…' : featuredBaseUsdc ? `${formatTokenAmount(featuredBaseUsdc)} USDC` : 'Add funds'}
                </Text>
              </LiveValueFlash>
            </View>
            <View style={styles.featuredStat}>
              <Text style={styles.featuredStatLabel}>Wallet total</Text>
              <LiveValueFlash value={loadingBalances && !hasAnyWalletBalance ? 'updating-total' : formatUsdValue(walletUsdTotal)}>
                <Text style={styles.featuredStatValue}>
                  {loadingBalances && !hasAnyWalletBalance ? 'Updating…' : formatUsdValue(walletUsdTotal)}
                </Text>
              </LiveValueFlash>
            </View>
          </View>
        </View>

        <View style={styles.quickActionGrid}>
          <RegentPressable
            style={[styles.quickActionButton, styles.quickActionPrimary]}
            onPress={handlePrimarySend}
          >
            <Ionicons name="paper-plane-outline" size={18} color={WHITE} />
            <Text style={styles.quickActionPrimaryText}>Send</Text>
          </RegentPressable>
          <RegentPressable
            style={[styles.quickActionButton, styles.quickActionSecondary]}
            onPress={handlePrimaryCashOut}
          >
            <Ionicons name="cash-outline" size={18} color={TEXT_PRIMARY} />
            <Text style={styles.quickActionText}>Cash out</Text>
          </RegentPressable>
        </View>

        {primaryAddress ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Base and Ethereum address</Text>
            <Text style={styles.addressValue}>{formatAddress(primaryAddress)}</Text>
            <RegentPressable
              haptic="none"
              pressStyle="chip"
              style={[styles.secondaryButton, recentCopyKey === 'base' && styles.copySuccessButton]}
              onPress={() => copyAddress(primaryAddress, 'Base and Ethereum address', 'base')}
            >
              <View style={styles.copyButtonContent}>
                {recentCopyKey === 'base' ? <Ionicons name="checkmark-circle" size={15} color={SUCCESS} /> : null}
                <Text style={[styles.secondaryButtonText, recentCopyKey === 'base' && styles.copySuccessText]}>
                  {recentCopyKey === 'base' ? 'Copied' : 'Copy address'}
                </Text>
              </View>
            </RegentPressable>
          </View>
        ) : null}

        {solanaAddress ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Solana address</Text>
            <Text style={styles.addressValue}>{formatAddress(solanaAddress)}</Text>
            <RegentPressable
              haptic="none"
              pressStyle="chip"
              style={[styles.secondaryButton, recentCopyKey === 'solana' && styles.copySuccessButton]}
              onPress={() => copyAddress(solanaAddress, 'Solana address', 'solana')}
            >
              <View style={styles.copyButtonContent}>
                {recentCopyKey === 'solana' ? <Ionicons name="checkmark-circle" size={15} color={SUCCESS} /> : null}
                <Text style={[styles.secondaryButtonText, recentCopyKey === 'solana' && styles.copySuccessText]}>
                  {recentCopyKey === 'solana' ? 'Copied' : 'Copy address'}
                </Text>
              </View>
            </RegentPressable>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <RegentPressable haptic="selection" pressStyle="card" style={styles.cardHeader} onPress={() => setBalancesExpanded((current) => !current)}>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.cardTitle}>Mainnet balances</Text>
            <Text style={styles.cardHint}>Base stays at the top, with send and cash-out actions close to each balance.</Text>
          </View>
          <Ionicons name={balancesExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
        </RegentPressable>

        {balancesExpanded ? (
          <>
            {loadingBalances ? renderLoadingSkeleton() : null}

            {balancesError ? (
              <View style={styles.feedbackBlock}>
                <Text style={styles.errorText}>{balancesError}</Text>
                <RegentPressable style={styles.primaryButton} onPress={() => void fetchBalances()}>
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </RegentPressable>
              </View>
            ) : null}

            {!loadingBalances && !balancesError
              ? groupedMainnetBalances.map((group) => (
                  <View key={group.network} style={styles.networkSection}>
                    <Text style={styles.networkTitle}>{group.network}</Text>
                    {group.balances.length === 0 ? (
                      <Text style={styles.emptyText}>No tokens yet.</Text>
                    ) : (
                      group.balances.map((balance) => renderBalanceRow(balance, group.network, true))
                    )}
                  </View>
                ))
              : null}
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <RegentPressable haptic="selection" pressStyle="card" style={styles.cardHeader} onPress={() => setTestnetExpanded((current) => !current)}>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.cardTitle}>Testnet balances</Text>
            <Text style={styles.cardHint}>Base Sepolia, Ethereum Sepolia, and Solana Devnet balances.</Text>
          </View>
          <Ionicons name={testnetExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
        </RegentPressable>

        {testnetExpanded ? (
          <>
            {loadingTestnetBalances ? renderLoadingSkeleton() : null}

            {testnetBalancesError ? (
              <View style={styles.feedbackBlock}>
                <Text style={styles.errorText}>{testnetBalancesError}</Text>
                <RegentPressable style={styles.primaryButton} onPress={() => void fetchTestnetBalances()}>
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </RegentPressable>
              </View>
            ) : null}

            {!loadingTestnetBalances && !testnetBalancesError
              ? groupedTestnetBalances.map((group) => (
                  <View key={group.network} style={styles.networkSection}>
                    <Text style={styles.networkTitle}>{group.network}</Text>
                    {group.balances.length === 0 ? (
                      <Text style={styles.emptyText}>No tokens yet.</Text>
                    ) : (
                      group.balances.map((balance) => renderBalanceRow(balance, group.network, false))
                    )}
                  </View>
                ))
              : null}
          </>
        ) : null}
      </View>

      <CoinbaseAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onConfirm={() => setAlertState({ visible: false, title: '', message: '', type: 'info' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontFamily: FONTS.heading,
  },
  cardHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
    marginTop: 4,
    maxWidth: 260,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredCard: {
    backgroundColor: BLUE_WASH,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  featuredTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  featuredCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  featuredEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  featuredTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: FONTS.heading,
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  featuredBadgeText: {
    color: BLUE,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  featuredBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  featuredStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featuredStat: {
    flex: 1,
    minWidth: 128,
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 4,
  },
  featuredStatLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  featuredStatValue: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.heading,
  },
  quickActionGrid: {
    gap: 10,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  quickActionPrimary: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  quickActionSecondary: {
    backgroundColor: CARD_ALT,
    borderColor: BORDER,
  },
  quickActionPrimaryText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  quickActionText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  addressBlock: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  addressLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  addressValue: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.heading,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  copySuccessButton: {
    backgroundColor: GREEN_WASH,
    borderColor: SUCCESS,
  },
  copyButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  copySuccessText: {
    color: SUCCESS,
  },
  networkSection: {
    gap: 10,
  },
  networkTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  balanceRow: {
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
  },
  balanceRowFeatured: {
    backgroundColor: BLUE_WASH,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  balanceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  balanceSymbol: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  balanceName: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
    marginTop: 2,
  },
  balanceRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 4,
  },
  balanceValueFlash: {
    alignSelf: 'flex-end',
  },
  balanceAmount: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.heading,
    textAlign: 'right',
  },
  balanceUsd: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.body,
    textAlign: 'right',
  },
  balanceActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  actionChip: {
    flex: 1,
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cashOutChip: {
    backgroundColor: '#F5ECFF',
    borderColor: '#D6BFFF',
  },
  actionChipText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  loadingShell: {
    gap: 10,
  },
  loadingSkeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  loadingSkeletonLeft: {
    gap: 8,
    flex: 1,
  },
  loadingSkeletonRight: {
    gap: 8,
    alignItems: 'flex-end',
  },
  skeletonBlock: {
    borderRadius: 999,
    backgroundColor: '#D8DEE9',
  },
  skeletonTitle: {
    width: 82,
    height: 14,
  },
  skeletonLine: {
    width: 120,
    height: 10,
  },
  skeletonValue: {
    width: 74,
    height: 14,
  },
  skeletonLineShort: {
    width: 52,
    height: 10,
  },
  feedbackBlock: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DANGER,
    backgroundColor: '#FFF0F0',
  },
  errorText: {
    color: DANGER,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: BLUE,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
});
