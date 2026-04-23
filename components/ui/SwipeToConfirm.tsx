import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, PanResponder, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { COLORS } from "../../constants/Colors";
import { FONTS } from "../../constants/Typography";

const { BLUE, CARD_BG, TEXT_PRIMARY, SILVER } = COLORS;

type SwipeToConfirmProps = {
  label: string;
  disabled?: boolean;
  onConfirm: (reset: () => void) => void;
  isLoading?: boolean;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
};


export function SwipeToConfirm({ label, disabled = false, onConfirm, isLoading = false, onSwipeStart, onSwipeEnd }: SwipeToConfirmProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const reduceMotionEnabled = useReducedMotion();
  const knobSize = 52;
  const horizontalPadding = 4;
  const maxX = Math.max(0, trackWidth - knobSize - horizontalPadding * 2);

  const translateX = useRef(new Animated.Value(0)).current;
  const knobScale = useRef(new Animated.Value(1)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const animateKnobScale = useCallback(
    (toValue: number) => {
      if (reduceMotionEnabled) {
        knobScale.setValue(1);
        return;
      }

      Animated.spring(knobScale, {
        toValue,
        useNativeDriver: true,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [knobScale, reduceMotionEnabled]
  );

  const snapBack = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start(() => {
      currentXRef.current = 0;
    });
    animateKnobScale(1);
  }, [animateKnobScale, translateX]);

  const complete = useCallback(() => {
    Animated.timing(translateX, { toValue: maxX, duration: 150, useNativeDriver: true }).start(() => {
      currentXRef.current = maxX;
      const reset = () => snapBack();
      onConfirm(reset);
    });
    animateKnobScale(1);
  }, [animateKnobScale, maxX, onConfirm, snapBack, translateX]);

  React.useEffect(() => {
    Animated.timing(labelOpacity, {
      toValue: isLoading ? 0.72 : 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    if (isLoading) {
      Animated.timing(translateX, {
        toValue: maxX,
        duration: 200,
        useNativeDriver: true
      }).start(() => {
        currentXRef.current = maxX;
      });
      animateKnobScale(1);
    } else {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 16,
      }).start(() => {
        currentXRef.current = 0;
      });
    }
  }, [animateKnobScale, isLoading, labelOpacity, maxX, translateX]);

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && !isLoading,
        onMoveShouldSetPanResponder: (_e, g) => !disabled && !isLoading && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onStartShouldSetPanResponderCapture: () => !disabled && !isLoading,
        onMoveShouldSetPanResponderCapture: () => !disabled && !isLoading,
        onPanResponderGrant: (e) => {
          if (isLoading) return;
          onSwipeStart?.();
          animateKnobScale(1.03);
          const localX = e.nativeEvent.locationX - knobSize / 2;
          const clamped = Math.max(0, Math.min(maxX, localX));
          startXRef.current = clamped;
          currentXRef.current = clamped;
          translateX.setValue(clamped);
        },
        onPanResponderMove: (_e, g) => {
          if (isLoading) return;
          const next = Math.max(0, Math.min(maxX, startXRef.current + g.dx));
          currentXRef.current = next;
          translateX.setValue(next);
        },
        onPanResponderRelease: () => {
          if (isLoading) return;
          onSwipeEnd?.();
          const threshold = maxX * 0.8;
          if (currentXRef.current >= threshold) {
            complete();
          } else {
            snapBack();
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          if (!isLoading) {
            onSwipeEnd?.();
            snapBack();
          }
        },
      }),
    [animateKnobScale, disabled, knobSize, maxX, complete, snapBack, translateX, isLoading, onSwipeStart, onSwipeEnd] 
  );

  const progressScale = translateX.interpolate({
    inputRange: [0, Math.max(1, maxX)],
    outputRange: [1, Math.max(1, trackWidth / knobSize)],
    extrapolate: 'clamp',
  });
  const progressTranslateX = Animated.multiply(Animated.subtract(progressScale, 1), knobSize / 2);

  return (
    <View style={[styles.swipeContainer, disabled && { opacity: 0.5 }]}>
      <View
        style={styles.swipeTrack}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...(!isLoading ? pan.panHandlers : {})}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || isLoading }}
        accessibilityLabel={label}
      >
        <Animated.View
          style={[
            styles.swipeProgress,
            { width: knobSize, transform: [{ translateX: progressTranslateX }, { scaleX: progressScale }] },
          ]}
        />

        <Animated.View style={[styles.swipeCenter, { opacity: labelOpacity }]}>
          {isLoading ? (
            <View style={styles.loadingContent}>
              <ActivityIndicator size="small" color={TEXT_PRIMARY} />
              <Text style={styles.loadingLabel}>Preparing your purchase…</Text>
            </View>
          ) : (
            <Text style={styles.swipeLabel}>{label}</Text>
          )}
        </Animated.View>

        <Animated.View style={[styles.swipeKnob, { transform: [{ translateX }, { scale: knobScale }] }]}>
          <Ionicons name={isLoading ? "checkmark" : "chevron-forward"} size={22} color="#FFFFFF" />
        </Animated.View>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  swipeContainer: {
    marginTop: 8,
  },
  swipeTrack: {
    height: 60,
    borderRadius: 30,
    backgroundColor: CARD_BG, 
    borderColor: SILVER,        
    borderWidth: 1,           
    overflow: "hidden",
    justifyContent: "center",
    position: 'relative',    
  },
  swipeCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 64,
  },
  swipeProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: BLUE,
    opacity: 0.15,
    borderRadius: 30,              
  },
  swipeLabel: {
    textAlign: "center",
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.body,
  },
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingLabel: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  swipeKnob: {
    position: "absolute",
    left: 4,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BLUE,  
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
