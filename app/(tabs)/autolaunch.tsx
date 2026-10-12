import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { ProfileButton } from '@/components/navigation/ProfileButton';
import { ListRetryRow } from '@/components/ui/ListRetryRow';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { AutolaunchAuction } from '@/types/autolaunch';
import { formatRelativeTime } from '@/utils/agent-surfaces/formatters';
import {
  auctionReference,
  auctionStatus,
  chainLabel,
  launchKindLabel,
  nameCopy,
  priceCopy,
  raisedCopy,
} from '@/utils/autolaunch/auctionDisplay';
import { auctionStatusTone } from '@/utils/autolaunch/auctionTone';
import { listAutolaunchAuctions } from '@/utils/autolaunch/client';
import { describeListLoadFailure, type ListLoadFailure } from '@/utils/listLoadFailure';
import { routes } from '@/utils/navigation/routes';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';

type AuctionRowProps = {
  auction: AutolaunchAuction;
  onPressAuction: (auction: AutolaunchAuction) => void;
};

const AuctionRow = memo(function AuctionRow({ auction, onPressAuction }: AuctionRowProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const status = auctionStatus(auction.state);
  const tone = auctionStatusTone(status.tone, colors);
  const raised = raisedCopy(auction);
  const opened = auction.chain === 'base' && auction.opened_at ? formatRelativeTime(auction.opened_at) : null;
  const summary = auction.chain === 'base' ? auction.summary : null;
  const handlePress = useCallback(() => {
    onPressAuction(auction);
  }, [auction, onPressAuction]);

  // One flattened accessibility element per row, state words included.
  const rowAccessibilityLabel = [
    nameCopy(auction),
    launchKindLabel(auction.kind),
    status.label,
    priceCopy(auction),
    raised ? `${raised} raised` : null,
    opened ? `opened ${opened}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <RegentPressable
      pressStyle="card"
      style={styles.row}
      onPress={handlePress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel}
      accessibilityHint="Opens this auction"
    >
      <View style={styles.rowHeader}>
        <View style={styles.rowTitleGroup}>
          <Text style={styles.rowKind}>
            {launchKindLabel(auction.kind)} · {chainLabel(auction.chain)}
          </Text>
          <Text style={styles.rowTitle} numberOfLines={2}>{auction.title}</Text>
          {auction.token_symbol ? <Text style={styles.rowSymbol}>{auction.token_symbol}</Text> : null}
        </View>
        <StatusPill
          label={status.label}
          color={tone.accent}
          backgroundColor={tone.wash}
          showDot={status.open}
          compact
        />
      </View>

      {summary ? <Text style={styles.rowSummary} numberOfLines={2}>{summary}</Text> : null}

      <View style={styles.rowFooter}>
        <View style={styles.rowMetaGroup}>
          <Text style={styles.rowMeta}>{priceCopy(auction)}</Text>
          {raised ? <Text style={styles.rowMeta}>{raised} raised</Text> : null}
          {opened ? <Text style={styles.rowMetaMuted}>Opened {opened}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </RegentPressable>
  );
});

function RowSeparator() {
  return <View style={{ height: 12 }} />;
}

export default function AutolaunchTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [auctions, setAuctions] = useState<AutolaunchAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<ListLoadFailure | null>(null);

  const loadAuctions = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setAuctions(await listAutolaunchAuctions());
      setLoadError(null);
    } catch (error) {
      setLoadError(describeListLoadFailure(error, 'Unable to load auctions right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAuctions();
    }, [loadAuctions])
  );

  const openCount = auctions.filter((auction) => auctionStatus(auction.state).open).length;

  const handleAuctionPress = useCallback((auction: AutolaunchAuction) => {
    router.push(routes.auction(auctionReference(auction)));
  }, [router]);

  const renderAuction = useCallback<ListRenderItem<AutolaunchAuction>>(
    ({ item }) => <AuctionRow auction={item} onPressAuction={handleAuctionPress} />,
    [handleAuctionPress]
  );

  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.eyebrow}>Autolaunch</Text>
          <Text style={styles.title}>Follow the latest launches</Text>
          <Text style={styles.subtitle}>
            Revstake and Memestock auctions on Autolaunch, newest first.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <RegentPressable
            accessibilityLabel="Refresh auctions"
            accessibilityRole="button"
            accessibilityState={{ busy: refreshing, disabled: refreshing }}
            pressStyle="icon"
            onPress={() => loadAuctions(true)}
            disabled={refreshing}
            style={styles.iconButton}
          >
            <SpinningRefreshIcon refreshing={refreshing} size={18} color={colors.accent} />
          </RegentPressable>
          <ProfileButton />
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{openCount}</Text>
          <Text style={styles.summaryLabel}>Open now</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{auctions.length}</Text>
          <Text style={styles.summaryLabel}>Listed</Text>
        </View>
      </View>

      {loadError ? (
        <ListRetryRow
          title={loadError.title}
          message={loadError.message}
          offline={loadError.offline}
          onRetry={() => loadAuctions()}
          retryHint="Tries loading the auctions again"
        />
      ) : null}
    </View>
  ), [auctions.length, colors, loadAuctions, loadError, openCount, refreshing, styles]);

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.emptyTitle}>Loading auctions</Text>
        </View>
      );
    }

    // The retry row in the header already explains a failed load; showing
    // "No auctions are open yet" under it would be misleading.
    if (loadError) {
      return null;
    }

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons name="rocket-outline" size={24} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>No auctions are open yet</Text>
        <Text style={styles.emptyBody}>Launches open soon. Pull down to check again.</Text>
      </View>
    );
  }, [colors, loadError, loading, styles]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        style={styles.scroller}
        data={auctions}
        renderItem={renderAuction}
        keyExtractor={auctionReference}
        ItemSeparatorComponent={RowSeparator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAuctions(true)} tintColor={colors.accent} />
        }
      />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroller: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 120,
    },
    listHeader: {
      gap: 16,
      paddingBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      paddingTop: 8,
    },
    titleGroup: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      lineHeight: 38,
      fontFamily: fonts.title,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: fonts.ui,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 12,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 20,
      padding: 16,
      gap: 4,
    },
    summaryValue: {
      color: colors.text,
      fontSize: 26,
      fontFamily: fonts.title,
    },
    summaryLabel: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    row: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 20,
      padding: 16,
      gap: 12,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    rowTitleGroup: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    rowKind: {
      color: colors.accent,
      fontSize: 12,
      fontFamily: fonts.ui,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 22,
      fontFamily: fonts.title,
    },
    rowSymbol: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    rowSummary: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    rowFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    rowMetaGroup: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    rowMeta: {
      color: colors.text,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    rowMetaMuted: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.ui,
    },
    emptyState: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 40,
      paddingHorizontal: 20,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accentWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
      textAlign: 'center',
    },
    emptyBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
      textAlign: 'center',
    },
  });
}
