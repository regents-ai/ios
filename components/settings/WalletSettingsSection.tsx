import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

const { CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER } = COLORS;

type WalletSettingsSectionProps = {
  lifetimeTxThreshold: number;
  setLifetimeTxThresholdLocal: Dispatch<SetStateAction<number>>;
};

export function WalletSettingsSection({
  lifetimeTxThreshold,
  setLifetimeTxThresholdLocal,
}: WalletSettingsSectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Wallet</Text>

      <View style={styles.infoBlock}>
        <Text style={styles.labelText}>Apple Pay reminder</Text>
        <Text style={styles.helperText}>Choose when to remind someone that their Apple Pay limit is running low.</Text>
        <TextInput
          style={styles.numberInput}
          value={String(lifetimeTxThreshold)}
          onChangeText={text => {
            const parsed = parseInt(text, 10);
            if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 99) {
              setLifetimeTxThresholdLocal(parsed);
            } else if (text === '') {
              setLifetimeTxThresholdLocal(0);
            }
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="5"
          placeholderTextColor={TEXT_SECONDARY}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  cardTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  infoBlock: {
    gap: 8,
  },
  labelText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: TEXT_PRIMARY,
    fontSize: 16,
    width: 90,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
