import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { ListRetryRow } from '@/components/ui/ListRetryRow';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { AUTOLAUNCH_URL } from '@/constants/AUTOLAUNCH_URL';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { AutolaunchAuction } from '@/types/autolaunch';
import {
  auctionStatus,
  auctionWebPath,
  chainLabel,
  launchKindLabel,
  priceCopy,
  raisedCopy,
} from '@/utils/autolaunch/auctionDisplay';
import { auctionStatusTone } from '@/utils/autolaunch/auctionTone';
import { getAutolaunchAuction } from '@/utils/autolaunch/client';
import { describeListLoadFailure, type ListLoadFailure } from '@/utils/listLoadFailure';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function formatOpenedAt(dateString: string) {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timingCopy(state: AutolaunchAuction['state']) {
  switch (state) {
    case 'created':
      return 'Bidding has not started.';
    case 'active':
      return 'Bids are being taken now.';
    case 'graduated':
      return 'Bidding has ended and the launch raised its minimum.';
    case 'failed':
      return 'Bidding has ended without reaching its minimum.';
  }
}

export default function AuctionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const reference = typeof params.id === 'string' ? params.id : '';
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [auction, setAuction] = useState<AutolaunchAuction | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<ListLoadFailure | null>(null);
  const { alertProps, showAlert } = useCoinbaseAlert();

  const loadAuction = useCallback(async (refresh = false) => {
    if (!reference) {
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setAuction(await getAutolaunchAuction(reference));
      setLoadError(null);
    } catch (error) {
      setLoadError(describeListLoadFailure(error, 'Unable to load this auction right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reference]);

  useFocusEffect(
    useCallback(() => {
      loadAuction();
    }, [loadAuction])
  );

  const webUrl = auction ? `${AUTOLAUNCH_URL}${auctionWebPath(auction)}` : AUTOLAUNCH_URL;

  const openOnAutolaunch = useCallback(async () => {
    try {
      await Linking.openURL(webUrl);
    } catch (error) {
      showAlert({
        title: 'Unable to open link',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    }
  }, [showAlert, webUrl]);

  const status = auction ? auctionStatus(auction.state) : null;
  const tone = status ? auctionStatusTone(status.tone, colors) : null;
  const raised = auction ? raisedCopy(auction) : null;
  const price = auction ? priceCopy(auction) : null;
  const opened = auction?.chain === 'base' && auction.opened_at ? formatOpenedAt(auction.opened_at) : null;
  const summary = auction?.chain === 'base' ? auction.summary : null;

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
        <Text style={styles.headerTitle} numberOfLines={1}>{auction?.title ?? 'Auction'}</Text>
        <RegentPressable
          accessibilityLabel="Refresh auction"
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          pressStyle="icon"
          onPress={() => loadAuction(true)}
          disabled={refreshing}
          style={styles.iconButton}
        >
          <SpinningRefreshIcon refreshing={refreshing} size={18} color={colors.accent} />
        </RegentPressable>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAuction(true)} tintColor={colors.accent} />
        }
      >
        {loadError ? (
          <ListRetryRow
            title={loadError.title}
            message={loadError.message}
            offline={loadError.offline}
            onRetry={() => loadAuction()}
            retryHint="Tries loading this auction again"
          />
        ) : null}

        {loading && !auction ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading auction</Text>
          </View>
        ) : null}

        {auction && status && tone ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroTitleBlock}>
                  <Text style={styles.eyebrow}>
                    {launchKindLabel(auction.kind)} · {chainLabel(auction.chain)}
                  </Text>
                  <Text style={styles.heroTitle}>{auction.title}</Text>
                  {auction.token_symbol ? <Text style={styles.heroSymbol}>{auction.token_symbol}</Text> : null}
                </View>
                <StatusPill
                  label={status.label}
                  color={tone.accent}
                  backgroundColor={tone.wash}
                  showDot={status.open}
                />
              </View>
              {summary ? <Text style={styles.heroBody}>{summary}</Text> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Price</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>Current price</Text>
                  <LiveValueFlash value={`price-${price}`}>
                    <Text style={styles.metricValue}>{price}</Text>
                  </LiveValueFlash>
                  <Text style={styles.metricHint}>
                    The price every winning bid pays right now. It moves as bids come in.
                  </Text>
                </View>
                {auction.quote_token.symbol ? (
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Bids are paid in</Text>
                    <Text style={styles.metricValue}>{auction.quote_token.symbol}</Text>
                  </View>
                ) : null}
                {raised ? (
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Raised so far</Text>
                    <LiveValueFlash value={`raised-${raised}`}>
                      <Text style={styles.metricValue}>{raised}</Text>
                    </LiveValueFlash>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Timing</Text>
              <Text style={styles.sectionBody}>{timingCopy(auction.state)}</Text>
              {opened ? (
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>Opened</Text>
                  <Text style={styles.metricValue}>{opened}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Take part</Text>
              <Text style={styles.sectionBody}>
                You can follow this auction here. To place a bid or collect tokens, open it on Autolaunch.
              </Text>
              <RegentPressable
                accessibilityHint="Opens in your browser"
                accessibilityRole="link"
                style={styles.primaryButton}
                onPress={openOnAutolaunch}
              >
                <Ionicons name="open-outline" size={16} color={colors.onAccent} />
                <Text style={styles.primaryButtonText}>Open on Autolaunch</Text>
              </RegentPressable>
            </View>
          </>
        ) : null}
      </ScrollView>

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
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
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
      fontSize: 18,
      fontFamily: fonts.title,
      textAlign: 'center',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 48,
      gap: 16,
    },
    centerState: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 48,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    heroCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 20,
      gap: 14,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroTitleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: fonts.title,
    },
    heroSymbol: {
      color: colors.textMuted,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    heroBody: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fonts.ui,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 20,
      gap: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    sectionBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    metricGrid: {
      gap: 10,
    },
    metricTile: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
      gap: 4,
    },
    metricLabel: {
      color: colors.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    metricValue: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fonts.title,
    },
    metricHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: fonts.ui,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 16,
      minHeight: 48,
      paddingHorizontal: 18,
      paddingVertical: 13,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
  });
}
