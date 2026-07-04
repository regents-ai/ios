import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  PixelRatio,
  StyleSheet,
  Text,
  View
} from "react-native";
import { LiveValueFlash } from "../../components/motion/LiveValueFlash";
import { SpinningRefreshIcon } from "../../components/motion/SpinningRefreshIcon";
import { FailedTransactionBadge } from "../../components/ui/FailedTransactionCard";
import { ListRetryRow } from "../../components/ui/ListRetryRow";
import { RegentPressable } from "../../components/ui/RegentPressable";
import { useTheme, type Theme } from "../../theme/ThemeProvider";
import { useRegentsAuth } from "../../hooks/useRegentsAuth";
import {
  CACHED_MODE_BANNER,
  resolveCacheGate,
  type CacheMode,
} from "../../utils/cacheFallbackPolicy";
import { resolveDynamicTypeLayout } from "../../utils/dynamicTypeLayout";
import { fetchOnrampEvents, type TransactionEvent } from "../../utils/fetchOnrampEvents";
import { fetchTransactionHistory } from "../../utils/fetchTransactionHistory";
import { describeListLoadFailure, type ListLoadFailure } from "../../utils/listLoadFailure";


type Transaction = {
  transaction_id: string;
  status: string;
  payment_total: {
    value: string;
    currency: string;
  };
  purchase_currency: string;
  purchase_network: string;
  purchase_amount?: {
    value: string;
    currency: string;
  };
  payment_method?: string;
  created_at: string;
  partner_user_ref: string;
  wallet_address: string;
  tx_hash: string;
};

export default function History() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { getAccessToken, regentsUserId } = useRegentsAuth();
  // Row -> stacked layout for dense rows at accessibility font sizes.
  const typeLayout = resolveDynamicTypeLayout(PixelRatio.getFontScale());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageKey, setNextPageKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<ListLoadFailure | null>(null);
  const [cacheMode, setCacheMode] = useState<CacheMode>('live');
  const [activityEvents, setActivityEvents] = useState<TransactionEvent[]>([]);
  const cachedTransactionsRef = useRef<Transaction[] | null>(null);

  // Read-only lifecycle feed recorded from Coinbase updates. Loading it can
  // never block or fail the main history list.
  const loadActivityEvents = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      setActivityEvents(await fetchOnrampEvents(accessToken || undefined));
    } catch (error) {
      console.warn('Could not load recent transaction updates:', error);
    }
  }, [getAccessToken]);

  const loadTransactions = useCallback(async (pageKey?: string, append: boolean = false) => {
    const userId = regentsUserId;

    if (!userId) {
      return;
    }

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const accessToken = await getAccessToken();
      const result = await fetchTransactionHistory(userId, pageKey, 10, accessToken || undefined);

      if (append) {
        setTransactions(prev => [...prev, ...(result.transactions || [])]);
      } else {
        setTransactions(result.transactions || []);
        cachedTransactionsRef.current = result.transactions || [];
        setCacheMode('live');
      }

      setNextPageKey(result.nextPageKey || null);
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load transaction history:", error);

      // Read-only cache fallback: only on connectivity/transient 5xx, and only
      // for the primary load. A cached snapshot stands in, clearly labeled.
      const gated = append
        ? null
        : resolveCacheGate({ ok: false, error }, cachedTransactionsRef.current);
      if (gated) {
        setTransactions(gated.data);
        setCacheMode(gated.mode);
        setLoadError(null);
      } else {
        setLoadError(describeListLoadFailure(error, "We couldn't load your wallet activity."));
      }
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [getAccessToken, regentsUserId]);

  useFocusEffect(
    useCallback(() => {
      const userId = regentsUserId;

      if (userId) {
        loadTransactions();
        loadActivityEvents();
      }
    }, [loadActivityEvents, loadTransactions, regentsUserId])
  );

  const handleRefresh = useCallback(() => {
    loadTransactions();
    loadActivityEvents();
  }, [loadActivityEvents, loadTransactions]);

  const handleLoadMore = useCallback(() => {
    if (nextPageKey && !loadingMore && !loading) {
      loadTransactions(nextPageKey, true);
    }
  }, [nextPageKey, loadingMore, loading, loadTransactions]);

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes("completed") || normalizedStatus.includes("success")) {
      return colors.success;
    }
    if (normalizedStatus.includes("pending") || normalizedStatus.includes("processing")) {
      return colors.warning;
    }
    if (normalizedStatus.includes("failed") || normalizedStatus.includes("error")) {
      return colors.error;
    }
    return colors.textMuted; // Default
  };

  const isFailedTransaction = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    return normalizedStatus.includes("failed") || normalizedStatus.includes("error");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatStatusLabel = (status: string) =>
    status.replace(/ONRAMP_TRANSACTION_STATUS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

  const describeActivityEvent = (event: TransactionEvent) => {
    const isCashOut = event.eventType.startsWith('offramp.');
    const stage = event.eventType.split('.').pop() ?? '';
    const stageLabel =
      stage === 'created' ? 'Started'
        : stage === 'updated' ? 'In progress'
          : stage === 'success' ? 'Complete'
            : 'Failed';
    const stageColor =
      stage === 'success' ? colors.success
        : stage === 'failed' ? colors.error
          : colors.warning;
    const title = isCashOut
      ? `${event.currency ?? ''} Cash Out`.trim()
      : `${event.currency ?? 'Crypto'} Purchase`;

    return { failed: stage === 'failed', stageColor, stageLabel, title };
  };

  const renderActivityUpdates = (standalone = false) => {
    if (activityEvents.length === 0) {
      return null;
    }

    return (
      <View style={[styles.updatesSection, standalone && styles.updatesSectionStandalone]}>
        <Text style={styles.updatesTitle}>Latest updates</Text>
        {activityEvents.slice(0, 5).map((event) => {
          const { failed, stageColor, stageLabel, title } = describeActivityEvent(event);
          const subtitleParts = [
            event.amount && event.currency ? `${event.amount} ${event.currency}` : null,
            event.network,
            formatDate(event.occurredAt),
          ].filter(Boolean);

          return (
            <View key={`${event.eventType}:${event.transactionId}`} style={styles.updateRow}>
              <View
                style={styles.updateRowTop}
                accessible
                accessibilityLabel={`${title}, ${stageLabel}, ${subtitleParts.join(', ')}`}
              >
                <View style={styles.updateInfo}>
                  <Text style={styles.transactionTitle}>{title}</Text>
                  <Text style={styles.transactionSubtitle}>{subtitleParts.join(' • ')}</Text>
                  {failed && event.failureReason ? (
                    <Text style={styles.updateFailureText}>{event.failureReason}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, { borderColor: stageColor, backgroundColor: `${stageColor}15` }]}>
                  <Text style={[styles.statusText, { color: stageColor }]}>{stageLabel}</Text>
                </View>
              </View>
              {failed && (
                <View style={styles.updateBadgeRow}>
                  <FailedTransactionBadge
                    transaction={{
                      transaction_id: event.transactionId,
                      status: 'failed',
                      purchase_currency: event.currency,
                      purchase_network: event.network,
                      created_at: event.occurredAt,
                      partner_user_ref: regentsUserId ?? undefined,
                    }}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isFailed = isFailedTransaction(item.status);
    const statusLabel = formatStatusLabel(item.status);
    // One flattened accessibility element per row, with the state included in
    // the label. The interactive support badge stays a separate element.
    const rowAccessibilityLabel = `${item.purchase_currency} purchase of $${item.payment_total.value}, ${statusLabel}, ${item.purchase_network}, ${formatDate(item.created_at)}`;

    return (
      <View style={styles.transactionShell}>
        <View style={styles.transactionItem} accessible accessibilityLabel={rowAccessibilityLabel}>
          <View style={[styles.transactionIcon, isFailed && styles.transactionIconFailed]}>
            <Ionicons
              name={isFailed ? "alert-circle" : "swap-horizontal"}
              size={16}
              color={isFailed ? colors.error : colors.onAccent}
            />
          </View>
          <View style={styles.transactionContent}>
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionTitle}>
                {item.purchase_currency} Purchase
              </Text>
              <Text style={styles.transactionSubtitle}>
                {item.purchase_network} • {formatDate(item.created_at)}
              </Text>
            </View>

            <View style={[styles.transactionMeta, typeLayout.direction === 'stacked' && styles.transactionMetaStacked]}>
              <LiveValueFlash value={`${item.transaction_id}-${item.payment_total.value}`} style={styles.transactionAmountFlash}>
                <Text style={styles.transactionAmount}>
                  ${item.payment_total.value}
                </Text>
              </LiveValueFlash>
              <View style={[styles.statusBadge, { borderColor: getStatusColor(item.status), backgroundColor: `${getStatusColor(item.status)}15` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Show support badge for failed transactions. It sits outside the
            flattened row so it stays reachable as its own control. */}
        {isFailed && (
          <View style={styles.supportBadgeRow}>
            <FailedTransactionBadge transaction={item} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </RegentPressable>
        <Text style={styles.title}>Wallet History</Text>
        <RegentPressable
          pressStyle="icon"
          onPress={handleRefresh}
          disabled={loading}
          style={[styles.refreshButton, loading && { opacity: 0.5 }]}
        >
          <SpinningRefreshIcon refreshing={loading} size={20} color={colors.accent} />
        </RegentPressable>
      </View>
      {cacheMode === 'cached' ? (
        <View style={styles.cachedBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
          <Text style={styles.cachedBannerText}>{CACHED_MODE_BANNER}</Text>
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.errorRowWrap}>
          <ListRetryRow
            title={loadError.title}
            message={loadError.message}
            offline={loadError.offline}
            onRetry={() => loadTransactions()}
            retryHint="Tries loading your wallet activity again"
          />
        </View>
      ) : null}
      {transactions.length === 0 ? (
        loadError ? null : (
        <>
        {renderActivityUpdates(true)}
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={28} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No activity yet</Text>
          <Text style={styles.emptyMessage}>
            {regentsUserId
              ? "Your wallet activity will appear here after you buy, send, or cash out."
              : "Sign in to view your wallet activity."}
          </Text>
          <RegentPressable
            style={styles.emptyButton}
            onPress={() => router.replace(regentsUserId ? '/wallet' : '/auth/login')}
          >
            <Text style={styles.emptyButtonText}>{regentsUserId ? 'Open Wallet' : 'Sign in'}</Text>
          </RegentPressable>
        </View>
        </>
        )
      ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.transaction_id}
            contentContainerStyle={styles.listContainer}
            ListHeaderComponent={renderActivityUpdates()}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() =>
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <SpinningRefreshIcon refreshing size={18} color={colors.accent} />
                  <Text style={styles.footerText}>Loading more...</Text>
                </View>
              ) : nextPageKey ? (
                <View style={styles.footerLoader}>
                  <Text style={styles.footerText}>Scroll to load more</Text>
                </View>
              ) : transactions.length > 0 ? (
                <View style={styles.footerLoader}>
                  <Text style={styles.footerText}>No more transactions</Text>
                </View>
              ) : null
            }
          />
        )}
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surfaceElevated,    
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineStrong,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    color: colors.text,
    fontFamily: fonts.title,
    textAlign: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listContainer: {
    padding: 20,
  },
  transactionShell: {
    padding: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionIconFailed: {
    backgroundColor: colors.errorWash,
    borderColor: colors.error,
  },
  supportBadgeRow: {
    marginTop: 8,
    // Align the badge under the row copy (icon width 40 + row gap 12).
    paddingLeft: 52,
    alignItems: 'flex-start',
  },
  errorRowWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cachedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
  },
  cachedBannerText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.ui,
  },
  updatesSection: {
    marginBottom: 16,
    gap: 10,
  },
  updatesSectionStandalone: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  updatesTitle: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: fonts.title,
  },
  updateRow: {
    padding: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 16,
  },
  updateRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  updateInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  updateFailureText: {
    fontSize: 12,
    color: colors.error,
    fontFamily: fonts.ui,
  },
  updateBadgeRow: {
    marginTop: 4,
    alignItems: 'flex-start',
  },
  transactionAmount: {
    fontSize: 16,
    color: colors.text, // Neutral white text
    textAlign: 'right',
    fontFamily: fonts.ui,
  },
  transactionAmountFlash: {
    alignSelf: 'flex-end',
  },
  transactionContent: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  transactionTitle: {
    fontSize: 16,
    color: colors.text,
    flex: 1, // Take up available space
    fontFamily: fonts.ui,
  },
  transactionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    flex: 1,
    fontFamily: fonts.ui,
  },
  transactionInfo: {
    flex: 1,
    gap: 4,
  },
  transactionMetaStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  transactionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '100%',
    gap: 8,
  },
  statusText: {
    fontSize: 12,
    textAlign: 'right',
    flexShrink: 1,
    fontFamily: fonts.ui,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-end',
    maxWidth: '100%',
  },
  separator: {
    height: 12,
    backgroundColor: 'transparent',
  },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  transactionId: {
    fontSize: 10,
    fontFamily: "monospace",
    color: colors.textMuted,
  },
  transactionHash: {
    fontSize: 10,
    fontFamily: "monospace",
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    color: colors.text,
    fontFamily: fonts.title,
  },
  emptyMessage: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  emptyButton: {
    marginTop: 8,
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  });
}
