import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { ProfileButton } from '@/components/navigation/ProfileButton';

export function WalletScreenHeader() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.title}>Fund</Text>
        <Text style={styles.subtitle}>Add USDC for agent work, then pay or cash out when you need to.</Text>
      </View>
      <ProfileButton />
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairlineStrong,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    title: {
      fontSize: 22,
      lineHeight: 26,
      color: colors.accent,
      fontFamily: fonts.title,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
  });
}
