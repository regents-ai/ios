import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { StyleSheet, Text, View } from 'react-native';

const { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BORDER, BLUE } = COLORS;

type PlaceholderScreenProps = {
  title: string;
  intro: string;
  highlights: string[];
  note: string;
};

export function PlaceholderScreen({ title, intro, highlights, note }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Regents Mobile</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.intro}>{intro}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What belongs here</Text>
        <View style={styles.list}>
          {highlights.map(item => (
            <View key={item} style={styles.listRow}>
              <View style={styles.dot} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Current phase</Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CARD_BG,
    padding: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: FONTS.heading,
  },
  intro: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  list: {
    gap: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
    backgroundColor: BLUE,
  },
  listText: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  note: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
