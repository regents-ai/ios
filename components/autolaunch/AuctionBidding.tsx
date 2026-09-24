/**
 * Bidding on a Base auction from the auction detail screen: the bid form
 * with its review step, and the wallet's bids with what collecting each
 * would do right now.
 *
 * Bidding follows the live treasury check the Autolaunch website runs at
 * every bid press. The screen asks the website when it opens (to decide
 * whether to show the bid form), again when the bidder opens the review, and
 * again when they press Place bid, right before the wallet is asked to sign.
 * If any of those answers is not a pass, the bid form and review give way to
 * a notice pointing to the website, and that press does not reach the
 * wallet. This is the one check that holds a bid back, by the founder's
 * decision. Collecting a bid needs no treasury check, on the website or here.
 *
 * Otherwise only invalid input or an auction state that makes the call
 * impossible holds a button back, and the screen says why. Every other press
 * reaches the wallet; the auction decides the outcome, including a repeat
 * press while an earlier one is still pending. After a send, the screen follows
 * the wallet's own report of the operation and says whether it went
 * through; nothing about a send is stored.
 */

import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { AddUsdcToPay } from '@/components/wallet/AddUsdcToPay';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { CoinbaseAlertInput } from '@/hooks/useCoinbaseAlert';
import type {
  AutolaunchAuctionPosition,
  AutolaunchBaseAuction,
  AutolaunchBidPosition,
  AutolaunchBidQuote,
} from '@/types/autolaunch';
import { describeApiError } from '@/utils/apiError';
import { createLatestRequestGate } from '@/utils/async/latestRequestGate';
import { compactDecimal } from '@/utils/autolaunch/auctionDisplay';
import { checkAutolaunchTreasury } from '@/utils/autolaunch/treasuryCheck';
import {
  getAutolaunchPosition,
  prepareAutolaunchBid,
  prepareAutolaunchSettlement,
} from '@/utils/autolaunch/bidApi';
import { quoteAutolaunchBid } from '@/utils/autolaunch/client';
import { autolaunchNetworkForChain, autolaunchWalletCalls } from '@/utils/onchain/autolaunchWalletAction';
import { routes } from '@/utils/navigation/routes';
import { isBaseUsdc } from '@/utils/onchain/baseUsdc';
import {
  dismissToast,
  resolveToastSuccess,
  showProgressToast,
  type ProgressToastState,
} from '@/utils/progressToast';
import { useCurrentUser, useSendUserOperation } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

const ESTIMATE_DELAY_MS = 400;

type ToastSetter = (update: (current: ProgressToastState | null) => ProgressToastState | null) => void;

type Props = {
  auction: AutolaunchBaseAuction;
  showAlert: (input: CoinbaseAlertInput) => void;
  setToast: ToastSetter;
  openOnAutolaunch: () => void;
};

/** What the last send was for, so the wallet's report of it reads as a bid or a collection. */
type SentOperation = { hash: string; kind: 'bid' | 'collect' };

/** What the latest treasury check said, which decides whether bidding is offered. */
type TreasuryState = 'checking' | 'passed' | 'failed';

const SEND_COPY: Record<SentOperation['kind'], { waiting: string; done: string; failed: string }> = {
  bid: { waiting: 'Placing your bid...', done: 'Bid placed', failed: "Your bid didn't go through" },
  collect: { waiting: 'Collecting...', done: 'Collected', failed: "Collecting didn't go through" },
};

function smartWalletAddress(value?: string | null): `0x${string}` | null {
  const trimmed = value?.trim();
  return trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? (trimmed as `0x${string}`) : null;
}

function positiveDecimal(value: string) {
  return /^\d+(\.\d+)?$/.test(value.trim()) && Number.parseFloat(value) > 0;
}

function amountWords(value: string, symbol: string | null) {
  return symbol ? `${compactDecimal(value)} ${symbol}` : compactDecimal(value);
}

function phaseCopy(position: AutolaunchAuctionPosition) {
  switch (position.phase) {
    case 'not_started':
      return 'Bidding has not started yet.';
    case 'open':
      return null;
    case 'ended':
      return 'Bidding has ended. Bids can be collected a few minutes after the close.';
    case 'claimable':
      switch (position.graduated) {
        case true:
          return 'Bidding has ended and the launch raised its minimum. Winning bids collect their tokens; unspent bids get their money back.';
        case false:
          return 'Bidding has ended without reaching its minimum. Every bid gets its money back.';
        case null:
          return 'Bidding has ended. Collect each bid to see what it brings back.';
      }
  }
}

function settlementReasonCopy(bid: AutolaunchBidPosition) {
  switch (bid.settlement.reason) {
    case 'auction_open':
      return 'Collecting opens when bidding ends.';
    case 'auction_not_ended':
      return 'The auction has not ended yet.';
    case 'auction_not_started':
      return 'The auction has not started yet.';
    case 'already_returned':
      return 'This bid has already been returned.';
    case 'bid_needs_partial_exit':
      return 'This bid needs a partial return that is not available yet.';
    case 'claim_not_open':
      return 'Tokens cannot be collected yet.';
    case 'nothing_to_claim':
      return bid.returned ? 'This bid has been returned and has no tokens to collect.' : 'This bid has no tokens to collect.';
    case 'bid_not_returned':
      return 'This bid has to be returned before its tokens can be collected.';
    case 'partial_exit_unavailable':
      return 'The auction could not confirm the return for this bid right now.';
    case 'settlement_reverted':
      return 'The auction refused this step right now.';
    case null:
      return null;
  }
}

function collectLabel(bid: AutolaunchBidPosition, symbol: string | null) {
  const { steps } = bid.settlement;
  if (steps.includes('exit') && steps.includes('claim')) {
    return 'Collect tokens and unspent money';
  }
  if (steps.includes('claim')) {
    return 'Collect tokens';
  }
  return symbol ? `Get unspent ${symbol} back` : 'Get unspent money back';
}

function nonZero(value: string | null) {
  return value !== null && Number.parseFloat(value) > 0 ? value : null;
}

function collectOutcome(bid: AutolaunchBidPosition, currency: string | null, token: string | null) {
  const parts: string[] = [];
  const tokens = nonZero(bid.settlement.tokens_claimed);
  const refund = nonZero(bid.settlement.currency_refunded);
  if (tokens) {
    parts.push(`${amountWords(tokens, token)} to collect`);
  }
  if (refund) {
    parts.push(`${amountWords(refund, currency)} back`);
  }
  return parts.join(' · ');
}

export function AuctionBidding({ auction, showAlert, setToast, openOnAutolaunch }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { currentUser } = useCurrentUser();
  const { sendUserOperation, status: userOpStatus, data: userOpData, error: userOpError } = useSendUserOperation();
  const smartAccount = smartWalletAddress(currentUser?.evmSmartAccounts?.[0] as string | undefined);

  const [position, setPosition] = useState<AutolaunchAuctionPosition | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [quote, setQuote] = useState<AutolaunchBidQuote | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'unavailable'>('idle');
  const [treasury, setTreasury] = useState<TreasuryState>('checking');
  const treasuryGate = useMemo(() => createLatestRequestGate(), []);
  // The last operation this screen sent, for the feedback that follows it.
  const sentRef = useRef<SentOperation | null>(null);
  const lastHandledUserOpRef = useRef<string | null>(null);

  const currencySymbol = auction.quote_token.symbol;
  const tokenSymbol = auction.token_symbol;

  const loadPosition = useCallback(async () => {
    if (!smartAccount) {
      setPosition(null);
      return;
    }

    try {
      setPositionLoading(true);
      setPosition(await getAutolaunchPosition({ auctionId: auction.id, walletAddress: smartAccount }));
      setPositionError(null);
    } catch (error) {
      setPositionError(describeApiError(error).message);
    } finally {
      setPositionLoading(false);
    }
  }, [auction.id, smartAccount]);

  // Asks the website afresh every time. The screen follows the newest answer;
  // the caller acts on its own answer.
  const runTreasuryCheck = useCallback(async () => {
    const request = treasuryGate.next();
    const { ok } = await checkAutolaunchTreasury(auction.id);
    if (treasuryGate.isLatest(request)) {
      setTreasury(ok ? 'passed' : 'failed');
      if (!ok) {
        setReviewing(false);
      }
    }
    return ok;
  }, [auction.id, treasuryGate]);

  useFocusEffect(
    useCallback(() => {
      void loadPosition();
      void runTreasuryCheck();
    }, [loadPosition, runTreasuryCheck])
  );

  // The wallet reports on the last operation it sent; each report is acted
  // on once, then the position is read again so the bids card catches up.
  useEffect(() => {
    const transitionKey = `${userOpStatus}:${userOpData?.userOpHash ?? ''}`;
    if (lastHandledUserOpRef.current === transitionKey) {
      return;
    }
    lastHandledUserOpRef.current = transitionKey;

    const sent = sentRef.current;
    if (!sent || (userOpData?.userOpHash && userOpData.userOpHash !== sent.hash)) {
      return;
    }
    const copy = SEND_COPY[sent.kind];

    if (userOpStatus === 'success') {
      sentRef.current = null;
      setToast((current) => resolveToastSuccess(current, copy.done, Date.now()));
      void loadPosition();
    } else if (userOpStatus === 'error') {
      sentRef.current = null;
      setToast(() => dismissToast());
      showAlert({ title: copy.failed, message: describeApiError(userOpError).message, type: 'error' });
      void loadPosition();
    }
  }, [loadPosition, setToast, showAlert, userOpData, userOpError, userOpStatus]);

  const hasAmount = positiveDecimal(amount);
  const maxPriceGiven = maxPrice.trim() !== '';
  const hasMaxPrice = positiveDecimal(maxPrice);
  const quoteMaxPrice = hasMaxPrice ? maxPrice.trim() : null;

  // The site's estimate follows the form with a short pause, so a bidder
  // typing an amount sees one answer rather than one per keystroke.
  useEffect(() => {
    if (!hasAmount || !quoteMaxPrice) {
      setQuote(null);
      setQuoteState('idle');
      return;
    }

    let current = true;
    setQuoteState('loading');
    const timer = setTimeout(() => {
      quoteAutolaunchBid({ auctionId: auction.id, amount: amount.trim(), maxPrice: quoteMaxPrice })
        .then((result) => {
          if (current) {
            setQuote(result);
            setQuoteState('idle');
          }
        })
        .catch(() => {
          if (current) {
            setQuote(null);
            setQuoteState('unavailable');
          }
        });
    }, ESTIMATE_DELAY_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [amount, auction.id, hasAmount, quoteMaxPrice]);

  const openReview = useCallback(async () => {
    setToast(() => showProgressToast('Checking this auction...'));
    const ok = await runTreasuryCheck();
    setToast(() => dismissToast());
    if (ok) {
      setReviewing(true);
    }
  }, [runTreasuryCheck, setToast]);

  const placeBid = useCallback(async () => {
    if (!smartAccount) {
      return;
    }

    try {
      setToast(() => showProgressToast('Opening bid review...'));
      const walletAction = await prepareAutolaunchBid({
        auctionId: auction.id,
        walletAddress: smartAccount,
        amount: amount.trim(),
        maxPrice: maxPrice.trim(),
      });

      if (!(await runTreasuryCheck())) {
        setToast(() => dismissToast());
        return;
      }

      const { userOperationHash } = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: autolaunchNetworkForChain(walletAction.chain_id),
        calls: autolaunchWalletCalls(walletAction, smartAccount),
        useCdpPaymaster: false,
      });

      sentRef.current = { hash: userOperationHash, kind: 'bid' };
      setToast(() => showProgressToast(SEND_COPY.bid.waiting));
      setAmount('');
      setMaxPrice('');
      setReviewing(false);
    } catch (error) {
      setToast(() => dismissToast());
      const failure = describeApiError(error);
      showAlert({ title: failure.title, message: failure.message, type: 'error' });
    }
  }, [amount, auction.id, maxPrice, runTreasuryCheck, sendUserOperation, setToast, showAlert, smartAccount]);

  const collectBid = useCallback(
    async (bid: AutolaunchBidPosition) => {
      if (!smartAccount) {
        return;
      }

      try {
        setToast(() => showProgressToast('Opening collection...'));
        const walletAction = await prepareAutolaunchSettlement({
          auctionId: auction.id,
          walletAddress: smartAccount,
          bidId: bid.bid_id,
        });

        const { userOperationHash } = await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: autolaunchNetworkForChain(walletAction.chain_id),
          calls: autolaunchWalletCalls(walletAction, smartAccount),
          useCdpPaymaster: false,
        });

        sentRef.current = { hash: userOperationHash, kind: 'collect' };
        setToast(() => showProgressToast(SEND_COPY.collect.waiting));
      } catch (error) {
        setToast(() => dismissToast());
        const failure = describeApiError(error);
        showAlert({ title: failure.title, message: failure.message, type: 'error' });
      }
    },
    [auction.id, sendUserOperation, setToast, showAlert, smartAccount]
  );

  const bidsInBaseUsdc = isBaseUsdc(auction.chain_id, auction.quote_token.address);

  if (!smartAccount) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Take part</Text>
        {bidsInBaseUsdc ? (
          <>
            <Text style={styles.sectionBody}>Bids are placed from your phone wallet. Add USDC to it, then come back here.</Text>
            <RegentPressable style={styles.primaryButton} onPress={() => router.push(routes.addUsdc())}>
              <Text style={styles.primaryButtonText}>Add USDC</Text>
            </RegentPressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionBody}>Bids are placed from your phone wallet. Open Wallet first, then come back here.</Text>
            <RegentPressable style={styles.primaryButton} onPress={() => router.push('/wallet')}>
              <Text style={styles.primaryButtonText}>Open Wallet</Text>
            </RegentPressable>
          </>
        )}
      </View>
    );
  }

  const balanceWords = position ? amountWords(position.wallet_currency_balance, currencySymbol) : null;
  const biddingOpen = auction.state === 'active' && position?.phase === 'open';
  const stateCopy = position ? phaseCopy(position) : null;
  const estimateCopy = estimateWords(quote, quoteState, tokenSymbol);
  const canReview = hasAmount && hasMaxPrice;
  const addUsdcOffer =
    position && bidsInBaseUsdc && hasAmount ? (
      <AddUsdcToPay held={position.wallet_currency_balance} needed={amount.trim()} />
    ) : null;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.sectionTitle}>Place a bid</Text>
          {positionLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>

        {positionError ? <Text style={styles.warningText}>{positionError}</Text> : null}

        {position && !biddingOpen ? <Text style={styles.sectionBody}>{stateCopy ?? 'Bidding is closed.'}</Text> : null}

        {position && biddingOpen && treasury === 'checking' ? (
          <Text style={styles.sectionBody}>Checking whether you can bid from the app...</Text>
        ) : null}

        {position && biddingOpen && treasury === 'failed' ? (
          <>
            <Text style={styles.sectionBody}>
              Bidding from the app isn&apos;t available for this auction right now. You can bid on autolaunch.sh.
            </Text>
            <RegentPressable
              accessibilityHint="Opens in your browser"
              accessibilityRole="link"
              style={styles.primaryButton}
              onPress={openOnAutolaunch}
            >
              <Ionicons name="open-outline" size={16} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>Open on Autolaunch</Text>
            </RegentPressable>
          </>
        ) : null}

        {position && biddingOpen && treasury === 'passed' && !reviewing ? (
          <>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Amount{currencySymbol ? ` in ${currencySymbol}` : ''}</Text>
              {balanceWords ? (
                <LiveValueFlash value={`balance-${balanceWords}`}>
                  <Text style={styles.fieldHint}>{balanceWords} in wallet</Text>
                </LiveValueFlash>
              ) : null}
            </View>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
              accessibilityLabel="Bid amount"
            />
            {addUsdcOffer}

            <Text style={styles.fieldLabel}>Most to pay per token{currencySymbol ? ` in ${currencySymbol}` : ''}</Text>
            <TextInput
              value={maxPrice}
              onChangeText={setMaxPrice}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
              accessibilityLabel="Maximum price per token"
            />
            <Text style={styles.fieldHint}>Your bid only counts while the auction price is at or below this figure.</Text>
            {!maxPriceGiven ? (
              <Text style={styles.fieldHint}>Enter the most you will pay per token to review your bid.</Text>
            ) : !hasMaxPrice ? (
              <Text style={styles.warningText}>Enter the maximum as a plain number above zero.</Text>
            ) : null}

            {estimateCopy ? <Text style={styles.estimateText}>{estimateCopy}</Text> : null}

            <RegentPressable
              style={[styles.primaryButton, !canReview && styles.disabledButton]}
              disabled={!canReview}
              onPress={() => void openReview()}
            >
              <Text style={styles.primaryButtonText}>Review bid</Text>
            </RegentPressable>
            {!hasAmount ? <Text style={styles.fieldHint}>Enter an amount to review your bid.</Text> : null}
          </>
        ) : null}

        {position && biddingOpen && treasury === 'passed' && reviewing ? (
          <>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>You bid</Text>
              <Text style={styles.reviewValue}>{amountWords(amount.trim(), currencySymbol)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Most to pay per token</Text>
              <Text style={styles.reviewValue}>{amountWords(maxPrice.trim(), currencySymbol)}</Text>
            </View>
            {estimateCopy ? <Text style={styles.estimateText}>{estimateCopy}</Text> : null}
            {addUsdcOffer}
            <Text style={styles.fieldHint}>
              Your wallet asks you to confirm once. The auction fills bids block by block at each block&apos;s
              clearing price, never above your maximum, and unspent money comes back after the close.
            </Text>
            <RegentPressable style={styles.primaryButton} onPress={() => void placeBid()}>
              <Ionicons name="hammer-outline" size={16} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>Place bid</Text>
            </RegentPressable>
            <RegentPressable style={styles.secondaryButton} onPress={() => setReviewing(false)}>
              <Text style={styles.secondaryButtonText}>Change</Text>
            </RegentPressable>
          </>
        ) : null}
      </View>

      {position && position.bids.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your bids</Text>
          {position.bids.map((bid) => {
            const reason = settlementReasonCopy(bid);
            const outcome = collectOutcome(bid, currencySymbol, tokenSymbol);
            return (
              <View key={bid.bid_id} style={styles.bidTile}>
                <View style={styles.reviewRow}>
                  <Text style={styles.bidAmount}>{amountWords(bid.amount, currencySymbol)}</Text>
                  <Text style={styles.fieldHint}>{bid.returned ? 'Returned' : 'In the auction'}</Text>
                </View>
                <Text style={styles.fieldHint}>Most to pay per token: {amountWords(bid.max_price, currencySymbol)}</Text>
                {bid.tokens_filled !== '0' ? (
                  <Text style={styles.fieldHint}>Tokens won so far: {amountWords(bid.tokens_filled, tokenSymbol)}</Text>
                ) : null}
                {bid.settlement.steps.length > 0 ? (
                  <>
                    {bid.settlement.preview === 'unavailable' ? (
                      <Text style={styles.fieldHint}>Amount shown after collecting.</Text>
                    ) : outcome ? (
                      <Text style={styles.estimateText}>{outcome}</Text>
                    ) : null}
                    <RegentPressable style={styles.primaryButton} onPress={() => void collectBid(bid)}>
                      <Ionicons name="download-outline" size={16} color={colors.onAccent} />
                      <Text style={styles.primaryButtonText}>{collectLabel(bid, currencySymbol)}</Text>
                    </RegentPressable>
                  </>
                ) : reason ? (
                  <Text style={styles.sectionBody}>{reason}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

function estimateWords(
  quote: AutolaunchBidQuote | null,
  quoteState: 'idle' | 'loading' | 'unavailable',
  tokenSymbol: string | null
) {
  if (quoteState === 'loading') {
    return 'Working out what you would get...';
  }
  if (quoteState === 'unavailable') {
    return 'The estimate is not available right now. You can still place the bid.';
  }
  if (!quote) {
    return null;
  }
  if (!quote.would_be_active_now) {
    return 'Your maximum is below the current price, so this bid would not count right now.';
  }

  const tokens = amountWords(quote.estimated_tokens_if_end_now, tokenSymbol);
  return quote.current_clearing_price === '0'
    ? `You would get about ${tokens} at your maximum; the price is still forming.`
    : `You would get about ${tokens} if the auction ended now.`;
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 20,
      gap: 12,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    sectionBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    fieldHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    fieldHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: fonts.ui,
    },
    input: {
      minHeight: 54,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 20,
      fontFamily: fonts.title,
    },
    estimateText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    warningText: {
      color: colors.warning,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    reviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    reviewLabel: {
      color: colors.textMuted,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    reviewValue: {
      color: colors.text,
      fontSize: 16,
      fontFamily: fonts.title,
    },
    bidTile: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
      gap: 8,
    },
    bidAmount: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 16,
      minHeight: 48,
      paddingHorizontal: 18,
      paddingVertical: 13,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    disabledButton: {
      opacity: 0.48,
    },
  });
}
