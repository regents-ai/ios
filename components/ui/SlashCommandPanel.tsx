/**
 * SlashCommandPanel - autocomplete panel raised by `/` in the composer.
 *
 * Adapted from hermex SlashCommandAutocompleteView.swift. Lists filtered
 * commands, or a command's sub-argument hint once its name is typed. Money
 * commands are badged so it is clear they open a confirm screen — the panel
 * never runs them; the composer routes selection.
 */

import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import {
  filterCommands,
  type SlashCommand,
  type SlashParse,
} from '@/utils/slashCommands';

const { CARD_BG, CARD_ALT, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, AMBER } = {
  ...COLORS,
  AMBER: '#A3703A',
};

type SlashCommandPanelProps = {
  parse: SlashParse;
  onPick: (command: SlashCommand) => void;
};

export function SlashCommandPanel({ parse, onPick }: SlashCommandPanelProps) {
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

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
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
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  rowDescription: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  argRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_ALT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  argCommand: {
    color: BLUE,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  argHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  confirmBadge: {
    color: AMBER,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
});
