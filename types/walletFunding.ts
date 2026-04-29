export type WalletFundingChoice = {
  network: string;
  token: {
    symbol?: string;
    name?: string;
    contractAddress?: string;
    mintAddress?: string;
  };
  amount?: {
    amount?: string;
    decimals?: string;
  };
  usdValue?: number;
};
