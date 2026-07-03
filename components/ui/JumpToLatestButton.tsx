import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';

const BUTTON_SIZE = 32;
const MIN_TOUCH_TARGET = 44;
const TOUCH_SLOP = (MIN_TOUCH_TARGET - BUTTON_SIZE) / 2;

type JumpToLatestButtonProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Small circular control that returns the conversation to the newest
 * message. Inverted monochrome fill so it reads above the message list.
 */
export function JumpToLatestButton({ onPress, style }: JumpToLatestButtonProps) {
  return (
    <RegentPressable
      accessibilityLabel="Jump to latest message"
      accessibilityRole="button"
      haptic="selection"
      hitSlop={TOUCH_SLOP}
      onPress={onPress}
      variant="icon"
      style={[styles.button, style]}
    >
      <Ionicons name="chevron-down" size={16} color={COLORS.DARK_BG} />
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.TEXT_PRIMARY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.BORDER,
  },
});
