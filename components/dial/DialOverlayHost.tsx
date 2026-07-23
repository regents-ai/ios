import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RadialDial } from '@/components/dial/RadialDial';
import { resolveDialActionHref } from '@/components/dial/actionTargets';
import {
  resolveDialPetals,
  type DialPetalAction,
  type MessageThreadDialCommand,
} from '@/components/dial/petalRegistry';
import { createDialTargetRefresher } from '@/components/dial/targetRefresh';
import { runRegentHaptic } from '@/components/ui/haptics';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import type { RegentSummary } from '@/types/regents';
import {
  appendToMessageComposer,
  captureMessageComposerController,
  runMessageComposerAction,
} from '@/utils/messageComposerBridge';
import { regentApi } from '@/utils/regentApi/client';

const TAB_BAR_CLEARANCE = 96;
const MESSAGE_COMPOSER_CLEARANCE = 92;
const EDGE_GUTTER = 16;

export function DialOverlayHost() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isMessageThread = /^\/message\/[^/]+\/?$/.test(pathname);
  const keyboardHeight = useKeyboardHeight(isMessageThread);
  const petals = useMemo(() => resolveDialPetals(pathname), [pathname]);
  const primaryRegentRef = useRef<RegentSummary | null | undefined>(undefined);
  const urgentThreadIdRef = useRef<string | null | undefined>(undefined);
  const targetRefresher = useMemo(
    () =>
      createDialTargetRefresher({
        loadRegents: () => regentApi.listRegents(),
        loadThreads: () => regentApi.listMessageThreads(),
        updatePrimaryRegent: (regent) => {
          primaryRegentRef.current = regent;
        },
        updateUrgentThreadId: (threadId) => {
          urgentThreadIdRef.current = threadId;
        },
      }),
    []
  );
  const baseBottomOffset = Math.max(EDGE_GUTTER, insets.bottom) + TAB_BAR_CLEARANCE;
  const bottomOffset = isMessageThread
    ? Math.max(baseBottomOffset, keyboardHeight + MESSAGE_COMPOSER_CLEARANCE)
    : baseBottomOffset;
  const rightOffset = Math.max(EDGE_GUTTER, insets.right);

  useEffect(() => {
    primaryRegentRef.current = undefined;
    urgentThreadIdRef.current = undefined;

    if (petals.length === 0) {
      return;
    }

    void targetRefresher.refresh();

    return () => {
      targetRefresher.invalidate();
    };
  }, [petals.length, targetRefresher]);

  const handleExpand = useCallback(() => {
    void targetRefresher.refresh();
  }, [targetRefresher]);

  const handleMessageComposerAction = useCallback(
    async (command: MessageThreadDialCommand) => {
      if (command !== 'paste') {
        if (!runMessageComposerAction(command)) {
          runRegentHaptic('selection');
        }
        return;
      }

      const composer = captureMessageComposerController();
      const clipboardText = await Clipboard.getStringAsync().catch(() => '');
      if (!clipboardText || !appendToMessageComposer(composer, clipboardText)) {
        runRegentHaptic('selection');
        return;
      }
    },
    []
  );

  const handleAction = useCallback(
    (action: DialPetalAction) => {
      if (action.kind === 'messageComposer') {
        void handleMessageComposerAction(action.command);
        return;
      }

      router.push(
        resolveDialActionHref(action, {
          primaryRegent: primaryRegentRef.current,
          urgentThreadId: urgentThreadIdRef.current,
        })
      );
    },
    [handleMessageComposerAction, router]
  );

  if (petals.length === 0) {
    return null;
  }

  return (
    <RadialDial
      bottomOffset={bottomOffset}
      onAction={handleAction}
      onExpand={handleExpand}
      petals={petals}
      rightOffset={rightOffset}
    />
  );
}
