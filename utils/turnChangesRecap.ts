/**
 * Turn-end changes recap.
 *
 * Inspired by hermex GitTurnChangesCard.swift: after an agent turn, summarize
 * what actually changed — the approved actions with money movement (swaps,
 * transfers, stakes) — as a collapsible list with a drill-in row each. This
 * is a read-only receipt derived from thread events; it never initiates or
 * confirms anything.
 *
 * A "turn" is the run of events after the most recent user message. Pure
 * logic, no React, so the summary is unit-testable.
 */

import type { MessageThreadEvent } from '@/types/regents';

export type TurnChangeRow = {
  eventId: string;
  /** Short humanized action label, e.g. "Transfer", "Swap". */
  action: string;
  /** Amount line when the change moved money, else null. */
  amountLabel: string | null;
  /** The full event, for drill-in. */
  event: MessageThreadEvent;
};

function humanizeAction(action: string): string {
  const plain = action.replace(/[_.-]+/g, ' ').trim();
  return plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : 'Action';
}

function amountLabel(event: MessageThreadEvent): string | null {
  if (!event.amount || !event.currency) {
    return null;
  }
  const base = `${event.amount} ${event.currency}`;
  return event.amountUsd ? `${base} · $${event.amountUsd}` : base;
}

/** Events belonging to the latest turn: everything after the last user message. */
function latestTurnEvents(events: MessageThreadEvent[]): MessageThreadEvent[] {
  let start = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].role === 'user') {
      start = index + 1;
      break;
    }
  }
  return events.slice(start);
}

/**
 * The approved, money-moving changes from the latest turn. Denied and
 * timed-out actions are excluded — nothing changed for those.
 */
export function summarizeTurnChanges(events: MessageThreadEvent[]): TurnChangeRow[] {
  return latestTurnEvents(events)
    .filter((event) => event.type === 'tool.resolved' && event.result === 'approved' && !!event.action)
    .map((event) => ({
      eventId: event.eventId,
      action: humanizeAction(event.action as string),
      amountLabel: amountLabel(event),
      event,
    }));
}

/** One-line collapsed summary, e.g. "3 changes this turn". */
export function turnChangesSummary(rows: TurnChangeRow[]): string | null {
  if (rows.length === 0) {
    return null;
  }
  return rows.length === 1 ? '1 change this turn' : `${rows.length} changes this turn`;
}
