/**
 * MotionLab - debug-only screen with live-tunable motion knobs.
 *
 * Adapted from hermex StreamingLabView.swift: steppers tune the real motion
 * pipeline (word drain, toast entry) against a canned replay, so cadence can
 * be felt, not guessed. Only reachable in debug builds via /motion-lab; the
 * shipped app reads frozen constants (see utils/legacyMotionConstants).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressToast } from '@/components/ui/ProgressToast';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useWordDrain } from '@/hooks/useWordDrain';
import {
  MOTION_KNOB_BOUNDS,
  getMotionKnobs,
  resetMotionKnobs,
  setMotionKnob,
  subscribeMotionKnobs,
  type MotionKnobs,
} from '@/utils/motionKnobs';
import {
  dismissToast,
  resolveToastSuccess,
  showProgressToast,
  type ProgressToastState,
} from '@/utils/progressToast';
import { getDialBloomEasingLabel } from '@/utils/dialTuning';

const CANNED_REPLY =
  'Here is a canned agent reply for tuning. It has enough words to feel the ' +
  'cadence, a burst of short ones, and then a longer stretch so the ' +
  'lag-bounded catch-up can kick in when the backlog grows past the budget.';

const GENERAL_KNOB_LABELS = {
  wordDrainCadenceMs: 'Word cadence (ms/tick)',
  wordDrainMaxLagMs: 'Drain lag bound (ms)',
  toastEntryMs: 'Toast entry (ms)',
} as const satisfies Partial<Record<keyof MotionKnobs, string>>;

const DIAL_KNOB_LABELS = {
  dialDeadZoneRadius: 'Dead-zone radius',
  dialFirstRingRadius: 'First ring radius',
  dialSecondRingRadius: 'Second ring radius',
  dialBloomDurationMs: 'Bloom duration (ms)',
  dialBloomEasing: 'Bloom easing',
  dialDragHysteresis: 'Drag hysteresis',
  dialScrimOpacity: 'Scrim opacity',
  dialFloatAmplitude: 'Float amplitude',
  dialFloatPeriodMs: 'Float period (ms)',
} as const satisfies Partial<Record<keyof MotionKnobs, string>>;

type GeneralKnob = keyof typeof GENERAL_KNOB_LABELS;
type DialKnob = keyof typeof DIAL_KNOB_LABELS;

function formatKnobValue(knob: keyof MotionKnobs, value: number) {
  if (knob === 'dialBloomEasing') {
    return getDialBloomEasingLabel(value);
  }
  if (knob === 'dialScrimOpacity') {
    return value.toFixed(2);
  }
  return String(value);
}

function KnobRow({
  knob,
  label,
  value,
}: {
  knob: keyof MotionKnobs;
  label: string;
  value: number;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const bounds = MOTION_KNOB_BOUNDS[knob];
  return (
    <View style={styles.knobRow}>
      <View style={styles.knobCopy}>
        <Text style={styles.knobLabel}>{label}</Text>
        <Text style={styles.knobValue}>{formatKnobValue(knob, value)}</Text>
      </View>
      <View style={styles.knobControls}>
        <RegentPressable
          pressStyle="icon"
          style={styles.stepButton}
          onPress={() => setMotionKnob(knob, value - bounds.step)}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </RegentPressable>
        <RegentPressable
          pressStyle="icon"
          style={styles.stepButton}
          onPress={() => setMotionKnob(knob, value + bounds.step)}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </RegentPressable>
      </View>
    </View>
  );
}

function CannedReplay({ replayKey }: { replayKey: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const revealed = useWordDrain(CANNED_REPLY, true);
  return (
    <Text key={replayKey} style={styles.replayText}>
      {revealed}
    </Text>
  );
}

export default function MotionLab() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const knobs = useSyncExternalStore(subscribeMotionKnobs, getMotionKnobs, getMotionKnobs);
  const [replayKey, setReplayKey] = useState(0);
  const [toast, setToast] = useState<ProgressToastState | null>(null);

  const restartReplay = useCallback(() => setReplayKey((current) => current + 1), []);

  const runToastDemo = useCallback(() => {
    setToast(showProgressToast('Doing lab work...'));
    setTimeout(() => {
      setToast((current) => resolveToastSuccess(current, 'Lab work done', Date.now()));
    }, 1500);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Motion Lab</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Knobs</Text>
          <Text style={styles.sectionHint}>Debug builds only. Release ships frozen defaults.</Text>
          {(Object.keys(GENERAL_KNOB_LABELS) as GeneralKnob[]).map((knob) => (
            <KnobRow
              key={knob}
              knob={knob}
              label={GENERAL_KNOB_LABELS[knob]}
              value={knobs[knob]}
            />
          ))}
          <RegentPressable style={styles.resetButton} onPress={resetMotionKnobs}>
            <Text style={styles.resetButtonText}>Reset to defaults</Text>
          </RegentPressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dial</Text>
          <Text style={styles.sectionHint}>
            Tune the shipping dial geometry, bloom, drag feel, scrim, and idle float.
          </Text>
          {(Object.keys(DIAL_KNOB_LABELS) as DialKnob[]).map((knob) => (
            <KnobRow
              key={knob}
              knob={knob}
              label={DIAL_KNOB_LABELS[knob]}
              value={knobs[knob]}
            />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Canned replay</Text>
          <Text style={styles.sectionHint}>The real word-drain pipeline replaying a fixed reply.</Text>
          <View style={styles.replayBox}>
            <CannedReplay key={replayKey} replayKey={replayKey} />
          </View>
          <RegentPressable style={styles.resetButton} onPress={restartReplay}>
            <Text style={styles.resetButtonText}>Replay</Text>
          </RegentPressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Toast</Text>
          <Text style={styles.sectionHint}>Progress morphs into success after 1.5s.</Text>
          <RegentPressable style={styles.resetButton} onPress={runToastDemo}>
            <Text style={styles.resetButtonText}>Run toast demo</Text>
          </RegentPressable>
        </View>
      </ScrollView>

      <ProgressToast toast={toast} onDismiss={() => setToast(dismissToast())} />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.title,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.title,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.ui,
  },
  knobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  knobCopy: {
    flex: 1,
    gap: 2,
  },
  knobLabel: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  knobValue: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.ui,
  },
  knobControls: {
    flexDirection: 'row',
    gap: 8,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resetButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: fonts.ui,
  },
  replayBox: {
    minHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  replayText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  });
}
