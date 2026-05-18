import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, type ViewStyle } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { routes } from '@/utils/navigation/routes';

const { CARD_BG, BORDER, BLUE } = COLORS;

export function ProfileButton({ style }: { style?: ViewStyle }) {
  const router = useRouter();

  return (
    <RegentPressable
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      pressStyle="icon"
      style={[styles.button, style]}
      onPress={() => router.push(routes.settings())}
    >
      <Ionicons name="person-circle-outline" size={24} color={BLUE} />
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
