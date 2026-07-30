// Word-cadence reveal hook over utils/streamingWordDrain.
// Ported near-verbatim from hermex StreamingWordDrain.swift +
// ChatViewModel.swift (word-cadence drain with lag-bounded catch-up).

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useLegacyMotionTuning } from '@/hooks/useLegacyMotionTuning';
import { drainQuota, splitAtUnitBoundary, unitCount } from '@/utils/streamingWordDrain';

/**
 * Paces `text` word by word at the drain cadence while `enabled` is true.
 * State updates are batched to one setState per tick. Reduced motion (or
 * `enabled: false`) shows the full text immediately. `onReveal` fires after
 * each tick that revealed new words, so callers can keep the view pinned.
 */
export function useWordDrain(text: string, enabled: boolean, onReveal?: () => void): string {
  const reducedMotion = useReducedMotion();
  const animate = enabled && !reducedMotion;
  const { wordDrainCadenceMs, wordDrainMaxLagMs } = useLegacyMotionTuning();

  const revealedUnitsRef = useRef(0);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  const [visibleText, setVisibleText] = useState(() => (animate ? '' : text));

  useEffect(() => {
    if (!animate) {
      revealedUnitsRef.current = unitCount(text);
      setVisibleText(text);
      return;
    }

    const totalUnits = unitCount(text);
    if (revealedUnitsRef.current >= totalUnits) {
      // Fully drained: adopt the exact source text (trailing whitespace too).
      setVisibleText(text);
      return;
    }

    const timer = setInterval(() => {
      const backlog = totalUnits - revealedUnitsRef.current;
      revealedUnitsRef.current += drainQuota(backlog, wordDrainCadenceMs, wordDrainMaxLagMs);
      const done = revealedUnitsRef.current >= totalUnits;
      setVisibleText(done ? text : splitAtUnitBoundary(text, revealedUnitsRef.current).head);
      onRevealRef.current?.();
      if (done) {
        clearInterval(timer);
      }
    }, wordDrainCadenceMs);

    return () => clearInterval(timer);
  }, [animate, text, wordDrainCadenceMs, wordDrainMaxLagMs]);

  return visibleText;
}
