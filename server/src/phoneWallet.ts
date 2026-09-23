import { CdpClient, type EndUser } from '@coinbase/cdp-sdk';
import type { Address } from 'viem';

import { CoinbaseConfigurationError, requireCoinbaseApiCredentials } from './security.js';

/**
 * The signed-in person's own phone wallet, as Coinbase reports it.
 *
 * The app opens its Coinbase wallet with a sign-in token this server issues
 * for the person's user id, so the Coinbase end user behind a wallet access
 * token carries that id as its sign-in subject. The wallet is the person's
 * own only when that subject is the signed-in user.
 */

export type WalletOwner = Pick<EndUser, 'authenticationMethods' | 'evmSmartAccounts'>;

/** Asks Coinbase who a wallet access token belongs to; throws when it cannot say. */
export type WalletAccessTokenValidator = (accessToken: string) => Promise<WalletOwner>;

export type PhoneWalletRead =
  | { kind: 'wallet'; walletAddress: Address }
  | { kind: 'not_yours' }
  | { kind: 'missing_config' }
  | { kind: 'coinbase_error'; name: string };

let cdpClient: CdpClient | null = null;

export const validateWalletAccessToken: WalletAccessTokenValidator = (accessToken) => {
  cdpClient ??= new CdpClient(requireCoinbaseApiCredentials(process.env));
  return cdpClient.endUser.validateAccessToken({ accessToken });
};

export async function readPhoneWallet(
  userId: string,
  walletAccessToken: string,
  validate: WalletAccessTokenValidator,
): Promise<PhoneWalletRead> {
  let owner: WalletOwner;
  try {
    owner = await validate(walletAccessToken);
  } catch (error) {
    if (error instanceof CoinbaseConfigurationError) {
      return { kind: 'missing_config' };
    }
    return { kind: 'coinbase_error', name: error instanceof Error ? error.name : typeof error };
  }

  const signedInAsUser = owner.authenticationMethods.some((method) => method.type === 'jwt' && method.sub === userId);
  const walletAddress = owner.evmSmartAccounts[0];
  return signedInAsUser && walletAddress ? { kind: 'wallet', walletAddress: walletAddress as Address } : { kind: 'not_yours' };
}
