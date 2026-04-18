import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BORDER, BLUE, VIOLET } = COLORS;

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
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>Regents Mobile</Text>
        </View>
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
    backgroundColor: DARK_BG,
    padding: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    gap: 12,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eyebrowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: VIOLET,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: BLUE,
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
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: BLUE,
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
