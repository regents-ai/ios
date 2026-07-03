/**
 * Slash-command autocomplete with sub-argument mode.
 *
 * Adapted from hermex SlashCommandAutocompleteView.swift: typing `/` in the
 * composer raises a panel of commands; typing past the command name filters
 * its sub-arguments inline. Pure catalog + matcher, no execution here.
 *
 * SAFETY: money commands are marked `confirms: true`. The catalog only routes
 * such commands into the app's existing confirm flow — a slash command never
 * direct-executes a transfer/stake. Rendering/parsing only; the composer wires
 * the confirm navigation.
 */

export type SlashCommand = {
  name: string;
  /** One-line description shown in the panel. */
  description: string;
  /** Optional named sub-argument the command takes after its name. */
  argument?: { name: string; options?: string[] };
  /** True for money-moving commands that must route to the confirm flow. */
  confirms: boolean;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: 'send',
    description: 'Send USDC — opens the transfer confirm screen',
    argument: { name: 'amount' },
    confirms: true,
  },
  {
    name: 'stake',
    description: 'Stake REGENT — opens the staking confirm screen',
    argument: { name: 'amount' },
    confirms: true,
  },
  {
    name: 'balance',
    description: 'Show the current working balance',
    confirms: false,
  },
];

export type SlashParse =
  | { mode: 'none' }
  | { mode: 'command'; query: string }
  | { mode: 'argument'; command: SlashCommand; argument: string };

/**
 * Parses the composer draft into an autocomplete mode. A leading `/` with no
 * space is command mode (filter the catalog); once a known command name is
 * followed by a space, it is sub-argument mode for that command.
 */
export function parseSlashInput(draft: string): SlashParse {
  if (!draft.startsWith('/')) {
    return { mode: 'none' };
  }

  const body = draft.slice(1);
  const spaceIndex = body.indexOf(' ');

  if (spaceIndex === -1) {
    return { mode: 'command', query: body };
  }

  const name = body.slice(0, spaceIndex);
  const command = SLASH_COMMANDS.find((entry) => entry.name === name);
  if (!command) {
    return { mode: 'command', query: body };
  }

  return { mode: 'argument', command, argument: body.slice(spaceIndex + 1) };
}

/** Commands whose name starts with the query (case-insensitive). */
export function filterCommands(query: string): SlashCommand[] {
  const lower = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(lower));
}

/** Sub-argument options that start with the partial argument, if any. */
export function filterArgumentOptions(command: SlashCommand, argument: string): string[] {
  if (!command.argument?.options) {
    return [];
  }
  const lower = argument.toLowerCase();
  return command.argument.options.filter((option) => option.toLowerCase().startsWith(lower));
}

/**
 * Whether the parsed input is a money command that must NOT run inline — the
 * composer must route it into the confirm flow instead of sending text.
 */
export function requiresConfirmRouting(parse: SlashParse): boolean {
  return parse.mode === 'argument' && parse.command.confirms;
}
