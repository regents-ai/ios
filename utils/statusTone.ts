/**
 * Shared status -> tone (accent + wash) mapping.
 *
 * Single home for the tone/wash presentation mapping that was duplicated
 * across the message, agent, and tab screens. Keyed off the canonical enums in
 * types/regents.ts so a new enum member is handled in exactly one place.
 *
 * Themed: each function takes the active theme's colors so tones resolve to
 * semantic status tokens in both light and dark (hard cutover off the old
 * static COLORS washes). Presentation only — no money, signing, or data logic.
 */

import type { ThemeColors } from '@/theme/tokens';
import type { MessageThreadStatus, RegentReturnStatus, RegentRuntimeStatus } from '@/types/regents';

export type Tone = { accent: string; wash: string };
export type LabeledTone = Tone & { label: string };

// Status -> semantic token pairs, resolved from the active theme.
const infoTone = (c: ThemeColors): Tone => ({ accent: c.info, wash: c.accentWash });
const warnTone = (c: ThemeColors): Tone => ({ accent: c.warning, wash: c.warningWash });
const errorTone = (c: ThemeColors): Tone => ({ accent: c.error, wash: c.errorWash });
const successTone = (c: ThemeColors): Tone => ({ accent: c.success, wash: c.successWash });

/** Tone + label for a message thread's status pill. */
export function messageStatusTone(status: MessageThreadStatus, colors: ThemeColors): LabeledTone {
  switch (status) {
    case 'running':
      return { label: 'Working', ...infoTone(colors) };
    case 'waiting':
      return { label: 'Approval', ...warnTone(colors) };
    case 'failed':
      return { label: 'Needs help', ...errorTone(colors) };
    case 'idle':
      return { label: 'Open', ...successTone(colors) };
    case 'unknown':
      return { label: 'Updating', ...infoTone(colors) };
  }
}

/** Tone for an agent's runtime status. */
export function runtimeTone(runtimeStatus: RegentRuntimeStatus, colors: ThemeColors): Tone {
  switch (runtimeStatus) {
    case 'online':
      return successTone(colors);
    case 'waiting':
      return warnTone(colors);
    case 'offline':
      return errorTone(colors);
    case 'unknown':
      return infoTone(colors);
  }
}

/** Tone for a return request's status. */
export function returnRequestTone(status: RegentReturnStatus, colors: ThemeColors): Tone {
  switch (status) {
    case 'requested':
    case 'approved':
    case 'broadcasting':
      return warnTone(colors);
    case 'confirmed':
      return successTone(colors);
    case 'failed':
      return errorTone(colors);
    case 'unknown':
      return infoTone(colors);
  }
}
