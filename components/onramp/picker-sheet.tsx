import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { EaseView } from 'react-native-ease';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';

const { BLUE, BORDER, CARD_BG, CARD_ALT, TEXT_PRIMARY } = COLORS;

type Item = {
  iconUrl?: string | null;
  key: string;
  label: string;
  selected?: boolean;
};

type Props = {
  emptyLabel?: string;
  items: Item[];
  loadingLabel?: string;
  onClose: () => void;
  onSelect: (key: string) => void;
  visible: boolean;
};

export function PickerSheet({ emptyLabel = 'No options available', items, loadingLabel, onClose, onSelect, visible }: Props) {
  const reducedMotionEnabled = useReducedMotion();
  const [isPresented, setIsPresented] = useState(visible);

  useEffect(() => {
    if (visible) {
      setIsPresented(true);
    }
  }, [visible]);

  return (
    <Modal
      visible={isPresented}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <EaseView
          initialAnimate={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={getEaseTransition('card', reducedMotionEnabled)}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: visible ? 1 : 0, translateY: visible ? 0 : 20 }}
          onTransitionEnd={({ finished }) => {
            if (finished && !visible) {
              setIsPresented(false);
            }
          }}
          transition={getEaseTransition('sheet', reducedMotionEnabled)}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={styles.scrollView}>
            {!items.length && loadingLabel ? (
              <View style={styles.item}>
                <Text style={styles.text}>{loadingLabel}</Text>
              </View>
            ) : items.length ? (
              items.map(item => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    onSelect(item.key);
                    onClose();
                  }}
                  style={[styles.item, item.selected && styles.selectedItem]}
                >
                  <View style={styles.itemContent}>
                    <View style={styles.itemLeft}>
                      {item.iconUrl ? <Image source={{ uri: item.iconUrl }} style={styles.icon} /> : null}
                      <Text style={[styles.text, item.selected && styles.selectedText]}>{item.label}</Text>
                    </View>
                    {item.selected ? <Ionicons name="checkmark" size={20} color={BLUE} /> : null}
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.item}>
                <Text style={styles.text}>{emptyLabel}</Text>
              </View>
            )}
          </ScrollView>
        </EaseView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    maxHeight: '50%',
    width: '100%',
    minHeight: 320,
    paddingBottom: 20,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: BORDER,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  scrollView: {},
  item: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  selectedItem: {
    backgroundColor: CARD_ALT,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    width: 32,
    height: 32,
    marginRight: 16,
    borderRadius: 16,
  },
  text: {
    fontSize: 17,
    color: TEXT_PRIMARY,
    flex: 1,
    fontFamily: FONTS.body,
  },
  selectedText: {
    color: BLUE,
    fontFamily: FONTS.heading,
  },
});
