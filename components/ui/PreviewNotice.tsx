import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

const { BLUE, BLUE_WASH, BORDER, TEXT_PRIMARY, TEXT_SECONDARY } = COLORS;

export function PreviewNotice({
  title = 'Preview only',
  body,
}: {
  title?: string;
  body: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="eye-outline" size={16} color={BLUE} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  body: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
});
