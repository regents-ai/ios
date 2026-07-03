/**
 * Inline progressive status banner.
 *
 * Replaces blocking spinner overlays and popup alerts on form screens with a
 * quiet inline trio under the form:
 * - working: spinner + progress message
 * - success: checkmark + confirmation message
 * - error:   triangle + actionable message
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BLUE, BLUE_WASH, BORDER, DANGER, SUCCESS, TEXT_PRIMARY } = COLORS;
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#FFF0F0';

export type StatusBannerState = 'working' | 'success' | 'error';

export function StatusBanner({ state, message }: { state: StatusBannerState; message: string }) {
  return (
    <View
      style={[styles.banner, styles[state]]}
      accessibilityRole={state === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      {state === 'working' ? (
        <ActivityIndicator size="small" color={BLUE} />
      ) : state === 'success' ? (
        <Ionicons name="checkmark-circle" size={18} color={SUCCESS} />
      ) : (
        <Ionicons name="warning-outline" size={18} color={DANGER} />
      )}
      <Text style={styles.message} selectable={state === 'error'}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  working: {
    backgroundColor: BLUE_WASH,
    borderColor: BORDER,
  },
  success: {
    backgroundColor: GREEN_WASH,
    borderColor: SUCCESS,
  },
  error: {
    backgroundColor: RED_WASH,
    borderColor: DANGER,
  },
  message: {
    flex: 1,
    minWidth: 0,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
