import { act } from '@testing-library/react-native';
import React from 'react';

import { OnrampForm } from '@/components/onramp/OnrampForm';
import type { AmountUnit } from '@/components/onramp/onramp-form-types';
import { fetchBuyQuote } from '@/utils/fetchBuyQuote';
import { renderThemed } from './helpers/renderThemed';

const PHONE_WALLET = '0xAbCdEf1111111111111111111111111111111111';
const PLAIN_LINE = 'Buy 9.25 USDC. Coinbase shows the total with fees before you pay.';

const mockProxy = jest.fn();

jest.mock('@/utils/network/onrampProxy', () => ({
  sendOnrampProxyRequest: (...args: unknown[]) => mockProxy(...args),
}));

jest.mock('@/hooks/useRegentsAuth', () => ({
  useRegentsAuth: () => ({ isAuthenticated: true, linkedEmail: 'person@example.com', linkedPhone: null }),
}));

async function renderForm(amountUnit: AmountUnit, fetchQuote = jest.fn()) {
  const screen = renderThemed(
    <OnrampForm
      amount="9.25"
      amountUnit={amountUnit}
      currentQuote={null}
      destinationAddress={PHONE_WALLET}
      destinationLabel="your phone wallet"
      fetchQuote={fetchQuote}
      isLoading={false}
      isLoadingQuote={false}
      onAmountChange={jest.fn()}
      onSubmit={jest.fn()}
      options={null}
      paymentCurrencies={['USD']}
    />
  );
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  return screen;
}

describe('Adding an exact amount of USDC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockProxy.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('says plainly how much USDC is bought and quotes by that USDC amount', async () => {
    const fetchQuote = jest.fn();

    const screen = await renderForm('purchase', fetchQuote);

    expect(screen.getByText(PLAIN_LINE)).toBeTruthy();
    expect(fetchQuote).toHaveBeenCalledWith(expect.objectContaining({ amount: '9.25', amountUnit: 'purchase' }));
  });

  it('keeps a dollar amount on the Regents Balance form', async () => {
    const fetchQuote = jest.fn();

    const screen = await renderForm('payment', fetchQuote);

    expect(screen.queryByText(PLAIN_LINE)).toBeNull();
    expect(fetchQuote).toHaveBeenCalledWith(expect.objectContaining({ amount: '9.25', amountUnit: 'payment' }));
  });

  it.each(['GUEST_CHECKOUT_APPLE_PAY', 'COINBASE_WIDGET'])(
    'asks Coinbase for exactly that much USDC when paying with %s',
    async (paymentMethod) => {
      await fetchBuyQuote({
        purchaseAmount: '9.25',
        paymentCurrency: 'USD',
        purchaseCurrency: 'USDC',
        destinationNetwork: 'base',
        destinationAddress: PHONE_WALLET,
        paymentMethod,
        partnerUserRef: 'person-1',
      });

      const { body } = mockProxy.mock.calls[0][0];
      expect(body).toEqual(expect.objectContaining({ purchaseAmount: '9.25', destinationAddress: PHONE_WALLET }));
      expect(body).not.toHaveProperty('paymentAmount');
    }
  );
});
