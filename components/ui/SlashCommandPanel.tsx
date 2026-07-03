/**
 * SlashCommandPanel - autocomplete panel raised by `/` in the composer.
 *
 * Adapted from hermex SlashCommandAutocompleteView.swift. Lists filtered
 * commands, or a command's sub-argument hint once its name is typed. Money
 * commands are badged so it is clear they open a confirm screen — the panel
 * never runs them; the composer routes selection.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  filterCommands,
  type SlashCommand,
  type SlashParse,
} from '@/utils/slashCommands';

type SlashCommandPanelProps = {
  parse: SlashParse;
  onPick: (command: SlashCommand) => void;
};

export function SlashCommandPanel({ parse, onPick }: SlashCommandPanelProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (parse.mode === 'none') {
    return null;
  }

  if (parse.mode === 'argument') {
    const argName = parse.command.argument?.name;
    return (
      <View style={styles.panel}>
        <View style={styles.argRow}>
          <Text style={styles.argCommand}>/{parse.command.name}</Text>
          {argName ? <Text style={styles.argHint}>Enter {argName}</Text> : null}
          {parse.command.confirms ? <Text style={styles.confirmBadge}>Opens confirm</Text> : null}
        </View>
      </View>
    );
  }

  const commands = filterCommands(parse.query);
  if (commands.length === 0) {
    return null;
  }

  return (
    <View style={styles.panel}>
      {commands.map((command) => (
        <RegentPressable key={command.name} style={styles.row} onPress={() => onPick(command)}>
          <View style={styles.rowHead}>
            <Text style={styles.rowName}>/{command.name}</Text>
            {command.confirms ? <Text style={styles.confirmBadge}>Opens confirm</Text> : null}
          </View>
          <Text style={styles.rowDescription}>{command.description}</Text>
        </RegentPressable>
      ))}
    </View>
  );
}

function makeStyles({ colors, fonts, type }: Theme) {
  return StyleSheet.create({
    panel: {
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: 16,
      padding: 6,
      gap: 4,
    },
    row: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 3,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rowName: {
      color: colors.text,
      fontSize: type.label.size,
      fontFamily: fonts.title,
    },
    rowDescription: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
    },
    argRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    argCommand: {
      color: colors.accent,
      fontSize: type.label.size,
      fontFamily: fonts.title,
    },
    argHint: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
    },
    // Money commands are badged in the warning tone (opens the confirm flow).
    confirmBadge: {
      color: colors.warning,
      fontSize: 11,
      fontFamily: fonts.ui,
    },
  });
}
