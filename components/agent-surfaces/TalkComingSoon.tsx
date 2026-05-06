import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH } = COLORS;

const TALK_PREVIEW_ITEMS = [
  {
    title: 'Hermes messages',
    body: 'Conversation history will appear here when Talk returns.',
    icon: 'chatbubble-ellipses-outline',
  },
  {
    title: 'Review cards',
    body: 'Human decisions will have a quiet place of their own.',
    icon: 'eye-outline',
  },
  {
    title: 'Recent movement',
    body: 'New work and handoffs will stay easy to scan.',
    icon: 'pulse-outline',
  },
] as const;

type TalkComingSoonProps = {
  onBack?: () => void;
};

export function TalkComingSoon({ onBack }: TalkComingSoonProps) {
  return (
    <SafeAreaView style={styles.container}>
      {onBack ? (
        <View style={styles.header}>
          <RegentPressable pressStyle="icon" onPress={onBack} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
          </RegentPressable>
          <Text style={styles.headerTitle}>Talk</Text>
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        style={styles.scroller}
      >
        <View style={styles.heroCard}>
          <View style={styles.statusPill}>
            <Ionicons name="sparkles-outline" size={14} color={BLUE} />
            <Text style={styles.statusText}>Coming soon</Text>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Hermes Talk</Text>
            <Text style={styles.heroTitle}>Talk with Hermes is coming soon</Text>
            <Text style={styles.heroBody}>
              Hermes conversations will return here soon. Regent Manager and Wallet are live today.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What will appear here</Text>
          <View style={styles.previewList}>
            {TALK_PREVIEW_ITEMS.map((item) => (
              <View key={item.title} style={styles.previewRow}>
                <View style={styles.previewIcon}>
                  <Ionicons name={item.icon} size={18} color={BLUE} />
                </View>
                <View style={styles.previewCopy}>
                  <Text style={styles.previewTitle}>{item.title}</Text>
                  <Text style={styles.previewBody}>{item.body}</Text>
                </View>
                <Text style={styles.previewMeta}>Soon</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="pause-circle-outline" size={22} color={BLUE} />
          <View style={styles.noteCopy}>
            <Text style={styles.noteTitle}>Quiet for now</Text>
            <Text style={styles.noteBody}>
              Messages, replies, and review actions are not available here yet.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: TEXT_PRIMARY,
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 28,
    padding: 22,
    gap: 18,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  heroCopy: {
    gap: 10,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  heroTitle: {
    color: TEXT_PRIMARY,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FONTS.heading,
  },
  heroBody: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  previewList: {
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
  },
  previewIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  previewTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: FONTS.heading,
  },
  previewBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  previewMeta: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    padding: 18,
  },
  noteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  noteTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  noteBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
