/**
 * Pinned and recent recipient quick picks for the send screen.
 *
 * Backed by the pure recipient picker store (utils/recipientPickerStore)
 * bound to AsyncStorage. Addresses are stored locally only. Tap a chip to
 * fill the recipient field; press and hold to pin or unpin it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { formatAddressPreview } from '@/utils/onchain/networkDisplay';
import {
  createRecipientPickerStore,
  type RecipientCatalog,
  type RecipientDisplayEntry,
} from '@/utils/recipientPickerStore';

const { BLUE, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

const store = createRecipientPickerStore(AsyncStorage);

const changeListeners = new Set<() => void>();

function notifyPickerChanged() {
  for (const listener of changeListeners) {
    listener();
  }
}

/** Record that the user sent to this address. Safe to fire and forget. */
export async function recordRecipientUse(address: string) {
  try {
    await store.recordRecipientUse(address);
    notifyPickerChanged();
  } catch {
    // Quick picks are a convenience; never let them interrupt a send.
  }
}

export function RecipientQuickPicks({
  onSelect,
  catalog,
}: {
  onSelect: (address: string) => void;
  catalog?: RecipientCatalog;
}) {
  const [entries, setEntries] = useState<RecipientDisplayEntry[]>([]);

  const reload = useCallback(async () => {
    try {
      setEntries(await store.getPickerEntries(catalog));
    } catch {
      setEntries([]);
    }
  }, [catalog]);

  useEffect(() => {
    void reload();
    const listener = () => {
      void reload();
    };
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  }, [reload]);

  const handleToggleFavorite = useCallback(
    async (address: string) => {
      try {
        await store.toggleFavorite(address);
        notifyPickerChanged();
      } catch {
        // Ignore storage hiccups; the picker simply keeps its current state.
      }
    },
    []
  );

  if (entries.length === 0) {
    return null;
  }

  const pinned = entries.filter((entry) => entry.isFavorite);
  const recent = entries.filter((entry) => !entry.isFavorite);

  const renderChip = (entry: RecipientDisplayEntry) => {
    const displayLabel = entry.label === entry.address ? formatAddressPreview(entry.address) : entry.label;

    return (
      <RegentPressable
        key={entry.address}
        haptic="selection"
        pressStyle="chip"
        style={styles.chip}
        onPress={() => onSelect(entry.address)}
        onLongPress={() => void handleToggleFavorite(entry.address)}
        accessibilityRole="button"
        accessibilityLabel={`${displayLabel}, ${entry.isFavorite ? 'pinned' : 'recent'} recipient`}
        accessibilityHint="Fills the recipient field. Double tap and hold to pin or unpin."
      >
        <Ionicons name={entry.isFavorite ? 'star' : 'time-outline'} size={13} color={entry.isFavorite ? BLUE : TEXT_SECONDARY} />
        <Text style={styles.chipText} numberOfLines={1}>
          {displayLabel}
        </Text>
      </RegentPressable>
    );
  };

  return (
    <View style={styles.container}>
      {pinned.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Pinned</Text>
          <View style={styles.chipRow}>{pinned.map(renderChip)}</View>
        </View>
      ) : null}
      {recent.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Recent</Text>
          <View style={styles.chipRow}>{recent.map(renderChip)}</View>
        </View>
      ) : null}
      <Text style={styles.hint}>Hold a recipient to pin it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  group: {
    gap: 6,
  },
  groupTitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: FONTS.body,
    flexShrink: 1,
  },
  hint: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
});
