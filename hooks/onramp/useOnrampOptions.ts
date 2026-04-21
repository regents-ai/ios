import { useCallback, useMemo, useState } from 'react';

import { fetchBuyConfig } from '@/utils/fetchBuyConfig';
import { fetchBuyOptions } from '@/utils/fetchBuyOptions';
import { getCountry, getSubdivision, setSubdivision } from '@/utils/state/locationState';

type OnrampOptionsState = {
  options: any;
  isLoadingOptions: boolean;
  optionsError: string | null;
  buyConfig: any;
  paymentCurrencies: string[];
  getAssetSymbolFromName: (assetName: string) => string;
  getNetworkNameFromDisplayName: (displayName: string) => string;
  getAvailableNetworks: (selectedAsset?: string) => any[];
  getAvailableAssets: (selectedNetwork?: string) => any[];
  fetchOptions: () => Promise<void>;
};

export function useOnrampOptions(): OnrampOptionsState {
  const [options, setOptions] = useState<any>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [buyConfig, setBuyConfig] = useState<any>(null);

  const getAssetSymbolFromName = useCallback(
    (assetName: string) => {
      if (!options?.purchase_currencies) {
        return assetName;
      }

      const asset = options.purchase_currencies.find((option: any) => option.name === assetName);
      return asset?.symbol || assetName;
    },
    [options]
  );

  const getNetworkNameFromDisplayName = useCallback(
    (displayName: string) => {
      if (!options?.purchase_currencies) {
        return displayName;
      }

      for (const asset of options.purchase_currencies) {
        const network = asset.networks.find((option: any) => option.display_name === displayName);
        if (network) {
          return network.name;
        }
      }

      return displayName;
    },
    [options]
  );

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

      setOptions(fetchedOptions);
      setBuyConfig({
        ...fetchedConfig,
        countries: (fetchedConfig?.countries || []).filter((entry: any) =>
          entry.payment_methods?.some((method: any) => method.id === 'CARD')
        ),
      });
      setOptionsError(null);
    } catch (error) {
      console.error('Failed to fetch options:', error);
      setOptionsError(error instanceof Error ? error.message : 'Failed to load payment options');
    } finally {
      setIsLoadingOptions(false);
    }
  }, []);

  const getAvailableNetworks = useCallback(
    (selectedAsset?: string) => {
      if (!options?.purchase_currencies) {
        return [
          { name: 'ethereum', display_name: 'Ethereum', icon_url: null },
          { name: 'base', display_name: 'Base', icon_url: null },
        ];
      }

      if (!selectedAsset) {
        const allNetworks = options.purchase_currencies.flatMap((asset: any) => asset.networks);
        return [...new Map(allNetworks.map((network: any) => [network.name, network])).values()];
      }

      const asset = options.purchase_currencies.find((option: any) => option.name === selectedAsset);
      return asset?.networks || [];
    },
    [options]
  );

  const getAvailableAssets = useCallback(
    (selectedNetwork?: string) => {
      if (!options?.purchase_currencies) {
        return [
          { name: 'USDC', symbol: 'USDC', icon_url: null },
          { name: 'ETH', symbol: 'ETH', icon_url: null },
        ];
      }

      if (!selectedNetwork) {
        return options.purchase_currencies;
      }

      return options.purchase_currencies.filter((asset: any) =>
        asset.networks.some((network: any) => network.display_name === selectedNetwork)
      );
    },
    [options]
  );

  const paymentCurrencies = useMemo(() => {
    const country = getCountry();
    const fromOptions = Array.isArray(options?.payment_currencies)
      ? options.payment_currencies
          .map((entry: any) => (typeof entry === 'string' ? entry : entry?.id))
          .filter(Boolean)
      : [];

    if (fromOptions.length) {
      return fromOptions;
    }

    const entry = Array.isArray(buyConfig?.countries)
      ? buyConfig.countries.find((countryEntry: any) => countryEntry.id === country)
      : null;
    const fromConfig =
      (Array.isArray(entry?.payment_currencies) && entry.payment_currencies) ||
      (Array.isArray(entry?.currencies) && entry.currencies) ||
      [];

    return fromConfig.length ? fromConfig : ['USD'];
  }, [options, buyConfig]);

  return {
    options,
    isLoadingOptions,
    optionsError,
    buyConfig,
    paymentCurrencies,
    getAssetSymbolFromName,
    getNetworkNameFromDisplayName,
    getAvailableNetworks,
    getAvailableAssets,
    fetchOptions,
  };
}
