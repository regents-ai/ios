/**
 * Settings chrome: the hero header and the section switcher menu.
 *
 * Themed via useTheme + a memoized makeStyles(theme); callers stay transparent.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

export function SettingsHero() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.hero}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </RegentPressable>
      </View>
      <Text style={styles.heroEyebrow}>Regents</Text>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.heroSubtitle}>Account, wallet, and help in one place.</Text>
    </View>
  );
}

export type SettingsSectionKey = 'account' | 'connect' | 'wallet' | 'help';

type SettingsMenuProps = {
  activeSection: SettingsSectionKey;
  displayEmail: string;
  onSectionChange: (section: SettingsSectionKey) => void;
};

export function SettingsMenu({
  activeSection,
  displayEmail,
  onSectionChange,
}: SettingsMenuProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const sectionOptions: {
    key: SettingsSectionKey;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    detail: string;
  }[] = [
    {
      key: 'account',
      icon: 'person-outline',
      title: 'Account',
      detail: displayEmail,
    },
    {
      key: 'connect',
      icon: 'link-outline',
      title: 'Connect',
      detail: 'Agents and funding',
    },
    {
      key: 'wallet',
      icon: 'wallet-outline',
      title: 'Wallet',
      detail: 'Ready for everyday use',
    },
    {
      key: 'help',
      icon: 'help-circle-outline',
      title: 'Help',
      detail: 'Support and quick answers',
    },
  ];

  return (
    <View style={styles.menuCard}>
      {sectionOptions.map((section, index) => {
        const selected = section.key === activeSection;

        return (
          <View key={section.key}>
            <RegentPressable
              haptic="selection"
              pressStyle="card"
              style={[styles.menuRow, selected && styles.menuRowActive]}
              onPress={() => onSectionChange(section.key)}
            >
              <View style={[styles.menuIcon, selected && styles.menuIconActive]}>
                <Ionicons
                  name={section.icon}
                  size={24}
                  color={selected ? colors.onAccent : colors.text}
                />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuTitle}>{section.title}</Text>
                <Text style={styles.menuDetail}>{section.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </RegentPressable>
            {index < sectionOptions.length - 1 ? <View style={styles.menuDivider} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    hero: {
      gap: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEyebrow: {
      color: colors.accent,
      fontSize: 12,
      fontFamily: fonts.title,
    },
    title: {
      color: colors.text,
      fontSize: 42,
      lineHeight: 44,
      fontFamily: fonts.title,
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 22,
      fontFamily: fonts.ui,
    },
    menuCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      overflow: 'hidden',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 20,
    },
    menuRowActive: {
      backgroundColor: colors.surface,
    },
    menuIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuIconActive: {
      backgroundColor: colors.accent,
    },
    menuCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    menuTitle: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fonts.title,
    },
    menuDetail: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.hairlineStrong,
      marginLeft: 78,
    },
  });
}
