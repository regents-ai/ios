import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { ListRetryRow } from '@/components/ui/ListRetryRow';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { TECHTREE_URL } from '@/constants/TECHTREE_URL';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { describeListLoadFailure, type ListLoadFailure } from '@/utils/listLoadFailure';
import { fetchTechtreeResults, type TechtreeResultCard } from '@/utils/techtreeResults';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const LOAD_FAILURE_MESSAGE = "We couldn't load the latest Techtree results.";
const LOAD_MORE_FAILURE_MESSAGE = "We couldn't load more results.";

export default function TechtreeTab() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { alertProps, showAlert } = useCoinbaseAlert();
  const [cards, setCards] = useState<TechtreeResultCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<ListLoadFailure | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<ListLoadFailure | null>(null);

  const loadLatest = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const page = await fetchTechtreeResults();
      setCards(page.cards);
      setNextBeforeSequence(page.nextBeforeSequence);
      setLoadError(null);
      setLoadMoreError(null);
    } catch (error) {
      setLoadError(describeListLoadFailure(error, LOAD_FAILURE_MESSAGE));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (nextBeforeSequence === null || loading || refreshing || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const page = await fetchTechtreeResults(nextBeforeSequence);
      setCards((current) => [...current, ...page.cards]);
      setNextBeforeSequence(page.nextBeforeSequence);
      setLoadMoreError(null);
    } catch (error) {
      setLoadMoreError(describeListLoadFailure(error, LOAD_MORE_FAILURE_MESSAGE));
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, nextBeforeSequence, refreshing]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const openLink = useCallback(
    async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch (error) {
        console.warn('Link open failed:', error);
        showAlert({
          title: 'Unable to open link',
          message: 'Try again in a moment.',
          type: 'error',
        });
      }
    },
    [showAlert]
  );

  const scoreColor = (delta: number) =>
    delta > 0 ? colors.success : delta < 0 ? colors.error : colors.textMuted;

  const renderCard = ({ item }: { item: TechtreeResultCard }) => {
    const tone = scoreColor(item.scoreDelta);

    return (
      <RegentPressable
        pressStyle="card"
        style={styles.card}
        accessibilityRole="link"
        accessibilityLabel={item.accessibilityLabel}
        accessibilityHint="Opens this result on techtree.sh"
        onPress={() => openLink(item.entryUrl)}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardCopy}>
            <Text style={styles.skillName}>{item.skillName}</Text>
            <Text style={styles.climbName}>{item.climbName}</Text>
          </View>
          <View style={[styles.scoreBadge, { borderColor: tone, backgroundColor: `${tone}15` }]}>
            <Text style={[styles.scoreValue, { color: tone }]}>{item.scoreChange}</Text>
            <Text style={styles.scoreCaption}>vs. starting point</Text>
          </View>
        </View>
        <Text style={styles.record}>{item.record}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="hardware-chip-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.model}
            </Text>
          </View>
          <Text style={styles.metaText}>{item.date}</Text>
        </View>
      </RegentPressable>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.footerText}>Loading more results…</Text>
        </View>
      );
    }

    if (loadMoreError) {
      return (
        <View style={styles.footer}>
          <ListRetryRow
            title={loadMoreError.title}
            message={loadMoreError.message}
            offline={loadMoreError.offline}
            onRetry={loadMore}
            retryHint="Tries loading more results again"
          />
        </View>
      );
    }

    if (nextBeforeSequence === null && cards.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>That is every result so far.</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Techtree</Text>
        <Text style={styles.title}>Latest results</Text>
        <Text style={styles.subtitle}>
          Each result shows how a skill scored against its starting point on a shared set of tasks.
        </Text>
        <RegentPressable
          accessibilityRole="link"
          accessibilityHint="Opens in your browser"
          style={styles.siteButton}
          onPress={() => openLink(TECHTREE_URL)}
        >
          <Ionicons name="open-outline" size={16} color={colors.text} />
          <Text style={styles.siteButtonText}>Open techtree.sh</Text>
        </RegentPressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.centerText}>Loading results…</Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadLatest(true)} tintColor={colors.accent} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            loadError ? (
              <View style={styles.errorRow}>
                <ListRetryRow
                  title={loadError.title}
                  message={loadError.message}
                  offline={loadError.offline}
                  onRetry={() => loadLatest()}
                  retryHint="Tries loading the latest results again"
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loadError ? null : (
              <View style={styles.centerState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="git-branch-outline" size={28} color={colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>No results yet</Text>
                <Text style={styles.centerText}>
                  Results appear here as soon as a skill has been scored on Techtree.
                </Text>
              </View>
            )
          }
          ListFooterComponent={renderFooter}
        />
      )}

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
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
      gap: 6,
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
    siteButton: {
      alignSelf: 'flex-start',
      marginTop: 6,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    siteButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    list: {
      paddingHorizontal: 20,
      paddingBottom: 120,
      flexGrow: 1,
    },
    separator: {
      height: 12,
    },
    errorRow: {
      paddingBottom: 16,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 20,
      padding: 16,
      gap: 10,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    skillName: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 22,
      fontFamily: fonts.title,
    },
    climbName: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    scoreBadge: {
      alignItems: 'flex-end',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
    },
    scoreValue: {
      fontSize: 18,
      lineHeight: 22,
      fontFamily: fonts.title,
    },
    scoreCaption: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
      fontFamily: fonts.ui,
    },
    record: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    metaItem: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
      flexShrink: 1,
    },
    footer: {
      paddingVertical: 20,
      alignItems: 'center',
      gap: 8,
    },
    footerText: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      paddingVertical: 48,
      gap: 10,
    },
    centerText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      fontFamily: fonts.ui,
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
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
    },
  });
}
