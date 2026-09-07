/**
 * PinnedNoticeStrip - ephemeral local notices pinned above the composer.
 *
 * Adapted from hermex ChatViewModel.swift:4055. Shows the pending notices from
 * the local-notice store (utils/localNotices); once a notice confirms it
 * leaves this strip and flushes into the transcript instead.
 */

import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { LocalNotice } from '@/utils/localNotices';

export function PinnedNoticeStrip({ notices }: { notices: LocalNotice[] }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const announcement = notices.map((notice) => notice.pendingLabel).join('. ');
  const previousAnnouncementRef = useRef(announcement);

  useEffect(() => {
    const previousAnnouncement = previousAnnouncementRef.current;
    previousAnnouncementRef.current = announcement;
    if (Platform.OS === 'ios' && announcement && announcement !== previousAnnouncement) {
      AccessibilityInfo.announceForAccessibilityWithOptions(announcement, { queue: true });
    }
  }, [announcement]);

  if (notices.length === 0) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
      accessibilityRole="status"
      style={styles.wrap}
    >
      {notices.map((notice) => (
        <View key={notice.id} style={styles.row}>
          <ActivityIndicator size="small" color={theme.colors.accent} />
          <Text style={styles.label}>{notice.pendingLabel}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles({ colors, fonts, type, space, radius }: Theme) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: space.s4,
      paddingTop: space.s2,
      gap: space.s2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s2,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      borderRadius: radius.lg,
      paddingHorizontal: space.s3,
      paddingVertical: space.s2,
    },
    label: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
    },
  });
}
