import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DialCenterGlyph } from '@/components/dial/DialCenterGlyph';
import {
  getDialPetalPosition,
  hitTestDialPetals,
  resolveDialViewportGeometry,
} from '@/components/dial/hitTesting';
import type { DialPetal, DialPetalAction } from '@/components/dial/petalRegistry';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { runRegentEventHaptic } from '@/components/ui/haptics';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  DIAL_CENTER_SIZE,
  DIAL_TUNING_DEFAULTS,
  type DialTuning,
} from '@/utils/dialConstants';
import {
  getDialBloomEasing,
  getDialPetalSize,
  shouldChangeDialHighlight,
  shouldRunDialSelectionHaptic,
} from '@/utils/dialTuning';

const CENTER_SIZE = DIAL_CENTER_SIZE;
const CENTER_RADIUS = CENTER_SIZE / 2;

declare const __DEV__: boolean | undefined;

type HighlightedPetal = {
  ring: 'first' | 'second';
  index: number;
};

type RadialDialProps = {
  petals: readonly DialPetal[];
  bottomOffset: number;
  rightOffset: number;
  onAction: (action: DialPetalAction) => void;
  onExpand?: () => void;
};

type AnimatedPetalProps = {
  angleStep: number;
  centerCoordinate: number;
  expanded: boolean;
  highlighted: boolean;
  index: number;
  petal: DialPetal;
  petalCount: number;
  petalSize: number;
  progress: SharedValue<number>;
  floatProgress: SharedValue<number>;
  floatAmplitude: number;
  radius: number;
  reducedMotionEnabled: boolean;
  submenuExpanded: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPress: (petal: DialPetal, ring: 'first' | 'second', index: number) => void;
  ring: 'first' | 'second';
  colors: Theme['colors'];
};

function sameHighlight(a: HighlightedPetal | null, b: HighlightedPetal | null) {
  return a?.ring === b?.ring && a?.index === b?.index;
}

function AnimatedPetal({
  angleStep,
  centerCoordinate,
  colors,
  expanded,
  highlighted,
  index,
  onPress,
  petal,
  petalCount,
  petalSize,
  progress,
  floatProgress,
  floatAmplitude,
  radius,
  reducedMotionEnabled,
  ring,
  submenuExpanded,
  styles,
}: AnimatedPetalProps) {
  const position = useMemo(
    () => getDialPetalPosition(index, petalCount, radius, angleStep),
    [angleStep, index, petalCount, radius]
  );
  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotionEnabled) {
      return { opacity: progress.value };
    }

    const phase = petalCount <= 1 ? 0 : index / petalCount;
    const floatOffset =
      Math.sin((floatProgress.value + phase) * Math.PI * 2) *
      floatAmplitude *
      progress.value;
    return {
      opacity: progress.value,
      transform: [
        { translateX: position.x * (progress.value - 1) },
        { translateY: position.y * (progress.value - 1) + floatOffset },
        { scale: 0.78 + progress.value * 0.22 },
      ],
    };
  }, [
    floatAmplitude,
    index,
    petalCount,
    position.x,
    position.y,
    reducedMotionEnabled,
  ]);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={[
        styles.petalPosition,
        {
          left: centerCoordinate - petalSize / 2 + position.x,
          top: centerCoordinate - petalSize / 2 + position.y,
        },
        animatedStyle,
      ]}
      testID={`dial-petal-position-${ring}-${petal.id}`}
    >
      <Pressable
        accessibilityLabel={petal.label}
        accessibilityRole="button"
        accessibilityState={{
          expanded: petal.submenu?.length ? submenuExpanded : undefined,
          selected: highlighted,
        }}
        onPress={() => onPress(petal, ring, index)}
        style={({ pressed }) => [
          styles.petal,
          highlighted && styles.petalHighlighted,
          pressed &&
            (reducedMotionEnabled ? styles.petalPressedReduced : styles.petalPressed),
        ]}
      >
        <Ionicons
          name={petal.icon}
          size={20}
          color={highlighted ? colors.onAccent : colors.accent}
        />
        <Text
          numberOfLines={2}
          style={[styles.petalLabel, highlighted && styles.petalLabelHighlighted]}
        >
          {petal.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

function DevTunableRadialDial(props: RadialDialProps) {
  // The mutable store is required only inside the development component so
  // release evaluation and rendering never construct or subscribe to it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require('@/utils/motionKnobs') as typeof import('@/utils/motionKnobs');
  const knobs = useSyncExternalStore(
    store.subscribeMotionKnobs,
    store.getMotionKnobs,
    store.getMotionKnobs
  );
  const tuning: DialTuning = {
    deadZoneRadius: knobs.dialDeadZoneRadius,
    firstRingRadius: knobs.dialFirstRingRadius,
    secondRingRadius: knobs.dialSecondRingRadius,
    bloomDurationMs: knobs.dialBloomDurationMs,
    bloomEasing: knobs.dialBloomEasing,
    dragHysteresis: knobs.dialDragHysteresis,
    scrimOpacity: knobs.dialScrimOpacity,
    floatAmplitude: knobs.dialFloatAmplitude,
    floatPeriodMs: knobs.dialFloatPeriodMs,
  };

  return <RadialDialSurface {...props} tuning={tuning} />;
}

export function RadialDial(props: RadialDialProps) {
  return isDevBuild() ? (
    <DevTunableRadialDial {...props} />
  ) : (
    <RadialDialSurface {...props} tuning={DIAL_TUNING_DEFAULTS} />
  );
}

function RadialDialSurface({
  bottomOffset,
  onAction,
  onExpand,
  petals,
  rightOffset,
  tuning,
}: RadialDialProps & { tuning: Readonly<DialTuning> }) {
  const theme = useTheme();
  const { colors, motion } = theme;
  const { fontScale, height, width } = useWindowDimensions();
  const reducedMotionEnabled = useReducedMotion();
  const progress = useSharedValue(0);
  const submenuProgress = useSharedValue(0);
  const floatProgress = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<HighlightedPetal | null>(null);
  const expandedRef = useRef(false);
  const highlightedRef = useRef<HighlightedPetal | null>(null);
  const lastSelectionHapticAtRef = useRef<number | null>(null);
  const pressStartedExpandedRef = useRef<boolean | null>(null);

  const activeSubmenu =
    activeSubmenuIndex === null ? undefined : petals[activeSubmenuIndex]?.submenu;
  const geometry = useMemo(
    () =>
      resolveDialViewportGeometry({
        bottomOffset,
        desiredPetalSize: getDialPetalSize(fontScale),
        firstPetalCount: petals.length,
        firstRingRadius: tuning.firstRingRadius,
        floatAmplitude: reducedMotionEnabled ? 0 : tuning.floatAmplitude,
        rightOffset,
        secondPetalCount: activeSubmenu?.length ?? 1,
        secondRingRadius: tuning.secondRingRadius,
        viewportHeight: height,
        viewportWidth: width,
      }),
    [
      activeSubmenu?.length,
      bottomOffset,
      fontScale,
      height,
      petals.length,
      reducedMotionEnabled,
      rightOffset,
      tuning.floatAmplitude,
      tuning.firstRingRadius,
      tuning.secondRingRadius,
      width,
    ]
  );
  const { canvasSize, centerCoordinate, layouts, petalSize } = geometry;
  const styles = useMemo(() => makeStyles(theme, petalSize), [petalSize, theme]);
  const bloomEasing = getDialBloomEasing(tuning.bloomEasing);
  const scrimAnimatedStyle = useAnimatedStyle(
    () => ({ opacity: progress.value * tuning.scrimOpacity }),
    [tuning.scrimOpacity]
  );

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: reducedMotionEnabled ? motion.durationFast : tuning.bloomDurationMs,
      easing: Easing.bezier(...bloomEasing),
    });
  }, [
    bloomEasing,
    expanded,
    motion.durationFast,
    tuning.bloomDurationMs,
    progress,
    reducedMotionEnabled,
  ]);

  useEffect(() => {
    if (expanded && activeSubmenu?.length) {
      submenuProgress.value = 0;
      submenuProgress.value = withTiming(1, {
        duration: reducedMotionEnabled ? motion.durationFast : tuning.bloomDurationMs,
        easing: Easing.bezier(...bloomEasing),
      });
      return;
    }

    submenuProgress.value = withTiming(0, {
      duration: reducedMotionEnabled ? motion.durationFast : tuning.bloomDurationMs,
      easing: Easing.bezier(...bloomEasing),
    });
  }, [
    activeSubmenu,
    bloomEasing,
    expanded,
    motion.durationFast,
    tuning.bloomDurationMs,
    reducedMotionEnabled,
    submenuProgress,
  ]);

  useEffect(() => {
    cancelAnimation(floatProgress);
    floatProgress.value = 0;
    if (reducedMotionEnabled || tuning.floatAmplitude === 0) {
      return;
    }

    floatProgress.value = withRepeat(
      withTiming(1, {
        duration: tuning.floatPeriodMs,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    return () => cancelAnimation(floatProgress);
  }, [
    floatProgress,
    tuning.floatAmplitude,
    tuning.floatPeriodMs,
    reducedMotionEnabled,
  ]);

  const setExpandedState = useCallback((next: boolean) => {
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  const setHighlightedState = useCallback((next: HighlightedPetal | null) => {
    if (sameHighlight(highlightedRef.current, next)) {
      return;
    }

    highlightedRef.current = next;
    setHighlighted(next);
    if (!next) {
      return;
    }

    const now = Date.now();
    if (shouldRunDialSelectionHaptic(lastSelectionHapticAtRef.current, now)) {
      lastSelectionHapticAtRef.current = now;
      runRegentEventHaptic('dialSelectionChanged');
    }
  }, []);

  const expand = useCallback(() => {
    if (!expandedRef.current) {
      onExpand?.();
      setActiveSubmenuIndex(null);
      setHighlightedState(null);
      setExpandedState(true);
    }
  }, [onExpand, setExpandedState, setHighlightedState]);

  const collapse = useCallback(() => {
    setHighlightedState(null);
    setExpandedState(false);
  }, [setExpandedState, setHighlightedState]);

  const commitPetal = useCallback(
    (petal: DialPetal, ring: 'first' | 'second', index: number) => {
      if (petal.submenu?.length) {
        if (ring === 'first') {
          setActiveSubmenuIndex(index);
          setHighlightedState(null);
        }
        return;
      }

      runRegentEventHaptic('dialCommitted');
      collapse();
      onAction(petal.action);
    },
    [collapse, onAction, setHighlightedState]
  );

  const hitTestPosition = useCallback(
    (x: number, y: number): HighlightedPetal | null => {
      if (activeSubmenu?.length) {
        const submenuHit = hitTestDialPetals(
          x,
          y,
          activeSubmenu.length,
          layouts.second,
          tuning.deadZoneRadius
        );
        if (submenuHit.petalIndex !== null) {
          return { ring: 'second', index: submenuHit.petalIndex };
        }
      }

      const firstRingHit = hitTestDialPetals(
        x,
        y,
        petals.length,
        layouts.first,
        tuning.deadZoneRadius
      );
      return firstRingHit.petalIndex === null
        ? null
        : { ring: 'first', index: firstRingHit.petalIndex };
    },
    [activeSubmenu, layouts, petals.length, tuning.deadZoneRadius]
  );

  const getHighlightCenter = useCallback(
    (value: HighlightedPetal) => {
      const isSecondRing = value.ring === 'second';
      const count = isSecondRing ? activeSubmenu?.length ?? 0 : petals.length;
      if (count <= value.index) {
        return null;
      }
      return getDialPetalPosition(
        value.index,
        count,
        isSecondRing ? layouts.second.radius : layouts.first.radius,
        isSecondRing ? layouts.second.angleStep : layouts.first.angleStep
      );
    },
    [activeSubmenu?.length, layouts, petals.length]
  );

  const handleTouchBegin = useCallback(() => {
    pressStartedExpandedRef.current = expandedRef.current;
    lastSelectionHapticAtRef.current = null;
    expand();
  }, [expand]);

  const handleDragPosition = useCallback(
    (x: number, y: number) => {
      const candidate = hitTestPosition(x, y);
      const current = highlightedRef.current;
      if (current && candidate && !sameHighlight(current, candidate)) {
        const currentCenter = getHighlightCenter(current);
        const candidateCenter = getHighlightCenter(candidate);
        if (
          currentCenter &&
          candidateCenter &&
          !shouldChangeDialHighlight(
            currentCenter,
            candidateCenter,
            { x, y },
            tuning.dragHysteresis
          )
        ) {
          return;
        }
      }
      setHighlightedState(candidate);
    },
    [getHighlightCenter, hitTestPosition, setHighlightedState, tuning.dragHysteresis]
  );

  const handleDragRelease = useCallback(
    (x: number, y: number) => {
      pressStartedExpandedRef.current = null;
      const rawHit = hitTestPosition(x, y);
      const visibleHit = highlightedRef.current;
      setHighlightedState(null);

      if (!rawHit) {
        runRegentEventHaptic('dialCancelled');
        collapse();
        return;
      }

      const hit = visibleHit ?? rawHit;
      const selected =
        hit.ring === 'second' ? activeSubmenu?.[hit.index] : petals[hit.index];
      if (!selected) {
        runRegentEventHaptic('dialCancelled');
        collapse();
        return;
      }

      commitPetal(selected, hit.ring, hit.index);
    },
    [activeSubmenu, collapse, commitPetal, hitTestPosition, petals, setHighlightedState]
  );

  const handleGestureCancel = useCallback(() => {
    pressStartedExpandedRef.current = null;
    setHighlightedState(null);
    runRegentEventHaptic('dialCancelled');
    collapse();
  }, [collapse, setHighlightedState]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onBegin(() => {
          runOnJS(handleTouchBegin)();
        })
        .onUpdate((event) => {
          runOnJS(handleDragPosition)(event.x - CENTER_RADIUS, event.y - CENTER_RADIUS);
        })
        .onEnd((event, success) => {
          if (success) {
            runOnJS(handleDragRelease)(event.x - CENTER_RADIUS, event.y - CENTER_RADIUS);
          }
        })
        .onFinalize((event, success) => {
          if (!success && event.state === State.CANCELLED) {
            runOnJS(handleGestureCancel)();
          }
        }),
    [handleDragPosition, handleDragRelease, handleGestureCancel, handleTouchBegin]
  );

  const handleCenterPress = useCallback(() => {
    const startedExpanded = pressStartedExpandedRef.current;
    pressStartedExpandedRef.current = null;

    if (startedExpanded === false) {
      expand();
      return;
    }

    if (startedExpanded === true || expandedRef.current) {
      collapse();
      return;
    }

    expand();
  }, [collapse, expand]);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[styles.scrim, scrimAnimatedStyle]}
      >
        <Pressable
          accessible={false}
          onPress={collapse}
          style={StyleSheet.absoluteFill}
          testID="dial-scrim"
        />
      </Animated.View>

      <View
        pointerEvents="box-none"
        style={[
          styles.canvas,
          {
            bottom: bottomOffset,
            height: canvasSize,
            right: rightOffset,
            width: canvasSize,
          },
        ]}
        testID="radial-dial"
      >
        {petals.map((petal, index) => (
          <AnimatedPetal
            angleStep={layouts.first.angleStep}
            centerCoordinate={centerCoordinate}
            colors={colors}
            expanded={expanded}
            highlighted={highlighted?.ring === 'first' && highlighted.index === index}
            index={index}
            key={petal.id}
            onPress={commitPetal}
            petal={petal}
            petalCount={petals.length}
            petalSize={petalSize}
            progress={progress}
            floatProgress={floatProgress}
            floatAmplitude={tuning.floatAmplitude}
            radius={layouts.first.radius}
            reducedMotionEnabled={reducedMotionEnabled}
            ring="first"
            submenuExpanded={activeSubmenuIndex === index}
            styles={styles}
          />
        ))}

        {activeSubmenu?.map((petal, index) => (
          <AnimatedPetal
            angleStep={layouts.second.angleStep}
            centerCoordinate={centerCoordinate}
            colors={colors}
            expanded={expanded}
            highlighted={highlighted?.ring === 'second' && highlighted.index === index}
            index={index}
            key={`${petals[activeSubmenuIndex ?? 0]?.id ?? 'submenu'}-${petal.id}`}
            onPress={commitPetal}
            petal={petal}
            petalCount={activeSubmenu.length}
            petalSize={petalSize}
            progress={submenuProgress}
            floatProgress={floatProgress}
            floatAmplitude={tuning.floatAmplitude}
            radius={layouts.second.radius}
            reducedMotionEnabled={reducedMotionEnabled}
            ring="second"
            submenuExpanded={false}
            styles={styles}
          />
        ))}

        <View
          style={[
            styles.centerPosition,
            {
              left: centerCoordinate - CENTER_RADIUS,
              top: centerCoordinate - CENTER_RADIUS,
            },
          ]}
          testID="dial-center-position"
        >
          <GestureDetector gesture={panGesture}>
            <Pressable
              accessibilityLabel={expanded ? 'Close radial dial' : 'Open radial dial'}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={handleCenterPress}
              style={({ pressed }) => [
                styles.center,
                pressed &&
                  (reducedMotionEnabled
                    ? styles.centerPressedReduced
                    : styles.centerPressed),
              ]}
            >
              <DialCenterGlyph color={colors.onAccent} expanded={expanded} />
            </Pressable>
          </GestureDetector>
        </View>
      </View>
    </View>
  );
}

function makeStyles({ colors, fonts, motion, type }: Theme, petalSize: number) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.accentWash,
    },
    canvas: {
      position: 'absolute',
    },
    centerPosition: {
      position: 'absolute',
      width: CENTER_SIZE,
      height: CENTER_SIZE,
    },
    center: {
      width: CENTER_SIZE,
      height: CENTER_SIZE,
      borderRadius: CENTER_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 8,
    },
    centerPressed: {
      transform: [{ scale: motion.activeScale }],
    },
    centerPressedReduced: {
      opacity: 0.9,
    },
    petalPosition: {
      position: 'absolute',
      width: petalSize,
      height: petalSize,
    },
    petal: {
      width: petalSize,
      height: petalSize,
      borderRadius: petalSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 5,
    },
    petalHighlighted: {
      backgroundColor: colors.accent,
    },
    petalPressed: {
      transform: [{ scale: motion.activeScale }],
    },
    petalPressedReduced: {
      opacity: 0.9,
    },
    petalLabel: {
      color: colors.text,
      fontFamily: fonts.ui,
      fontSize: type.caption.size - 2,
      lineHeight: type.caption.line - 2,
      maxWidth: petalSize - 16,
      textAlign: 'center',
    },
    petalLabelHighlighted: {
      color: colors.onAccent,
    },
  });
}
