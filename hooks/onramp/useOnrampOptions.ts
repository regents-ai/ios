import { useCallback, useMemo, useState } from 'react';

import { fetchBuyConfig } from '@/utils/fetchBuyConfig';
import { fetchBuyOptions } from '@/utils/fetchBuyOptions';
import { getCountry, getSubdivision, setSubdivision } from '@/utils/state/locationState';

type CountryConfig = {
  id?: string;
  subdivisions?: string[];
  payment_methods?: { id?: string }[];
  payment_currencies?: string[];
  currencies?: string[];
};

type BuyConfig = {
  countries?: CountryConfig[];
};

type BuyOptions = {
  countries?: CountryConfig[];
  payment_currencies?: (string | { id?: string })[];
};

type OnrampOptionsState = {
  options: BuyOptions | null;
  isLoadingOptions: boolean;
  optionsError: string | null;
  buyConfig: BuyConfig | null;
  paymentCurrencies: string[];
  fetchOptions: () => Promise<void>;
};

const PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE =
  "Adding money isn't available right now. You can still send and pay from your wallet.";

export function useOnrampOptions(): OnrampOptionsState {
  const [options, setOptions] = useState<BuyOptions | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [buyConfig, setBuyConfig] = useState<BuyConfig | null>(null);

  const fetchOptions = useCallback(async () => {
    setIsLoadingOptions(true);
    setOptionsError(null);

    try {
      const country = getCountry();
      let subdivision = getSubdivision();

      if (country === 'US' && !subdivision) {
        subdivision = 'CA';
        setSubdivision('CA');
      }

      const [fetchedOptions, fetchedConfig] = await Promise.all([
        fetchBuyOptions({ country, subdivision }),
        fetchBuyConfig(),
      ]);

      setOptions(fetchedOptions as BuyOptions);
      setBuyConfig({
        ...((fetchedConfig as BuyConfig | null) ?? {}),
        countries: (((fetchedConfig as BuyConfig | null)?.countries) ?? []).filter((entry) =>
          entry.payment_methods?.some((method) => method.id === 'CARD')
        ),
      });
      setOptionsError(null);
    } catch (error) {
      console.warn('Failed to fetch options:', error);
      setOptionsError(PAYMENT_OPTIONS_UNAVAILABLE_MESSAGE);
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  const paymentCurrencies = useMemo(() => {
    const country = getCountry();
    const fromOptions = Array.isArray(options?.payment_currencies)
      ? options.payment_currencies
          .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
          .filter((entry): entry is string => Boolean(entry))
      : [];

    if (fromOptions.length) {
      return fromOptions;
    }

    const entry = Array.isArray(buyConfig?.countries)
      ? buyConfig.countries.find((countryEntry) => countryEntry.id === country)
      : null;
    const fromConfig = (
      (Array.isArray(entry?.payment_currencies) && entry.payment_currencies) ||
      (Array.isArray(entry?.currencies) && entry.currencies) ||
      []
    ).filter((value): value is string => typeof value === 'string' && value.length > 0);

    return fromConfig.length ? fromConfig : ['USD'];
  }, [options, buyConfig]);

  return {
    options,
    isLoadingOptions,
    optionsError,
    buyConfig,
    paymentCurrencies,
    fetchOptions,
  };
}
