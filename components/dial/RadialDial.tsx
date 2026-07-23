import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DialCenterGlyph } from '@/components/dial/DialCenterGlyph';
import {
  DIAL_FIRST_RING_RADIUS,
  DIAL_SECOND_RING_RADIUS,
  FIRST_DIAL_RING,
  SECOND_DIAL_RING,
  getDialPetalPosition,
  hitTestDialPetals,
} from '@/components/dial/hitTesting';
import type { DialPetal, DialPetalAction } from '@/components/dial/petalRegistry';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { runRegentEventHaptic } from '@/components/ui/haptics';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

const CENTER_SIZE = 64;
const CENTER_RADIUS = CENTER_SIZE / 2;
const PETAL_SIZE = 64;
const PETAL_RADIUS = PETAL_SIZE / 2;
const DIAL_CANVAS_SIZE = 252;
const DIAL_CENTER_COORDINATE = DIAL_CANVAS_SIZE - CENTER_RADIUS;

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
  expanded: boolean;
  highlighted: boolean;
  index: number;
  petal: DialPetal;
  petalCount: number;
  progress: SharedValue<number>;
  radius: number;
  reducedMotionEnabled: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPress: (petal: DialPetal, ring: 'first' | 'second', index: number) => void;
  ring: 'first' | 'second';
  colors: Theme['colors'];
};

function sameHighlight(a: HighlightedPetal | null, b: HighlightedPetal | null) {
  return a?.ring === b?.ring && a?.index === b?.index;
}

function AnimatedPetal({
  colors,
  expanded,
  highlighted,
  index,
  onPress,
  petal,
  petalCount,
  progress,
  radius,
  reducedMotionEnabled,
  ring,
  styles,
}: AnimatedPetalProps) {
  const position = useMemo(
    () => getDialPetalPosition(index, petalCount, radius),
    [index, petalCount, radius]
  );
  const animatedStyle = useAnimatedStyle(() => {
    const radialProgress = reducedMotionEnabled ? 1 : progress.value;
    return {
      opacity: progress.value,
      transform: [
        { translateX: position.x * radialProgress },
        { translateY: position.y * radialProgress },
        { scale: reducedMotionEnabled ? 1 : 0.78 + progress.value * 0.22 },
      ],
    };
  }, [position.x, position.y, reducedMotionEnabled]);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={[styles.petalPosition, animatedStyle]}
    >
      <Pressable
        accessibilityLabel={petal.label}
        accessibilityRole="button"
        onPress={() => onPress(petal, ring, index)}
        style={({ pressed }) => [
          styles.petal,
          highlighted && styles.petalHighlighted,
          pressed && styles.petalPressed,
        ]}
      >
        <Ionicons
          name={petal.icon}
          size={20}
          color={highlighted ? colors.onAccent : colors.accent}
        />
        <Text
          numberOfLines={1}
          style={[styles.petalLabel, highlighted && styles.petalLabelHighlighted]}
        >
          {petal.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function RadialDial({
  bottomOffset,
  onAction,
  onExpand,
  petals,
  rightOffset,
}: RadialDialProps) {
  const theme = useTheme();
  const { colors, motion } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotionEnabled = useReducedMotion();
  const progress = useSharedValue(0);
  const submenuProgress = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<HighlightedPetal | null>(null);
  const expandedRef = useRef(false);
  const highlightedRef = useRef<HighlightedPetal | null>(null);
  const pressStartedExpandedRef = useRef<boolean | null>(null);

  const activeSubmenu =
    activeSubmenuIndex === null ? undefined : petals[activeSubmenuIndex]?.submenu;
  const scrimAnimatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: reducedMotionEnabled ? motion.durationFast : motion.durationBase,
      easing: Easing.bezier(...motion.easeOut),
    });
  }, [
    expanded,
    motion.durationBase,
    motion.durationFast,
    motion.easeOut,
    progress,
    reducedMotionEnabled,
  ]);

  useEffect(() => {
    if (expanded && activeSubmenu?.length) {
      submenuProgress.value = 0;
      submenuProgress.value = withTiming(1, {
        duration: reducedMotionEnabled ? motion.durationFast : motion.durationBase,
        easing: Easing.bezier(...motion.easeOut),
      });
      return;
    }

    submenuProgress.value = withTiming(0, {
      duration: reducedMotionEnabled ? motion.durationFast : motion.durationBase,
      easing: Easing.bezier(...motion.easeOut),
    });
  }, [
    activeSubmenu,
    expanded,
    motion.durationBase,
    motion.durationFast,
    motion.easeOut,
    reducedMotionEnabled,
    submenuProgress,
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
    if (next) {
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
          SECOND_DIAL_RING
        );
        if (submenuHit.petalIndex !== null) {
          return { ring: 'second', index: submenuHit.petalIndex };
        }
      }

      const firstRingHit = hitTestDialPetals(x, y, petals.length, FIRST_DIAL_RING);
      return firstRingHit.petalIndex === null
        ? null
        : { ring: 'first', index: firstRingHit.petalIndex };
    },
    [activeSubmenu, petals.length]
  );

  const handleTouchBegin = useCallback(() => {
    pressStartedExpandedRef.current = expandedRef.current;
    expand();
  }, [expand]);

  const handleDragPosition = useCallback(
    (x: number, y: number) => {
      setHighlightedState(hitTestPosition(x, y));
    },
    [hitTestPosition, setHighlightedState]
  );

  const handleDragRelease = useCallback(
    (x: number, y: number) => {
      pressStartedExpandedRef.current = null;
      const hit = hitTestPosition(x, y);
      setHighlightedState(null);

      if (!hit) {
        runRegentEventHaptic('dialCancelled');
        collapse();
        return;
      }

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
            right: rightOffset,
          },
        ]}
        testID="radial-dial"
      >
        {petals.map((petal, index) => (
          <AnimatedPetal
            colors={colors}
            expanded={expanded}
            highlighted={highlighted?.ring === 'first' && highlighted.index === index}
            index={index}
            key={petal.id}
            onPress={commitPetal}
            petal={petal}
            petalCount={petals.length}
            progress={progress}
            radius={DIAL_FIRST_RING_RADIUS}
            reducedMotionEnabled={reducedMotionEnabled}
            ring="first"
            styles={styles}
          />
        ))}

        {activeSubmenu?.map((petal, index) => (
          <AnimatedPetal
            colors={colors}
            expanded={expanded}
            highlighted={highlighted?.ring === 'second' && highlighted.index === index}
            index={index}
            key={`${petals[activeSubmenuIndex ?? 0]?.id ?? 'submenu'}-${petal.id}`}
            onPress={commitPetal}
            petal={petal}
            petalCount={activeSubmenu.length}
            progress={submenuProgress}
            radius={DIAL_SECOND_RING_RADIUS}
            reducedMotionEnabled={reducedMotionEnabled}
            ring="second"
            styles={styles}
          />
        ))}

        <View style={styles.centerPosition}>
          <GestureDetector gesture={panGesture}>
            <Pressable
              accessibilityLabel={expanded ? 'Close radial dial' : 'Open radial dial'}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={handleCenterPress}
              style={({ pressed }) => [styles.center, pressed && styles.centerPressed]}
            >
              <DialCenterGlyph color={colors.onAccent} expanded={expanded} />
            </Pressable>
          </GestureDetector>
        </View>
      </View>
    </View>
  );
}

function makeStyles({ colors, fonts, motion, type }: Theme) {
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
      width: DIAL_CANVAS_SIZE,
      height: DIAL_CANVAS_SIZE,
    },
    centerPosition: {
      position: 'absolute',
      left: DIAL_CENTER_COORDINATE - CENTER_RADIUS,
      top: DIAL_CENTER_COORDINATE - CENTER_RADIUS,
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
    petalPosition: {
      position: 'absolute',
      left: DIAL_CENTER_COORDINATE - PETAL_RADIUS,
      top: DIAL_CENTER_COORDINATE - PETAL_RADIUS,
      width: PETAL_SIZE,
      height: PETAL_SIZE,
    },
    petal: {
      width: PETAL_SIZE,
      height: PETAL_SIZE,
      borderRadius: PETAL_RADIUS,
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
    petalLabel: {
      color: colors.text,
      fontFamily: fonts.ui,
      fontSize: type.caption.size - 2,
      lineHeight: type.caption.line - 2,
    },
    petalLabelHighlighted: {
      color: colors.onAccent,
    },
  });
}
