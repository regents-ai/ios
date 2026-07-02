import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { StyleSheet, Text, View } from 'react-native';
import { SettingsModalSurface } from './SettingsModalSurface';

const { CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE } = COLORS;

type PhoneReverifyModalProps = {
  onConfirm: () => void;
  onRequestClose: () => void;
  visible: boolean;
};

export function PhoneReverifyModal({
  onConfirm,
  onRequestClose,
  visible,
}: PhoneReverifyModalProps) {
  return (
    <SettingsModalSurface visible={visible} onRequestClose={onRequestClose}>
      <StaggerGroup>
        <StaggerItem order={0}>
          <Text style={styles.modalTitle}>Verify phone again</Text>
        </StaggerItem>
        <StaggerItem order={1}>
          <Text style={styles.helperText}>We will sign you out and send a new code to your phone.</Text>
        </StaggerItem>
        <StaggerItem order={2}>
          <View style={styles.buttonRow}>
            <RegentPressable style={styles.secondaryButton} onPress={onRequestClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </RegentPressable>
            <RegentPressable haptic="warning" style={[styles.primaryButton, { flex: 1 }]} onPress={onConfirm}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </RegentPressable>
          </View>
        </StaggerItem>
      </StaggerGroup>
    </SettingsModalSurface>
  );
}

const styles = StyleSheet.create({
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 120,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 120,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  modalTitle: {
    color: BLUE,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
});
