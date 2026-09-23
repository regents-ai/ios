import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { refreshPaymentRequests, usePaymentRequests } from '@/hooks/usePaymentRequests';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { PaymentRequest } from '@/types/regents';
import { formatRelativeTime } from '@/utils/agent-surfaces/formatters';
import { routes } from '@/utils/navigation/routes';
import { paymentRequestStatusLabel } from '@/utils/paymentRequests/display';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function RequestsTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { requests, loaded, error } = usePaymentRequests();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshPaymentRequests();
    }, [])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPaymentRequests();
    setRefreshing(false);
  }, []);

  const statusPill = (request: PaymentRequest) => {
    const label = paymentRequestStatusLabel(request.status);
    switch (request.status) {
      case 'waiting':
        return <StatusPill label={label} color={colors.accent} backgroundColor={colors.accentWash} showDot />;
      case 'paid':
        return <StatusPill label={label} color={colors.success} backgroundColor={colors.successWash} />;
      case 'declined':
        return <StatusPill label={label} color={colors.textMuted} backgroundColor={colors.surface} />;
    }
  };

  if (!loaded) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading your requests…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
    >
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Requests</Text>
        <Text style={styles.heroTitle}>Money your agents asked for</Text>
        <Text style={styles.heroBody}>Pay a request from your wallet in Base USDC, or decline it.</Text>
      </View>

      {error ? (
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={styles.noticeText}>{error}</Text>
        </View>
      ) : null}

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="mail-unread-outline" size={28} color={colors.accent} />
          <Text style={styles.emptyText}>
            No requests yet. When one of your agents asks for money, it shows up here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {requests.map((request) => (
            <RegentPressable
              key={request.id}
              onPress={() => router.push(routes.paymentRequest(request.id))}
              pressStyle="card"
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${request.agentName} asks for ${request.amount} USDC. ${paymentRequestStatusLabel(request.status)}.`}
            >
              <View style={styles.rowTop}>
                <View style={styles.rowCopy}>
                  <Text style={styles.agentName} numberOfLines={1}>{request.agentName}</Text>
                  <Text style={styles.meta}>{formatRelativeTime(request.createdAt)}</Text>
                </View>
                {statusPill(request)}
              </View>
              <Text style={styles.amount}>{request.amount} USDC</Text>
              <Text style={styles.note} numberOfLines={2}>{request.note}</Text>
            </RegentPressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 120,
      gap: 16,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 24,
      backgroundColor: colors.bg,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 15,
      fontFamily: fonts.ui,
    },
    heroCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 28,
      padding: 22,
      gap: 14,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 32,
      lineHeight: 38,
      fontFamily: fonts.title,
    },
    heroBody: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fonts.ui,
    },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    noticeText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    emptyCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 28,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    list: {
      gap: 10,
    },
    row: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 20,
      padding: 16,
      gap: 8,
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    agentName: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
    },
    meta: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.ui,
    },
    amount: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    note: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
  });
}
