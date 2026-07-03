import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, type ViewStyle } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { routes } from '@/utils/navigation/routes';
import { useMemo } from 'react';

export function ProfileButton({ style }: { style?: ViewStyle }) {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <RegentPressable
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      pressStyle="icon"
      style={[styles.button, style]}
      onPress={() => router.push(routes.settings())}
    >
      <Ionicons name="person-circle-outline" size={24} color={colors.accent} />
    </RegentPressable>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    button: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
