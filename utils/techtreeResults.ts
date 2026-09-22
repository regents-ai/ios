/**
 * Techtree results feed.
 *
 * Reads the public results log on techtree.sh (newest first, keyset-paged by
 * `before_sequence`) and turns each entry into the card the Techtree tab shows.
 * Withdrawn entries stay on the log with `withdrawn_at` set; the app hides them.
 */

import { TECHTREE_URL } from '@/constants/TECHTREE_URL';

export const TECHTREE_RESULTS_PAGE_SIZE = 25;

export type TechtreeResultEntry = {
  skill_name: string;
  climb: string;
  campaign_name: string;
  accepted_at: string;
  entry_url: string;
  log_sequence: number;
  withdrawn_at: string | null;
  result: {
    wins: number;
    losses: number;
    ties: number;
    task_count: number;
    candidate_mean: number;
    baseline_mean: number;
    absolute_delta: number;
  };
  subject: {
    model: string;
    provider: string;
    harness: string;
  };
};

export type TechtreeResultsPage = {
  entries: TechtreeResultEntry[];
  next_before_sequence: number | null;
};

export type TechtreeResultCard = {
  id: string;
  skillName: string;
  climbName: string;
  model: string;
  record: string;
  scoreDelta: number;
  scoreChange: string;
  date: string;
  entryUrl: string;
  accessibilityLabel: string;
};

export function formatScoreChange(delta: number): string {
  const rounded = delta.toFixed(2);
  return delta > 0 ? `+${rounded}` : rounded;
}

export function toTechtreeResultCards(page: TechtreeResultsPage): TechtreeResultCard[] {
  return page.entries
    .filter((entry) => entry.withdrawn_at === null)
    .map((entry) => {
      const record = `${entry.result.wins} wins · ${entry.result.ties} ties · ${entry.result.losses} losses`;
      const scoreChange = formatScoreChange(entry.result.absolute_delta);
      const date = new Date(entry.accepted_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      return {
        id: String(entry.log_sequence),
        skillName: entry.skill_name,
        climbName: entry.campaign_name,
        model: entry.subject.model,
        record,
        scoreDelta: entry.result.absolute_delta,
        scoreChange,
        date,
        entryUrl: entry.entry_url,
        accessibilityLabel: `${entry.skill_name} on ${entry.campaign_name}, ${scoreChange} vs. starting point, ${record}, ${entry.subject.model}, ${date}`,
      };
    });
}

export async function fetchTechtreeResults(beforeSequence?: number): Promise<{
  cards: TechtreeResultCard[];
  nextBeforeSequence: number | null;
}> {
  const params = new URLSearchParams({ limit: String(TECHTREE_RESULTS_PAGE_SIZE) });
  if (beforeSequence !== undefined) {
    params.set('before_sequence', String(beforeSequence));
  }

  const response = await fetch(`${TECHTREE_URL}/api/v1/publications?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Techtree is not answering right now (status ${response.status}).`);
  }

  const page = (await response.json()) as TechtreeResultsPage;

  return {
    cards: toTechtreeResultCards(page),
    nextBeforeSequence: page.next_before_sequence,
  };
}
