import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
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
import { COLORS } from "../../constants/Colors";
import { FONTS } from "../../constants/Typography";
import { useRegentsAuth } from "../../hooks/useRegentsAuth";
import {
  CACHED_MODE_BANNER,
  resolveCacheGate,
  type CacheMode,
} from "../../utils/cacheFallbackPolicy";
import { resolveDynamicTypeLayout } from "../../utils/dynamicTypeLayout";
import { fetchTransactionHistory } from "../../utils/fetchTransactionHistory";
import { describeListLoadFailure, type ListLoadFailure } from "../../utils/listLoadFailure";


const { BLUE, DARK_BG, CARD_BG, CARD_ALT, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

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
  const { getAccessToken, regentsUserId } = useRegentsAuth();
  // Row -> stacked layout for dense rows at accessibility font sizes.
  const typeLayout = resolveDynamicTypeLayout(PixelRatio.getFontScale());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageKey, setNextPageKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<ListLoadFailure | null>(null);
  const [cacheMode, setCacheMode] = useState<CacheMode>('live');
  const cachedTransactionsRef = useRef<Transaction[] | null>(null);

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
      }
    }, [loadTransactions, regentsUserId])
  );

  const handleRefresh = useCallback(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleLoadMore = useCallback(() => {
    if (nextPageKey && !loadingMore && !loading) {
      loadTransactions(nextPageKey, true);
    }
  }, [nextPageKey, loadingMore, loading, loadTransactions]);

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes("completed") || normalizedStatus.includes("success")) {
      return "#00D632"; // Green
    }
    if (normalizedStatus.includes("pending") || normalizedStatus.includes("processing")) {
      return "#FF8500"; // Orange
    }
    if (normalizedStatus.includes("failed") || normalizedStatus.includes("error")) {
      return "#FF6B6B"; // Red
    }
    return TEXT_SECONDARY; // Default gray
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
              color={isFailed ? "#FF6B6B" : WHITE}
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
          <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
        </RegentPressable>
        <Text style={styles.title}>Wallet History</Text>
        <RegentPressable
          pressStyle="icon"
          onPress={handleRefresh}
          disabled={loading}
          style={[styles.refreshButton, loading && { opacity: 0.5 }]}
        >
          <SpinningRefreshIcon refreshing={loading} size={20} color={BLUE} />
        </RegentPressable>
      </View>
      {cacheMode === 'cached' ? (
        <View style={styles.cachedBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={TEXT_SECONDARY} />
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
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={28} color={BLUE} />
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
        )
      ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.transaction_id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() =>
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <SpinningRefreshIcon refreshing size={18} color={BLUE} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,    
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: CARD_BG,    
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.heading,
    textAlign: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: DARK_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
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
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
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
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionIconFailed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
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
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
  },
  cachedBannerText: {
    flex: 1,
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.body,
  },
  transactionAmount: {
    fontSize: 16,
    color: TEXT_PRIMARY, // Neutral white text
    textAlign: 'right',
    fontFamily: FONTS.body,
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
    color: TEXT_PRIMARY,
    flex: 1, // Take up available space
    fontFamily: FONTS.body,
  },
  transactionSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    flex: 1,
    fontFamily: FONTS.body,
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
    fontFamily: FONTS.body,
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
    color: TEXT_SECONDARY,
    marginBottom: 4,
  },
  transactionId: {
    fontSize: 10,
    fontFamily: "monospace",
    color: TEXT_SECONDARY,
  },
  transactionHash: {
    fontSize: 10,
    fontFamily: "monospace",
    color: TEXT_SECONDARY,
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
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.heading,
  },
  emptyMessage: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  emptyButton: {
    marginTop: 8,
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    marginTop: 8,
    fontSize: 12,
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
});
