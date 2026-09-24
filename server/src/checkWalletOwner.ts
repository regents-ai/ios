// Checks the payment-owner lookup against the real Coinbase project.
//
//   npx tsx src/checkWalletOwner.ts                      (from server/, with CDP_API_KEY_ID and CDP_API_KEY_SECRET set)
//   node dist/checkWalletOwner.js                        (on the server machine)
//
// Optional: WALLET_ACCESS_TOKEN (from a signed-in phone) and EXPECTED_USER_ID
// (that person's user id) also check a real wallet end to end.
import { config } from 'dotenv';
import { CdpClient } from '@coinbase/cdp-sdk';

import { readPhoneWallet, validateWalletAccessToken } from './phoneWallet.js';
import { requireCoinbaseApiCredentials } from './security.js';

config({ path: '.env.local' });
config();

const mask = (value: string) => (value.length > 12 ? `${value.slice(0, 10)}…${value.slice(-4)}` : value);

const cdp = new CdpClient(requireCoinbaseApiCredentials(process.env));

console.log('1. Wallet owners in this Coinbase project (first page)');
const { endUsers } = await cdp.endUser.listEndUsers({ pageSize: 10 });
for (const endUser of endUsers) {
  const signIns = endUser.authenticationMethods.map((method) =>
    method.type === 'jwt' ? `jwt sub ${mask(method.sub)}${method.sub.startsWith('did:privy:') ? ' (a Privy user id)' : ''}` : method.type,
  );
  const wallets = endUser.evmSmartAccounts.map(mask);
  console.log(`   ${mask(endUser.userId)}: ${signIns.join(', ') || 'no sign-in'}; smart wallets ${wallets.join(', ') || 'none'}`);
}
if (endUsers.length === 0) console.log('   none yet');

console.log('2. A made-up wallet token must be refused clearly');
console.log('  ', await readPhoneWallet('nobody', 'not-a-token', validateWalletAccessToken));

const token = process.env.WALLET_ACCESS_TOKEN;
const userId = process.env.EXPECTED_USER_ID;
if (token && userId) {
  console.log('3. The real wallet token, as its owner and as someone else');
  console.log('   as owner:', await readPhoneWallet(userId, token, validateWalletAccessToken));
  console.log('   as someone else:', await readPhoneWallet(`${userId}-other`, token, validateWalletAccessToken));
} else {
  console.log('3. Skipped: set WALLET_ACCESS_TOKEN and EXPECTED_USER_ID to check a real wallet');
}
