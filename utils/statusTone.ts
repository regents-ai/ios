/**
 * Shared status -> tone (accent + wash) mapping.
 *
 * Single home for the tone/wash presentation mapping that was duplicated
 * across the message, agent, and tab screens. Keyed off the canonical enums in
 * types/regents.ts so a new enum member is handled in exactly one place.
 *
 * Presentation only — no money, signing, or data logic.
 */

import { COLORS } from '@/constants/Colors';
import type { MessageThreadStatus, RegentReturnStatus, RegentRuntimeStatus } from '@/types/regents';

const { BLUE, SUCCESS, DANGER, AMBER, BLUE_WASH, AMBER_WASH, GREEN_WASH, RED_WASH } = COLORS;

export type Tone = { accent: string; wash: string };
export type LabeledTone = Tone & { label: string };

/** Tone + label for a message thread's status pill. */
export function messageStatusTone(status: MessageThreadStatus): LabeledTone {
  switch (status) {
    case 'running':
      return { label: 'Working', accent: BLUE, wash: BLUE_WASH };
    case 'waiting':
      return { label: 'Approval', accent: AMBER, wash: AMBER_WASH };
    case 'failed':
      return { label: 'Needs help', accent: DANGER, wash: RED_WASH };
    case 'idle':
      return { label: 'Open', accent: SUCCESS, wash: GREEN_WASH };
    case 'unknown':
      return { label: 'Updating', accent: BLUE, wash: BLUE_WASH };
  }
}

/** Tone for an agent's runtime status. */
export function runtimeTone(runtimeStatus: RegentRuntimeStatus): Tone {
  switch (runtimeStatus) {
    case 'online':
      return { accent: SUCCESS, wash: GREEN_WASH };
    case 'waiting':
      return { accent: AMBER, wash: AMBER_WASH };
    case 'offline':
      return { accent: DANGER, wash: RED_WASH };
    case 'unknown':
      return { accent: BLUE, wash: BLUE_WASH };
  }
}

/** Tone for a return request's status. */
export function returnRequestTone(status: RegentReturnStatus): Tone {
  switch (status) {
    case 'requested':
    case 'approved':
    case 'broadcasting':
      return { accent: AMBER, wash: AMBER_WASH };
    case 'confirmed':
      return { accent: SUCCESS, wash: GREEN_WASH };
    case 'failed':
      return { accent: DANGER, wash: RED_WASH };
    case 'unknown':
      return { accent: BLUE, wash: BLUE_WASH };
  }
}
