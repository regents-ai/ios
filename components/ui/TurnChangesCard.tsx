/**
 * TurnChangesCard - collapsible recap of what an agent turn changed.
 *
 * Inspired by hermex GitTurnChangesCard.swift. A read-only receipt: header
 * toggles the list; each row drills in to its detail. It never triggers or
 * confirms actions — the money already moved; this only reports it.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { summarizeTurnChanges, turnChangesSummary } from '@/utils/turnChangesRecap';
import type { MessageThreadEvent } from '@/types/regents';

export function TurnChangesCard({ events }: { events: MessageThreadEvent[] }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rows = summarizeTurnChanges(events);
  const summary = turnChangesSummary(rows);
  const [expanded, setExpanded] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  if (!summary) {
    return null;
  }

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

  const toggleRow = (eventId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenRowId((current) => (current === eventId ? null : eventId));
  };

  return (
    <View style={styles.card}>
      <RegentPressable style={styles.header} onPress={toggle}>
        <Text style={styles.summary}>{summary}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </RegentPressable>

      {expanded ? (
        <View style={styles.rows}>
          {rows.map((row) => {
            const open = openRowId === row.eventId;
            const detail = row.event.riskCopy || row.event.text || row.event.message;
            return (
              <RegentPressable key={row.eventId} style={styles.row} onPress={() => toggleRow(row.eventId)}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowAction}>{row.action}</Text>
                  {row.amountLabel ? <Text style={styles.rowAmount}>{row.amountLabel}</Text> : null}
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-forward'}
                    size={15}
                    color={theme.colors.accent}
                  />
                </View>
                {open && detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
              </RegentPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, fonts, type }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: 18,
      padding: 14,
      marginTop: 14,
      gap: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summary: {
      color: colors.text,
      fontSize: type.label.size,
      fontFamily: fonts.title,
    },
    rows: {
      gap: 8,
    },
    row: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      gap: 6,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rowAction: {
      flex: 1,
      color: colors.text,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
    rowAmount: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
    },
    rowDetail: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      lineHeight: type.caption.line,
      fontFamily: fonts.ui,
    },
  });
}
