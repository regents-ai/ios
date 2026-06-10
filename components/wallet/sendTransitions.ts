/**
 * Shared motion constants and transition builders for the send screen and
 * its confirmation modal.
 */

export const SEND_SCREEN_OFFSET = 12;
export const SEND_CARD_OFFSET = 8;
export const SEND_STAGGER_STEP = 50;

export function buildTimingTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

export function buildSpringTransition(reduceMotion: boolean, delay = 0) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'spring' as const, damping: 18, stiffness: 190, mass: 1, delay };
}
