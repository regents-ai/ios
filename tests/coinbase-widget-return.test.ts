import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOnrampIdempotencyKey } from '../utils/onramp/idempotency';

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, '..');

function source(path: string) {
  return readFileSync(resolve(rootDir, path), 'utf8');
}

test('Coinbase Widget buy flow uses the app return link with the in-app auth browser', () => {
  const checkout = source('hooks/onramp/useOnrampCheckout.ts');
  const opener = source('utils/onramp/openCoinbaseWidgetSession.ts');
  const submit = source('hooks/onramp/use-wallet-onramp-submit.ts');
  const resume = source('hooks/onramp/use-pending-onramp-resume.ts');
  const appServer = source('server/src/app.ts');

  assert.match(checkout, /redirectUrl: `\$\{coinbaseWidgetReturnUrl\}\?partnerUserRef=/);
  assert.match(opener, /openAuthSessionAsync\(input\.url, 'regentsmobile:\/\/'/);
  assert.match(submit, /openCoinbaseWidgetSession/);
  assert.match(resume, /openCoinbaseWidgetSession/);
  assert.match(appServer, /allowedHeaders: \['Content-Type', 'Authorization', 'Idempotency-Key'\]/);
  assert.doesNotMatch(submit, /Linking\.openURL\(url\)/);
  assert.doesNotMatch(resume, /Linking\.openURL\(url\)/);
});

test('Coinbase Widget return is a first-class app route without the upstream debug event route', () => {
  assert.equal(existsSync(resolve(rootDir, 'app/onramp-return.tsx')), true);

  const layout = source('app/_layout.tsx');
  const returnScreen = source('app/onramp-return.tsx');
  const appServer = source('server/src/app.ts');
  const contract = source('api-contract.openapiv3.yaml');

  assert.match(layout, /name="onramp-return"/);
  assert.doesNotMatch(returnScreen, /JSON\.stringify|Deep link|Redirect received/);
  assert.doesNotMatch(appServer, /\/events\/onramp/);
  assert.doesNotMatch(contract, /\/events\/onramp/);
});

test('Coinbase onramp create requests carry app-owned idempotency keys', () => {
  const proxy = source('utils/network/onrampProxy.ts');
  const createOrder = source('utils/createGuestCheckoutOrder.ts');
  const createSession = source('utils/createOnrampSession.ts');
  const quote = source('utils/fetchBuyQuote.ts');

  assert.match(proxy, /idempotencyKey/);
  assert.match(proxy, /'Idempotency-Key'/);
  assert.match(proxy, /operation: input\.operation/);
  assert.match(createOrder, /buildOnrampIdempotencyKey\('order', payload, payload\.agreementAcceptedAt\)/);
  assert.match(createOrder, /operation: 'onramp_order'/);
  assert.match(createOrder, /partnerUserRef: payload\.partnerUserRef/);
  assert.match(createSession, /buildOnrampIdempotencyKey\('session', payload, operationId\)/);
  assert.match(createSession, /operation: 'onramp_session'/);
  assert.match(createSession, /partnerUserRef/);
  assert.match(quote, /buildOnrampIdempotencyKey\('session', quoteIdempotencyPayload, 'widget-quote'\)/);
  assert.match(quote, /partnerUserRef: payload\.partnerUserRef/);
  assert.match(quote, /isQuote: true/);
  assert.match(quote, /idempotencyKey: quoteIdempotencyKey/);
  assert.doesNotMatch(`${proxy}\n${createOrder}\n${createSession}\n${quote}`, /url: ['"`]https:\/\/api\./);

  const orderPayload = {
    partnerUserRef: 'user-1',
    destinationNetwork: 'base',
    destinationAddress: '0xabc',
    paymentAmount: '25',
    paymentCurrency: 'USD',
    purchaseCurrency: 'USDC',
    paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY',
    agreementAcceptedAt: '2026-05-04T22:27:02.000Z',
    isQuote: false,
  };
  const first = buildOnrampIdempotencyKey('order', orderPayload, orderPayload.agreementAcceptedAt);
  const second = buildOnrampIdempotencyKey('order', orderPayload, orderPayload.agreementAcceptedAt);
  const nextPurchase = buildOnrampIdempotencyKey('order', orderPayload, '2026-05-04T22:29:02.000Z');

  assert.equal(second, first);
  assert.notEqual(nextPurchase, first);
  assert.notEqual(buildOnrampIdempotencyKey('order', { ...orderPayload, isQuote: true }, orderPayload.agreementAcceptedAt), first);

  const quotePayload = {
    partnerUserRef: 'user-1',
    destinationNetwork: 'base',
    destinationAddress: '0xabc',
    paymentAmount: '25',
    paymentCurrency: 'USD',
    purchaseCurrency: 'USDC',
    paymentMethod: 'CARD',
    isQuote: true,
  };
  const quoteKey = buildOnrampIdempotencyKey('session', quotePayload, 'widget-quote');

  assert.equal(buildOnrampIdempotencyKey('session', quotePayload, 'widget-quote'), quoteKey);
  assert.notEqual(buildOnrampIdempotencyKey('session', { ...quotePayload, partnerUserRef: 'user-2' }, 'widget-quote'), quoteKey);
  assert.notEqual(buildOnrampIdempotencyKey('session', { ...quotePayload, isQuote: false }, 'widget-quote'), quoteKey);
});

test('Coinbase proxy callers use declared operations instead of raw Coinbase URLs', () => {
  const files = [
    'utils/createGuestCheckoutOrder.ts',
    'utils/createOnrampSession.ts',
    'utils/createOfframpSession.ts',
    'utils/fetchBuyConfig.ts',
    'utils/fetchBuyOptions.ts',
    'utils/fetchBuyQuote.ts',
    'utils/fetchOfframpTransaction.ts',
    'utils/fetchTransactionHistory.ts',
    'utils/fetchUserLimits.ts',
  ];
  const combined = files.map(source).join('\n');

  for (const operation of [
    'buy_config',
    'buy_options',
    'buy_transactions',
    'sell_transactions',
    'onramp_session',
    'onramp_order',
    'onramp_limits',
    'offramp_token',
  ]) {
    assert.match(combined, new RegExp(`operation: '${operation}'`));
  }

  assert.doesNotMatch(combined, /url: ['"`]https:\/\/api\./);
  assert.doesNotMatch(combined, /method: ['"`](GET|POST)['"`]/);
});

test('balance failure logs use Coinbase error summaries instead of raw bodies', () => {
  const appServer = source('server/src/app.ts');

  assert.match(appServer, /summarizeCoinbaseErrorResponse/);
  assert.doesNotMatch(appServer, /CDP API error response/);
  assert.doesNotMatch(appServer, /CDP API error details:', errorData/);
});
