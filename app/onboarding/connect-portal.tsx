import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EaseView } from 'react-native-ease';

import { getMotionPreset } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { runRegentEventHaptic } from '@/components/ui/haptics';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { describeApiError } from '@/utils/apiError';
import {
  capturePortalPairingOwner,
  completePortalPairingForOwner,
  isPortalPairingOwnerCurrent,
  parsePortalPairingCallbackUrl,
  reducePortalPairingPhase,
  type PortalPairingCallback,
  type PortalPairingOwnerToken,
  type PortalPairingPhase,
} from '@/utils/portalPairing/pairingFlow';
import {
  regentApi,
  type PortalPairingStatus,
} from '@/utils/regentApi/client';
import { setPostAuthDestination } from '@/utils/state/postAuthDestination';

export default function ConnectPortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnUrl?: string }>();
  const returnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : null;
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotionEnabled = useReducedMotion();
  const { alertProps, showAlert } = useCoinbaseAlert();
  const { session: chatGptSession } = useChatGptAuth();
  const { regentsUserId } = useRegentsAuth();
  const [phase, setPhase] = useState<PortalPairingPhase>('loading');
  const [status, setStatus] = useState<PortalPairingStatus | null>(null);
  const currentUserRef = useRef(regentsUserId);
  const activeAttemptRef = useRef<PortalPairingOwnerToken | null>(null);
  const attemptSequenceRef = useRef(0);
  const handledReturnRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  currentUserRef.current = regentsUserId;

  const isSignedIn = !!chatGptSession && !!regentsUserId;

  const transition = useCallback((event: Parameters<typeof reducePortalPairingPhase>[1]) => {
    setPhase((current) => reducePortalPairingPhase(current, event));
  }, []);

  const beginOwnedAttempt = useCallback(() => {
    attemptSequenceRef.current += 1;
    const owner = capturePortalPairingOwner(
      currentUserRef.current,
      attemptSequenceRef.current,
    );
    activeAttemptRef.current = owner;
    return owner;
  }, []);

  const currentAttemptOwner = useCallback(() => ({
    userId: currentUserRef.current,
    attemptId: activeAttemptRef.current?.attemptId ?? null,
    mounted: mountedRef.current,
    focused: focusedRef.current,
  }), []);

  const ownsAttempt = useCallback((owner: PortalPairingOwnerToken) => {
    return isPortalPairingOwnerCurrent(owner, currentAttemptOwner());
  }, [currentAttemptOwner]);

  const isOwnerUserCurrent = useCallback((owner: PortalPairingOwnerToken) => {
    return owner.userId === currentUserRef.current;
  }, []);

  const isActiveAttempt = useCallback((owner: PortalPairingOwnerToken) => {
    const activeAttempt = activeAttemptRef.current;
    return (
      activeAttempt?.userId === owner.userId &&
      activeAttempt.attemptId === owner.attemptId
    );
  }, []);

  const finishAttempt = useCallback((owner: PortalPairingOwnerToken) => {
    if (isActiveAttempt(owner)) {
      activeAttemptRef.current = null;
    }
  }, [isActiveAttempt]);

  const dropStaleAttempt = useCallback((owner: PortalPairingOwnerToken) => {
    if (!isOwnerUserCurrent(owner)) {
      return;
    }
    const activeAttempt = activeAttemptRef.current;
    if (activeAttempt !== null && !isActiveAttempt(owner)) {
      return;
    }
    finishAttempt(owner);
    if (!mountedRef.current) {
      return;
    }
    transition({ type: 'failed' });
    showAlert({
      title: 'Pairing stopped',
      message: 'This pairing attempt is no longer active. Nothing changed.',
      type: 'info',
    });
  }, [
    finishAttempt,
    isActiveAttempt,
    isOwnerUserCurrent,
    showAlert,
    transition,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      focusedRef.current = false;
      activeAttemptRef.current = null;
    };
  }, []);

  const failAttempt = useCallback((owner: PortalPairingOwnerToken, error: unknown) => {
    if (!isOwnerUserCurrent(owner)) {
      return;
    }
    finishAttempt(owner);
    transition({ type: 'failed' });
    const failure = describeApiError(error);
    showAlert({ ...failure, type: 'error' });
  }, [finishAttempt, isOwnerUserCurrent, showAlert, transition]);

  const loadPortalStatus = useCallback((
    owner: PortalPairingOwnerToken,
    isActive: () => boolean,
    replacesStaleAttempt = false,
  ) => {
    void regentApi.getPortalPairing()
      .then((nextStatus) => {
        if (!isActive() || !ownsAttempt(owner)) {
          return;
        }
        setStatus(nextStatus);
        transition({
          type: 'statusLoaded',
          paired: nextStatus.paired,
          replacesStaleAttempt,
        });
        finishAttempt(owner);
      })
      .catch((error) => {
        if (isActive() && ownsAttempt(owner)) {
          failAttempt(owner, error);
        }
      });
  }, [failAttempt, finishAttempt, ownsAttempt, transition]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (!isSignedIn) {
        activeAttemptRef.current = null;
        setStatus(null);
        setPhase('idle');
        return () => {
          focusedRef.current = false;
          activeAttemptRef.current = null;
        };
      }

      const activeAttempt = activeAttemptRef.current;
      const preservesActiveAttempt = (
        activeAttempt !== null &&
        activeAttempt.userId === regentsUserId &&
        ownsAttempt(activeAttempt)
      );
      const replacesStaleAttempt =
        activeAttempt !== null && !preservesActiveAttempt;
      const owner = preservesActiveAttempt ? null : beginOwnedAttempt();
      let focused = true;
      if (owner) {
        loadPortalStatus(owner, () => focused, replacesStaleAttempt);
      }

      return () => {
        focused = false;
        focusedRef.current = false;
        if (owner) {
          finishAttempt(owner);
        }
      };
    }, [
      beginOwnedAttempt,
      finishAttempt,
      isSignedIn,
      loadPortalStatus,
      ownsAttempt,
      regentsUserId,
    ]),
  );

  const completePairing = useCallback(async (
    owner: PortalPairingOwnerToken,
    callback: Extract<PortalPairingCallback, { kind: 'ok' }>,
  ) => {
    transition({ type: 'callbackReceived' });
    const completion = await completePortalPairingForOwner(
      owner,
      currentAttemptOwner,
      () => regentApi.completePortalPairing({
        code: callback.code,
        state: callback.state,
      }),
    );
    if (completion.kind === 'stale_before_request') {
      dropStaleAttempt(owner);
      return;
    }
    if (completion.kind === 'stale_after_request') {
      const completionStillOwnsAttempt =
        isOwnerUserCurrent(owner) && isActiveAttempt(owner);
      finishAttempt(owner);
      if (!completionStillOwnsAttempt) {
        return;
      }
      if (mountedRef.current) {
        transition({ type: 'failed' });
      }
      if (mountedRef.current && focusedRef.current) {
        const refreshOwner = beginOwnedAttempt();
        if (refreshOwner) {
          loadPortalStatus(
            refreshOwner,
            () => mountedRef.current && focusedRef.current,
          );
        }
      }
      return;
    }
    if (completion.kind === 'failed') {
      failAttempt(owner, completion.error);
      return;
    }

    setStatus(completion.value);
    transition({ type: 'completed' });
    finishAttempt(owner);
    runRegentEventHaptic('portalPairingSucceeded');
  }, [
    beginOwnedAttempt,
    currentAttemptOwner,
    dropStaleAttempt,
    failAttempt,
    finishAttempt,
    isActiveAttempt,
    isOwnerUserCurrent,
    loadPortalStatus,
    transition,
  ]);

  useEffect(() => {
    if (!returnUrl || !isSignedIn || handledReturnRef.current === returnUrl) {
      return;
    }
    handledReturnRef.current = returnUrl;
    const callback = parsePortalPairingCallbackUrl(returnUrl);
    if (callback.kind === 'reject') {
      setPhase('idle');
      showAlert({
        title: 'Pairing did not finish',
        message: 'Return to Nous Portal and try pairing again.',
        type: 'error',
      });
      return;
    }

    const owner = beginOwnedAttempt();
    if (!owner) {
      return;
    }
    void completePairing(owner, callback);
  }, [
    beginOwnedAttempt,
    completePairing,
    isSignedIn,
    returnUrl,
    showAlert,
  ]);

  const goToSignIn = useCallback(() => {
    setPostAuthDestination('/onboarding/connect-portal');
    router.replace('/auth/login');
  }, [router]);

  const beginPairing = useCallback(async () => {
    const owner = beginOwnedAttempt();
    if (!owner) {
      goToSignIn();
      return;
    }

    transition({ type: 'start' });
    try {
      const started = await regentApi.startPortalPairing();
      if (!ownsAttempt(owner)) {
        dropStaleAttempt(owner);
        return;
      }

      transition({ type: 'authorizationReady' });
      const result = await WebBrowser.openAuthSessionAsync(
        started.authorizeUrl,
        'regentsmobile://',
      );
      if (!ownsAttempt(owner)) {
        dropStaleAttempt(owner);
        return;
      }

      if (result.type !== 'success' || !result.url) {
        finishAttempt(owner);
        transition({ type: 'failed' });
        showAlert({
          title: 'Pairing cancelled',
          message: 'Nothing changed. Try again when you are ready.',
          type: 'info',
        });
        return;
      }

      const callback = parsePortalPairingCallbackUrl(result.url);
      if (callback.kind === 'reject') {
        finishAttempt(owner);
        transition({ type: 'failed' });
        showAlert({
          title: 'Pairing did not finish',
          message: 'Return to Nous Portal and try pairing again.',
          type: 'error',
        });
        return;
      }

      await completePairing(owner, callback);
    } catch (error) {
      if (!ownsAttempt(owner)) {
        dropStaleAttempt(owner);
        return;
      }
      failAttempt(owner, error);
    }
  }, [
    beginOwnedAttempt,
    completePairing,
    dropStaleAttempt,
    failAttempt,
    finishAttempt,
    goToSignIn,
    ownsAttempt,
    showAlert,
    transition,
  ]);

  const disconnect = useCallback(async () => {
    const owner = beginOwnedAttempt();
    if (!owner) {
      goToSignIn();
      return;
    }

    transition({ type: 'disconnect' });
    try {
      const nextStatus = await regentApi.disconnectPortalPairing();
      if (!ownsAttempt(owner)) {
        dropStaleAttempt(owner);
        return;
      }
      setStatus(nextStatus);
      transition({ type: 'disconnected' });
      finishAttempt(owner);
    } catch (error) {
      if (!ownsAttempt(owner)) {
        dropStaleAttempt(owner);
        return;
      }
      failAttempt(owner, error);
    }
  }, [
    beginOwnedAttempt,
    dropStaleAttempt,
    failAttempt,
    finishAttempt,
    goToSignIn,
    ownsAttempt,
    transition,
  ]);

  const busy =
    phase === 'loading' ||
    phase === 'starting' ||
    phase === 'waiting' ||
    phase === 'completing' ||
    phase === 'disconnecting';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable
          pressStyle="icon"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Nous Portal</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <EaseView
          {...getMotionPreset('screen', reducedMotionEnabled)}
          style={styles.introBlock}
        >
          <Text style={styles.title}>Pair your Nous Portal account</Text>
          <Text style={styles.intro}>
            Connect your account to Regents so you can use it across your
            signed-in devices.
          </Text>
        </EaseView>

        <EaseView
          {...getMotionPreset('card', reducedMotionEnabled, 48)}
          style={styles.stepCard}
        >
          {phase === 'paired' && status?.paired ? (
            <>
              <View style={styles.connectedIcon}>
                <Ionicons
                  name="checkmark-circle"
                  size={34}
                  color={colors.success}
                />
              </View>
              <Text style={styles.stepTitle}>Connected</Text>
              <Text style={styles.stepHint}>
                {status.accountLabel
                  ? `${status.accountLabel} is paired with this Regents account.`
                  : 'Your Nous Portal account is paired with this Regents account.'}
              </Text>
              <RegentPressable
                style={styles.secondaryButton}
                disabled={busy}
                onPress={() => void disconnect()}
              >
                <Text style={styles.secondaryButtonText}>Disconnect</Text>
              </RegentPressable>
            </>
          ) : !isSignedIn ? (
            <>
              <Text style={styles.stepLabel}>Step 1</Text>
              <Text style={styles.stepTitle}>Sign in first</Text>
              <Text style={styles.stepHint}>
                Sign in so your Nous Portal account pairs with the right
                Regents account. You will come right back here.
              </Text>
              <RegentPressable
                style={styles.primaryButton}
                onPress={goToSignIn}
              >
                <View style={styles.buttonContent}>
                  <Ionicons
                    name="person-circle-outline"
                    size={18}
                    color={colors.onAccent}
                  />
                  <Text style={styles.primaryButtonText}>Sign in to pair</Text>
                </View>
              </RegentPressable>
            </>
          ) : busy ? (
            <>
              <View style={styles.progressRow}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.stepTitle}>
                  {phase === 'waiting'
                    ? 'Finish in Nous Portal'
                    : phase === 'disconnecting'
                      ? 'Disconnecting…'
                      : phase === 'loading'
                        ? 'Checking your connection…'
                        : 'Pairing…'}
                </Text>
              </View>
              <Text style={styles.stepHint}>
                {phase === 'waiting'
                  ? 'Approve the connection in the window that opened, then return to Regents.'
                  : 'Keep Regents open while this finishes.'}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.stepLabel}>Next step</Text>
              <Text style={styles.stepTitle}>Connect Nous Portal</Text>
              <Text style={styles.stepHint}>
                Nous Portal will open so you can approve the connection. You
                will return here when it is ready.
              </Text>
              <RegentPressable
                style={styles.primaryButton}
                disabled={busy}
                onPress={() => void beginPairing()}
              >
                <View style={styles.buttonContent}>
                  <Ionicons
                    name="link-outline"
                    size={18}
                    color={colors.onAccent}
                  />
                  <Text style={styles.primaryButtonText}>
                    Pair Nous Portal
                  </Text>
                </View>
              </RegentPressable>
            </>
          )}
        </EaseView>
      </ScrollView>

      <CoinbaseAlert {...alertProps} />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius, space, type }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.s5,
      paddingTop: space.s3,
      paddingBottom: space.s2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: colors.text,
      fontSize: type.headline.size,
      fontFamily: fonts.title,
    },
    body: {
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
      gap: space.s4,
    },
    introBlock: { gap: space.s2 },
    title: {
      color: colors.text,
      fontSize: type.title.size,
      lineHeight: type.title.line,
      fontFamily: fonts.title,
    },
    intro: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    stepCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s4,
      gap: space.s3,
    },
    stepLabel: {
      color: colors.accent,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    stepTitle: {
      color: colors.text,
      fontSize: type.headline.size,
      fontFamily: fonts.title,
    },
    stepHint: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    connectedIcon: { alignItems: 'flex-start' },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s2,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s2,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
  });
}
