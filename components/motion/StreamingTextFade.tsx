/**
 * StreamingTextFade - per-word fade cascade over the #5 word drain.
 *
 * Adapted from hermex StreamingTextFade.swift. Composes with useWordDrain:
 * the drain reveals text word by word, this fades each newly revealed word in
 * on a compressing stamp-chain. Only the last FADE_WINDOW words animate — the
 * rest are absorbed into a single solid Text node, so the live animated-node
 * count is capped no matter how long the reply is (the ticket's memory risk).
 */

import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useWordDrain } from '@/hooks/useWordDrain';
import {
  FADE_DURATION_MS,
  FADE_STAMP_SPACING_MS,
  advanceFadeStamps,
  fadeOpacity,
  isSettledWord,
} from '@/utils/streamingTextFade';

type StreamingTextFadeProps = {
  text: string;
  streaming: boolean;
  style?: StyleProp<TextStyle>;
  onReveal?: () => void;
};

/** Splits on whitespace but keeps the whitespace attached to each word. */
function splitWords(text: string): string[] {
  const matches = text.match(/\S+\s*/g);
  return matches ?? [];
}

export function StreamingTextFade({ text, streaming, style, onReveal }: StreamingTextFadeProps) {
  const reducedMotion = useReducedMotion();
  const revealed = useWordDrain(text, streaming, onReveal);

  // Reduced motion or settled (not streaming): render plain solid text, no
  // per-word nodes at all.
  if (reducedMotion || !streaming) {
    return <Text style={style}>{revealed}</Text>;
  }

  return <FadingWords text={revealed} style={style} />;
}

function FadingWords({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const words = splitWords(text);
  const stampsRef = useRef<Map<number, number>>(new Map());
  const [, forceTick] = useState(0);

  stampsRef.current = advanceFadeStamps(stampsRef.current, words.length, Date.now());

  // Tick a few times per fade so the tail's opacity animates, then rest.
  useEffect(() => {
    const interval = setInterval(() => forceTick((value) => value + 1), FADE_STAMP_SPACING_MS);
    const stop = setTimeout(() => clearInterval(interval), FADE_DURATION_MS * 2);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [text]);

  const now = Date.now();
  const settled: string[] = [];
  const fading: { key: number; word: string; opacity: number }[] = [];

  words.forEach((word, index) => {
    if (isSettledWord(index, words.length)) {
      settled.push(word);
      return;
    }
    fading.push({ key: index, word, opacity: fadeOpacity(stampsRef.current.get(index) ?? now, now) });
  });

  return (
    <Text style={style}>
      {settled.length > 0 ? <Text>{settled.join('')}</Text> : null}
      {fading.map(({ key, word, opacity }) => (
        <Text key={key} style={{ opacity }}>
          {word}
        </Text>
      ))}
    </Text>
  );
}
