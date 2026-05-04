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

  assert.match(checkout, /redirectUrl: `\$\{coinbaseWidgetReturnUrl\}\?partnerUserRef=/);
  assert.match(opener, /openAuthSessionAsync\(input\.url, 'regentsmobile:\/\/'/);
  assert.match(submit, /openCoinbaseWidgetSession/);
  assert.match(resume, /openCoinbaseWidgetSession/);
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

  assert.match(proxy, /idempotencyKey/);
  assert.match(proxy, /'Idempotency-Key'/);
  assert.match(createOrder, /buildOnrampIdempotencyKey\('order', payload\)/);
  assert.match(createSession, /buildOnrampIdempotencyKey\('session', payload\)/);

  const orderPayload = {
    partnerUserRef: 'user-1',
    destinationNetwork: 'base',
    destinationAddress: '0xabc',
    paymentAmount: '25',
    paymentCurrency: 'USD',
    purchaseCurrency: 'USDC',
    paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY',
    isQuote: false,
  };
  const first = buildOnrampIdempotencyKey('order', orderPayload);
  const second = buildOnrampIdempotencyKey('order', orderPayload);

  assert.equal(second, first);
  assert.notEqual(buildOnrampIdempotencyKey('order', { ...orderPayload, isQuote: true }), first);
});
