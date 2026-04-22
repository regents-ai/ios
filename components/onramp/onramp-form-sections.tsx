import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { SwipeToConfirm } from '@/components/ui/SwipeToConfirm';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BLUE, BLUE_WASH, BORDER, CARD_ALT, CARD_BG, DANGER, ORANGE, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

export function FocusPathSection({
  isBaseUsdcPath,
  onPress,
}: {
  isBaseUsdcPath: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.focusCard, isBaseUsdcPath && styles.focusCardActive, pressed && styles.focusPressed]} onPress={onPress}>
      <View style={styles.focusHeader}>
        <View style={styles.focusCopy}>
          <Text style={styles.eyebrow}>Base + USDC</Text>
          <Text style={styles.focusTitle}>Keep the quickest Regents path in view.</Text>
        </View>
        <View style={[styles.badge, isBaseUsdcPath && styles.badgeActive]}>
          <Text style={[styles.badgeText, isBaseUsdcPath && styles.badgeTextActive]}>
            {isBaseUsdcPath ? 'Ready' : 'Use this path'}
          </Text>
        </View>
      </View>
      <Text style={styles.bodyText}>Buy on Base, move USDC faster, and keep cash-out paths easier to reach.</Text>
      <View style={styles.tagRow}>
        {['Base first', 'USDC default', 'Fewer steps'].map(tag => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export function EnvironmentSection({
  isGuestCheckout,
  localSandboxEnabled,
  onToggleSandbox,
}: {
  isGuestCheckout: boolean;
  localSandboxEnabled: boolean;
  onToggleSandbox: (value: boolean) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>{localSandboxEnabled ? 'Sandbox Environment' : 'Production Environment'}</Text>
        <Switch
          value={localSandboxEnabled}
          onValueChange={onToggleSandbox}
          trackColor={{ true: BLUE, false: BORDER }}
          thumbColor={Platform.OS === 'android' ? (localSandboxEnabled ? '#ffffff' : '#f4f3f4') : undefined}
        />
      </View>
      <Text style={styles.helper}>
        {localSandboxEnabled ? 'Test without real transactions' : 'Real transactions will be executed'}
      </Text>
      {localSandboxEnabled && isGuestCheckout ? (
        <Text style={[styles.helper, styles.helperTight]}>Test checkout will finish without moving real money.</Text>
      ) : null}
    </View>
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
  localSandboxEnabled,
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
  localSandboxEnabled: boolean;
  onAmountChange: (value: string) => void;
  onOpenPaymentCurrencyPicker: () => void;
  paymentCurrency: string;
  quoteDisclaimer?: string | null;
  userLimits: { weekly: any; lifetime: any } | null;
}) {
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Buy</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={amount}
            onChangeText={onAmountChange}
            placeholder="0"
            placeholderTextColor={TEXT_SECONDARY}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
          <Pressable style={styles.selectChip} onPress={onOpenPaymentCurrencyPicker}>
            <Text style={styles.selectChipText}>{paymentCurrency}</Text>
            <Ionicons name="chevron-down" size={16} color={TEXT_SECONDARY} />
          </Pressable>
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
            {userLimits && !localSandboxEnabled ? (
              <Text style={styles.helper}>
                Remaining limit: ${userLimits.weekly.remaining}/{userLimits.weekly.limit} {userLimits.weekly.currency} this week • {userLimits.lifetime.remaining}/{userLimits.lifetime.limit} purchases left
              </Text>
            ) : null}
            {isLoadingLimits && !localSandboxEnabled ? (
              <Text style={[styles.helper, { fontStyle: 'italic' }]}>Loading your limits...</Text>
            ) : null}
            {limits ? <Text style={[styles.helper, styles.helperTight]}>Test purchases are capped at $5 per transaction.</Text> : null}
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
            <Text style={styles.receiveAmount}>{currentQuote?.purchase_amount?.value || '0'}</Text>
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
  return (
    <View style={[styles.quoteLine, total && styles.quoteTotalLine]}>
      <Text style={total ? styles.quoteTotalLabel : styles.quoteLabel}>{label}</Text>
      <Text style={total ? styles.quoteTotalValue : styles.quoteValue}>{value}</Text>
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
  return (
    <View style={styles.card}>
      <Pressable style={styles.selectChipLarge} onPress={onOpenAssetPicker}>
        <View style={styles.selectContent}>
          {assetIconUrl ? <Image source={{ uri: assetIconUrl }} style={styles.coinIcon} /> : null}
          <Text style={styles.selectText}>{asset}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={TEXT_SECONDARY} />
      </Pressable>
      <Text style={styles.helper}>
        {isBaseUsdcPath
          ? 'This keeps your default buy path on Base with USDC.'
          : 'Base + USDC is the quickest path for most Regents wallet tasks.'}
      </Text>
      <View style={[styles.rowBetween, styles.dividerTop]}>
        <Text style={styles.label}>Network</Text>
        <Pressable style={styles.selectChipLarge} onPress={onOpenNetworkPicker}>
          <View style={styles.selectContent}>
            {networkIconUrl ? <Image source={{ uri: networkIconUrl }} style={styles.coinIcon} /> : null}
            <Text style={styles.selectText}>{network}</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={TEXT_SECONDARY} />
        </Pressable>
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
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Pay with</Text>
        <Pressable style={styles.selectChipLarge} onPress={onOpenPaymentPicker}>
          <Text style={styles.selectText}>{paymentMethodLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={TEXT_SECONDARY} />
        </Pressable>
      </View>
    </View>
  );
}

export function EligibilityNoticeSection({ notices }: { notices: { title: string; message: string; tone?: 'warning' | 'error' | 'info' }[] }) {
  if (!notices.length) {
    return null;
  }

  return (
    <>
      {notices.map(notice => {
        const toneStyles =
          notice.tone === 'error'
            ? { borderColor: DANGER, backgroundColor: `${DANGER}08`, icon: 'alert-circle', color: DANGER }
            : notice.tone === 'warning'
              ? { borderColor: ORANGE, backgroundColor: `${ORANGE}08`, icon: 'warning', color: ORANGE }
              : { borderColor: BLUE, backgroundColor: `${BLUE}08`, icon: 'information-circle', color: BLUE };

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
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Location</Text>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Country</Text>
        <Pressable style={styles.selectChipLarge} onPress={onOpenCountryPicker}>
          <Text style={styles.selectText}>{country}</Text>
          <Ionicons name="chevron-down" size={16} color={TEXT_SECONDARY} />
        </Pressable>
      </View>
      {country === 'US' ? (
        <View style={[styles.rowBetween, styles.helperTight]}>
          <Text style={styles.label}>Subdivision</Text>
          <Pressable style={styles.selectChipLarge} onPress={onOpenSubdivisionPicker}>
            <Text style={styles.selectText}>{subdivision || 'Select'}</Text>
            <Ionicons name="chevron-down" size={16} color={TEXT_SECONDARY} />
          </Pressable>
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
  return (
    <>
      <SwipeToConfirm
        label={isBaseUsdcPath ? 'Swipe to buy USDC' : 'Swipe to buy'}
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  focusCard: {
    backgroundColor: BLUE_WASH,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 12,
  },
  focusCardActive: {
    backgroundColor: CARD_BG,
  },
  focusPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.97,
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
    color: TEXT_PRIMARY,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: FONTS.heading,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  badgeActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  badgeText: {
    color: BLUE,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  badgeTextActive: {
    color: WHITE,
  },
  bodyText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONTS.body,
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
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tagText: {
    color: TEXT_PRIMARY,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.body,
  },
  helper: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  helperTight: {
    marginTop: 4,
  },
  sectionTitle: {
    color: BLUE,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    color: TEXT_PRIMARY,
    padding: 0,
    fontFamily: FONTS.heading,
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_ALT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 8,
    minHeight: 44,
  },
  selectChipLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_ALT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 8,
    minHeight: 48,
    flex: 1,
    justifyContent: 'space-between',
  },
  selectChipText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  receiveRow: {
    minHeight: 40,
    justifyContent: 'center',
  },
  receiveAmount: {
    fontSize: 32,
    color: TEXT_PRIMARY,
    fontFamily: FONTS.heading,
  },
  quoteLoading: {
    gap: 6,
  },
  pulse: {
    height: 12,
    borderRadius: 999,
    backgroundColor: CARD_ALT,
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
    backgroundColor: CARD_ALT,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
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
    borderTopColor: BORDER,
  },
  quoteLabel: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  quoteValue: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  quoteTotalLabel: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  quoteTotalValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  noticeCard: {
    backgroundColor: `${BLUE}10`,
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.body,
  },
  selectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  selectText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  coinIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dividerTop: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  alertCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
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
    fontFamily: FONTS.heading,
  },
  alertText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  termsBlock: {
    marginBottom: 8,
    paddingTop: 2,
  },
  termsText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  termsLink: {
    color: BLUE,
    fontFamily: FONTS.body,
  },
  errorText: {
    color: DANGER,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
});
