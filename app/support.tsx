import { FailedTransactionCard } from '@/components/ui/FailedTransactionCard';
import { getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { openSupportEmail, type GuestCheckoutDebugInfo } from '@/utils/supportEmail';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EaseView } from 'react-native-ease';

const { BLUE, DARK_BG, CARD_BG, CARD_ALT, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;

function buildTimingTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

type SupportIssueKey = 'card' | 'apple-pay' | 'general';

const SUPPORT_ISSUES: Record<
  SupportIssueKey,
  {
    title: string;
    message: string;
    debugInfo: GuestCheckoutDebugInfo;
  }
> = {
  card: {
    title: 'Card payment issue',
    message: 'We could not finish your card payment. Email support and they will help you pick up where things stopped.',
    debugInfo: {
      flowType: 'authenticated',
      partnerName: 'Regents',
      errorMessage: 'Card payment issue',
      debugMessage: 'Card payment help requested from the Support screen.',
    },
  },
  'apple-pay': {
    title: 'Apple Pay issue',
    message: 'We could not finish your Apple Pay purchase. Email support and they will help you sort it out.',
    debugInfo: {
      flowType: 'guest',
      partnerName: 'Regents',
      errorMessage: 'Apple Pay purchase issue',
      debugMessage: 'Apple Pay help requested from the Support screen.',
    },
  },
  general: {
    title: 'Need help?',
    message: 'Email support and tell them what happened. The message will include the details they need to help faster.',
    debugInfo: {
      flowType: 'authenticated',
      partnerName: 'Regents',
      errorMessage: 'General support request',
      debugMessage: 'General help requested from the Support screen.',
    },
  },
};

export default function SupportScreen() {
  const router = useRouter();
  const reducedMotionEnabled = useReducedMotion();
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [isFailedModalPresented, setIsFailedModalPresented] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<SupportIssueKey>('general');

  useEffect(() => {
    if (showFailedModal) {
      setIsFailedModalPresented(true);
    }
  }, [showFailedModal]);

  const openSupportCard = (issue: SupportIssueKey) => {
    setSelectedIssue(issue);
    setShowFailedModal(true);
  };

  const selectedSupportIssue = SUPPORT_ISSUES[selectedIssue];

  const helpOptions = [
    {
      label: 'Card purchase issue',
      detail: 'Open the next step and email support with the card details.',
      icon: 'card-outline' as const,
      onPress: () => openSupportCard('card'),
    },
    {
      label: 'Apple Pay issue',
      detail: 'Open the next step and email support with the Apple Pay details.',
      icon: 'logo-apple' as const,
      onPress: () => openSupportCard('apple-pay'),
    },
  ];

  const commonQuestions = [
    {
      label: 'How do I add money?',
      onPress: () =>
        openSupportEmail({
          flowType: 'authenticated',
          partnerName: 'Regents',
          errorMessage: 'Help requested for adding money',
          debugMessage: 'Support question from FAQ: How do I add money?',
        }),
    },
    {
      label: 'How do I send money?',
      onPress: () =>
        openSupportEmail({
          flowType: 'authenticated',
          partnerName: 'Regents',
          errorMessage: 'Help requested for sending money',
          debugMessage: 'Support question from FAQ: How do I send money?',
        }),
    },
    {
      label: 'How do I cash out?',
      onPress: () =>
        openSupportEmail({
          flowType: 'authenticated',
          partnerName: 'Regents',
          errorMessage: 'Help requested for cashing out',
          debugMessage: 'Support question from FAQ: How do I cash out?',
        }),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TEXT_PRIMARY} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <EaseView
          initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reducedMotionEnabled)}
          style={styles.hero}
        >
          <Text style={styles.title}>Support</Text>
          <Text style={styles.subtitle}>We&apos;ll help you sort this out.</Text>
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reducedMotionEnabled, STAGGER_STEP)}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>Payment help</Text>
          <View style={styles.panel}>
            {helpOptions.map((option, index) => (
              <View key={option.label}>
                <Pressable
                  style={({ pressed }) => [styles.rowButton, pressed && styles.rowButtonPressed]}
                  onPress={option.onPress}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={option.icon} size={24} color={TEXT_PRIMARY} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{option.label}</Text>
                    <Text style={styles.rowDetail}>{option.detail}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={TEXT_SECONDARY} />
                </Pressable>
                {index < helpOptions.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))}
          </View>
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reducedMotionEnabled, STAGGER_STEP * 2)}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>Frequently asked</Text>
          <View style={styles.panel}>
            {commonQuestions.map((question, index) => (
              <View key={question.label}>
                <Pressable
                  style={({ pressed }) => [styles.questionRow, pressed && styles.rowButtonPressed]}
                  onPress={question.onPress}
                >
                  <Text style={styles.questionLabel}>{question.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color={TEXT_SECONDARY} />
                </Pressable>
                {index < commonQuestions.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))}
          </View>
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={buildTimingTransition(reducedMotionEnabled, STAGGER_STEP * 3)}
          style={styles.buttonWrap}
        >
          <Pressable
            style={styles.primaryButton}
            onPress={() => openSupportEmail(SUPPORT_ISSUES.general.debugInfo)}
          >
            <Text style={styles.primaryButtonText}>Email support</Text>
          </Pressable>
        </EaseView>
      </ScrollView>

      <Modal
        visible={isFailedModalPresented}
        animationType="none"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setShowFailedModal(false)}
      >
        <EaseView
          initialAnimate={{ opacity: 0, translateY: 8, scale: 0.985 }}
          animate={{
            opacity: showFailedModal ? 1 : 0,
            translateY: showFailedModal ? 0 : 8,
            scale: showFailedModal ? 1 : 0.985,
          }}
          onTransitionEnd={({ finished }) => {
            if (finished && !showFailedModal) {
              setIsFailedModalPresented(false);
            }
          }}
          style={StyleSheet.absoluteFillObject}
          transition={getEaseTransition('emphasis', reducedMotionEnabled)}
        >
          <FailedTransactionCard
            title={selectedSupportIssue.title}
            message={selectedSupportIssue.message}
            debugInfo={selectedSupportIssue.debugInfo}
            errorMessage={selectedSupportIssue.debugInfo.errorMessage || 'We could not finish this purchase.'}
            onDismiss={() => setShowFailedModal(false)}
            showDismiss
          />
        </EaseView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    height: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 28,
  },
  hero: {
    gap: 8,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 42,
    lineHeight: 44,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  panel: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  rowButtonPressed: {
    opacity: 0.82,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontFamily: FONTS.heading,
  },
  rowDetail: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  rowDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginLeft: 78,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  questionLabel: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
    flex: 1,
  },
  buttonWrap: {
    paddingTop: 8,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
});
