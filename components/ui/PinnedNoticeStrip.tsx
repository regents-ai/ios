/**
 * PinnedNoticeStrip - ephemeral local notices pinned above the composer.
 *
 * Adapted from hermex ChatViewModel.swift:4055. Shows the pending notices from
 * the local-notice store (utils/localNotices); once a notice confirms it
 * leaves this strip and flushes into the transcript instead.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import type { LocalNotice } from '@/utils/localNotices';

const { CARD_ALT, BORDER, TEXT_SECONDARY, BLUE } = COLORS;

export function PinnedNoticeStrip({ notices }: { notices: LocalNotice[] }) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {notices.map((notice) => (
        <View key={notice.id} style={styles.row}>
          <ActivityIndicator size="small" color={BLUE} />
          <Text style={styles.label}>{notice.pendingLabel}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
});
