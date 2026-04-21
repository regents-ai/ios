import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '@/constants/Colors';

const { BLUE } = COLORS;

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
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(sheetTranslate, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(sheetTranslate, { toValue: 300, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, sheetTranslate, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslate }] }]}>
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
        </Animated.View>
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
    backgroundColor: '#111827',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1f2937',
    maxHeight: '50%',
    width: '100%',
    minHeight: 320,
    paddingBottom: 20,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  scrollView: {},
  item: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  selectedItem: {
    backgroundColor: `${BLUE}15`,
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
    fontSize: 18,
    fontWeight: '500',
    color: '#f8fafc',
    flex: 1,
  },
  selectedText: {
    color: BLUE,
    fontWeight: '600',
  },
});
