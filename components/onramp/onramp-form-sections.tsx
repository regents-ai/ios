import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { SwipeToConfirm } from '@/components/ui/SwipeToConfirm';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

export function FocusPathSection({
  isBaseUsdcPath,
  onPress,
}: {
  isBaseUsdcPath: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <RegentPressable haptic="selection" pressStyle="card" style={[styles.focusCard, isBaseUsdcPath && styles.focusCardActive]} onPress={onPress}>
      <View style={styles.focusHeader}>
        <View style={styles.focusCopy}>
          <Text style={styles.eyebrow}>Apple Pay to USDC on Base</Text>
          <Text style={styles.focusTitle}>Fund an agent working balance.</Text>
        </View>
        <View style={[styles.badge, isBaseUsdcPath && styles.badgeActive]}>
          <Text style={[styles.badgeText, isBaseUsdcPath && styles.badgeTextActive]}>
            {isBaseUsdcPath ? 'Ready' : 'Use this path'}
          </Text>
        </View>
      </View>
      <Text style={styles.bodyText}>Add USDC, then send it to an agent for tools, services, and work.</Text>
      <View style={styles.tagRow}>
        {['Apple Pay', 'USDC on Base', 'Agent budget'].map(tag => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </RegentPressable>
  );
}

export function AmountQuoteSection({
  amount,
  amountError,
  currentQuote,
  isApplePay,
  isGooglePay,
  isLoadingLimits,
  isLoadingQuote,
  isValidAmount,
  limits,
  onAmountChange,
  onOpenPaymentCurrencyPicker,
  paymentCurrency,
  quoteDisclaimer,
  userLimits,
}: {
  amount: string;
  amountError: string | null;
  currentQuote: any;
  isApplePay: boolean;
  isGooglePay: boolean;
  isLoadingLimits: boolean;
  isLoadingQuote: boolean;
  isValidAmount: boolean;
  limits: any;
  onAmountChange: (value: string) => void;
  onOpenPaymentCurrencyPicker: () => void;
  paymentCurrency: string;
  quoteDisclaimer?: string | null;
  userLimits: { weekly: any; lifetime: any } | null;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [amountFocused, setAmountFocused] = React.useState(false);
  const receiveAmount = currentQuote?.purchase_amount?.value || '0';

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add funds</Text>
        <View style={[styles.inputRow, amountFocused && styles.inputRowFocused]}>
          <TextInput
            value={amount}
            onChangeText={onAmountChange}
            onBlur={() => setAmountFocused(false)}
            onFocus={() => setAmountFocused(true)}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            selectionColor={colors.accent}
            style={styles.amountInput}
          />
          <RegentPressable haptic="selection" pressStyle="chip" style={styles.selectChip} onPress={onOpenPaymentCurrencyPicker}>
            <Text style={styles.selectChipText}>{paymentCurrency}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </RegentPressable>
        </View>
        {amountError ? (
          <Text style={styles.errorText}>{amountError}</Text>
        ) : (
          <View>
            {limits ? (
              <Text style={styles.helper}>
                {isApplePay ? 'Apple Pay limit: ' : isGooglePay ? 'Google Pay limit: ' : 'Current limit: '}
                {limits.display}
              </Text>
            ) : null}
            {userLimits ? (
              <Text style={styles.helper}>
                Remaining limit: ${userLimits.weekly.remaining}/{userLimits.weekly.limit} {userLimits.weekly.currency} this week • {userLimits.lifetime.remaining}/{userLimits.lifetime.limit} purchases left
              </Text>
            ) : null}
            {isLoadingLimits ? (
              <Text style={[styles.helper, { fontStyle: 'italic' }]}>Loading your limits...</Text>
            ) : null}
            {limits ? <Text style={[styles.helper, styles.helperTight]}>Purchases must stay within the limit shown above.</Text> : null}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Receive</Text>
        <View style={styles.receiveRow}>
          {isLoadingQuote ? (
            <View style={styles.quoteLoading}>
              <View style={[styles.pulse, styles.pulseWide]} />
              <View style={[styles.pulse, styles.pulseShort]} />
            </View>
          ) : (
            <LiveValueFlash value={`receive-${receiveAmount}`} nudge style={styles.receiveFlash}>
              <Text style={styles.receiveAmount}>{receiveAmount}</Text>
            </LiveValueFlash>
          )}
        </View>

        {isLoadingQuote && !currentQuote && isValidAmount ? (
          <View style={styles.quoteCard}>
            <Text style={styles.helper}>Refreshing your estimate…</Text>
            {[0, 1, 2].map(index => (
              <View key={index} style={styles.quoteLine}>
                <View style={[styles.pulse, index === 2 ? styles.pulseMedium : styles.pulseShort]} />
                <View style={[styles.pulse, styles.pulseShort]} />
              </View>
            ))}
          </View>
        ) : null}

        {currentQuote ? (
          <>
            <View style={styles.quoteCard}>
              <QuoteRow label="Purchase amount" value={`$${currentQuote.payment_subtotal?.value || currentQuote.paymentSubtotal?.value || '0'}`} />
              <QuoteRow label="Coinbase fee" value={`$${currentQuote.coinbase_fee?.value || currentQuote.coinbaseFee?.value || '0'}`} />
              <QuoteRow label="Network fee" value={`$${currentQuote.network_fee?.value || currentQuote.networkFee?.value || '0'}`} />
              <QuoteRow label="Total" value={`$${currentQuote.payment_total?.value || currentQuote.paymentTotal?.value || '0'}`} total />
            </View>
            {quoteDisclaimer ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>{quoteDisclaimer}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </>
  );
}

function QuoteRow({ label, total, value }: { label: string; total?: boolean; value: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[styles.quoteLine, total && styles.quoteTotalLine]}>
      <Text style={total ? styles.quoteTotalLabel : styles.quoteLabel}>{label}</Text>
      <LiveValueFlash value={`${label}-${value}`} nudge={total} style={styles.quoteValueFlash}>
        <Text style={total ? styles.quoteTotalValue : styles.quoteValue}>{value}</Text>
      </LiveValueFlash>
    </View>
  );
}

export function AssetNetworkSection({
  asset,
  assetIconUrl,
  isBaseUsdcPath,
  network,
  networkIconUrl,
  onOpenAssetPicker,
  onOpenNetworkPicker,
}: {
  asset: string;
  assetIconUrl?: string | null;
  isBaseUsdcPath: boolean;
  network: string;
  networkIconUrl?: string | null;
  onOpenAssetPicker: () => void;
  onOpenNetworkPicker: () => void;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <RegentPressable haptic="selection" pressStyle="chip" style={styles.selectChipLarge} onPress={onOpenAssetPicker}>
        <View style={styles.selectContent}>
          {assetIconUrl ? <Image source={{ uri: assetIconUrl }} style={styles.coinIcon} /> : null}
          <Text style={styles.selectText}>{asset}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </RegentPressable>
      <Text style={styles.helper}>
        {isBaseUsdcPath
          ? 'This keeps your agent funding path on Base with USDC.'
          : 'Base USDC is the quickest path for most agent payments.'}
      </Text>
      <View style={[styles.rowBetween, styles.dividerTop]}>
        <Text style={styles.label}>Network</Text>
        <RegentPressable haptic="selection" pressStyle="chip" style={styles.selectChipLarge} onPress={onOpenNetworkPicker}>
          <View style={styles.selectContent}>
            {networkIconUrl ? <Image source={{ uri: networkIconUrl }} style={styles.coinIcon} /> : null}
            <Text style={styles.selectText}>{network}</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </RegentPressable>
      </View>
    </View>
  );
}

export function PaymentMethodSection({
  paymentMethodLabel,
  onOpenPaymentPicker,
}: {
  onOpenPaymentPicker: () => void;
  paymentMethodLabel: string;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Pay with</Text>
        <RegentPressable haptic="selection" pressStyle="chip" style={styles.selectChipLarge} onPress={onOpenPaymentPicker}>
          <Text style={styles.selectText}>{paymentMethodLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </RegentPressable>
      </View>
    </View>
  );
}

export function EligibilityNoticeSection({ notices }: { notices: { title: string; message: string; tone?: 'warning' | 'error' | 'info' }[] }) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (!notices.length) {
    return null;
  }

  return (
    <>
      {notices.map(notice => {
        const toneStyles =
          notice.tone === 'error'
            ? { borderColor: colors.error, backgroundColor: colors.errorWash, icon: 'alert-circle', color: colors.error }
            : notice.tone === 'warning'
              ? { borderColor: colors.warning, backgroundColor: colors.warningWash, icon: 'warning', color: colors.warning }
              : { borderColor: colors.accent, backgroundColor: colors.accentWash, icon: 'information-circle', color: colors.accent };

        return (
          <View key={`${notice.title}-${notice.message}`} style={[styles.alertCard, { borderLeftColor: toneStyles.borderColor, backgroundColor: toneStyles.backgroundColor }]}>
            <View style={styles.alertHeader}>
              <Ionicons name={toneStyles.icon as any} size={20} color={toneStyles.color} />
              <Text style={[styles.alertTitle, { color: toneStyles.color }]}>{notice.title}</Text>
            </View>
            <Text style={styles.alertText}>{notice.message}</Text>
          </View>
        );
      })}
    </>
  );
}

export function LocationSection({
  country,
  subdivision,
  onOpenCountryPicker,
  onOpenSubdivisionPicker,
}: {
  country: string;
  subdivision: string;
  onOpenCountryPicker: () => void;
  onOpenSubdivisionPicker: () => void;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Location</Text>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Country</Text>
        <RegentPressable haptic="selection" pressStyle="chip" style={styles.selectChipLarge} onPress={onOpenCountryPicker}>
          <Text style={styles.selectText}>{country}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </RegentPressable>
      </View>
      {country === 'US' ? (
        <View style={[styles.rowBetween, styles.helperTight]}>
          <Text style={styles.label}>Subdivision</Text>
          <RegentPressable haptic="selection" pressStyle="chip" style={styles.selectChipLarge} onPress={onOpenSubdivisionPicker}>
            <Text style={styles.selectText}>{subdivision || 'Select'}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </RegentPressable>
        </View>
      ) : null}
    </View>
  );
}

export function ConfirmationSection({
  disabled,
  footerContent,
  isBaseUsdcPath,
  isLoading,
  onOpenGuestCheckoutTerms,
  onOpenPrivacyPolicy,
  onOpenUserAgreement,
  onSwipeConfirm,
  onSwipeEnd,
  onSwipeStart,
}: {
  disabled: boolean;
  footerContent?: React.ReactNode;
  isBaseUsdcPath: boolean;
  isLoading: boolean;
  onOpenGuestCheckoutTerms: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenUserAgreement: () => void;
  onSwipeConfirm: (reset: () => void) => void;
  onSwipeEnd: () => void;
  onSwipeStart: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <>
      <SwipeToConfirm
        label={isBaseUsdcPath ? 'Swipe to add USDC' : 'Swipe to add funds'}
        disabled={disabled}
        onConfirm={onSwipeConfirm}
        isLoading={isLoading}
        onSwipeStart={onSwipeStart}
        onSwipeEnd={onSwipeEnd}
      />
      <View style={styles.termsBlock}>
        <Text style={styles.termsText}>
          By proceeding, I agree to Coinbase&apos;s{' '}
          <Text style={styles.termsLink} onPress={onOpenGuestCheckoutTerms}>Guest Checkout Terms</Text>,{' '}
          <Text style={styles.termsLink} onPress={onOpenUserAgreement}>User Agreement</Text>, and{' '}
          <Text style={styles.termsLink} onPress={onOpenPrivacyPolicy}>Privacy Policy</Text>
        </Text>
      </View>
      {footerContent}
    </>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    padding: 16,
    gap: 12,
  },
  focusCard: {
    backgroundColor: colors.accentWash,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    padding: 18,
    gap: 12,
  },
  focusCardActive: {
    backgroundColor: colors.surfaceElevated,
  },
  focusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  focusCopy: {
    flex: 1,
    gap: 4,
  },
  focusTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: fonts.title,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.title,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  badgeActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: fonts.ui,
  },
  badgeTextActive: {
    color: colors.onAccent,
  },
  bodyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  tagText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.ui,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.ui,
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.ui,
  },
  helperTight: {
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.title,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputRowFocused: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    color: colors.text,
    padding: 0,
    fontFamily: fonts.title,
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 8,
    minHeight: 44,
  },
  selectChipLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 8,
    minHeight: 48,
    flex: 1,
    justifyContent: 'space-between',
  },
  selectChipText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  receiveRow: {
    minHeight: 40,
    justifyContent: 'center',
  },
  receiveFlash: {
    alignSelf: 'flex-start',
  },
  receiveAmount: {
    fontSize: 32,
    color: colors.text,
    fontFamily: fonts.title,
  },
  quoteLoading: {
    gap: 6,
  },
  pulse: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  pulseWide: {
    width: 112,
    height: 16,
  },
  pulseMedium: {
    width: 88,
  },
  pulseShort: {
    width: 56,
  },
  quoteCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    gap: 10,
  },
  quoteLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteTotalLine: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineStrong,
  },
  quoteLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.ui,
    flexShrink: 1,
    paddingRight: 12,
  },
  quoteValue: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
    textAlign: 'right',
  },
  quoteTotalLabel: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.title,
    flexShrink: 1,
    paddingRight: 12,
  },
  quoteTotalValue: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.title,
    textAlign: 'right',
  },
  quoteValueFlash: {
    alignSelf: 'flex-end',
    maxWidth: '55%',
  },
  noticeCard: {
    backgroundColor: colors.accentWash,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.ui,
  },
  selectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  selectText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  coinIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dividerTop: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineStrong,
  },
  alertCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderLeftWidth: 4,
    gap: 8,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitle: {
    fontSize: 15,
    fontFamily: fonts.title,
  },
  alertText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.ui,
  },
  termsBlock: {
    marginBottom: 8,
    paddingTop: 2,
  },
  termsText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.ui,
  },
  termsLink: {
    color: colors.accent,
    fontFamily: fonts.ui,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    fontFamily: fonts.ui,
  },
  });
}
