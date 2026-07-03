import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE } = COLORS;

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
                  color={selected ? WHITE : TEXT_PRIMARY}
                />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuTitle}>{section.title}</Text>
                <Text style={styles.menuDetail}>{section.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={TEXT_SECONDARY} />
            </RegentPressable>
            {index < sectionOptions.length - 1 ? <View style={styles.menuDivider} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
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
    backgroundColor: CARD_ALT,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconActive: {
    backgroundColor: BLUE,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  menuTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontFamily: FONTS.heading,
  },
  menuDetail: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  menuDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginLeft: 78,
  },
});
