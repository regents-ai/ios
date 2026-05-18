import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import type { MobileRegentVoice } from '@/types/regents';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

type HermesVoiceButtonProps = {
  voice: MobileRegentVoice;
  onPress: () => void;
};

export function HermesVoiceButton({ voice, onPress }: HermesVoiceButtonProps) {
  if (!voice.enabled && voice.health === 'unavailable' && voice.account.satisfied) {
    return null;
  }

  const needsAccount = !voice.account.satisfied;
  const label = needsAccount ? 'Connect ChatGPT' : 'Talk to Hermes';
  const detail = needsAccount ? 'Connect once to use voice.' : 'Start a live voice chat.';

  return (
    <RegentPressable
      accessibilityRole="button"
      style={[styles.button, needsAccount && styles.accountButton]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={needsAccount ? 'link-outline' : 'mic-outline'} size={18} color={COLORS.textOnColor} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.TEXT_SECONDARY} />
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.CARD_ALT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountButton: {
    backgroundColor: COLORS.BLUE_WASH,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.BLUE,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: FONTS.heading,
    fontSize: 15,
    color: COLORS.TEXT_PRIMARY,
  },
  detail: {
    marginTop: 2,
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
});
