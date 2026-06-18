import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, type Connection } from '@solana/web3.js';

import { buildSolanaTransferTransaction } from '../utils/onchain/buildSolanaTransfer';
import { buildFundingIdempotencyKey } from '../utils/onchain/fundingIdempotency';
import {
  formatAddressPreview,
  getEvmExplorerUrl,
  getNetworkLabel,
  isSolanaNetwork,
} from '../utils/onchain/networkDisplay';
import { getInsufficientBalanceError, getSelfSendError } from '../utils/onchain/sendValidation';

test('network labels cover mainnets, testnets, and unknown networks', () => {
  assert.equal(getNetworkLabel('base'), 'Base');
  assert.equal(getNetworkLabel('base-sepolia'), 'Base test network');
  assert.equal(getNetworkLabel('ethereum'), 'Ethereum');
  assert.equal(getNetworkLabel('ethereum-sepolia'), 'Ethereum test network');
  assert.equal(getNetworkLabel('solana'), 'Solana');
  assert.equal(getNetworkLabel('solana-devnet'), 'Solana test network');
  assert.equal(getNetworkLabel('polygon'), 'Polygon');
});

test('address previews shorten long addresses and flag missing ones', () => {
  assert.equal(formatAddressPreview(null), 'Not ready');
  assert.equal(formatAddressPreview(undefined), 'Not ready');
  assert.equal(formatAddressPreview('short.eth'), 'short.eth');
  assert.equal(
    formatAddressPreview('0x52908400098527886E0F7030069857D2E4169EE7'),
    '0x5290...9EE7'
  );
});

test('solana network detection is case-insensitive and substring-based', () => {
  assert.equal(isSolanaNetwork('solana'), true);
  assert.equal(isSolanaNetwork('Solana-Devnet'), true);
  assert.equal(isSolanaNetwork('base'), false);
});

test('explorer URLs map known EVM networks and fall back to a plain hash', () => {
  assert.equal(getEvmExplorerUrl('base', '0xabc'), 'https://basescan.org/tx/0xabc');
  assert.equal(getEvmExplorerUrl('base-sepolia', '0xabc'), 'https://sepolia.basescan.org/tx/0xabc');
  assert.equal(getEvmExplorerUrl('ethereum', '0xabc'), 'https://etherscan.io/tx/0xabc');
  assert.equal(getEvmExplorerUrl('ethereum-sepolia', '0xabc'), 'https://sepolia.etherscan.io/tx/0xabc');
  assert.equal(getEvmExplorerUrl('polygon', '0xabc'), 'Transaction Hash: 0xabc');
});

test('funding idempotency keys pin the intent and append the nonce', () => {
  const key = buildFundingIdempotencyKey({
    amount: '12.50',
    expectedSigner: '0xABCDEF0000000000000000000000000000000001',
    regentId: 'Regent-1',
    recipientAddress: '0xABCDEF0000000000000000000000000000000002',
    tokenAddress: '0xABCDEF0000000000000000000000000000000003',
    nonce: 'nonce-123',
  });

  const segments = key.split(':');
  assert.equal(segments[0], 'regents-mobile');
  assert.equal(segments[1], 'fund-agent');
  assert.equal(segments[2], 'regent-1'); // lowercased
  assert.equal(segments[3], '0xabcdef0000000000000000000000000000000001');
  assert.equal(segments[4], '0xabcdef0000000000000000000000000000000002');
  assert.equal(segments[5], '0xabcdef0000000000000000000000000000000003');
  assert.equal(segments[6], '12.50');
  assert.equal(segments[7], 'nonce-123');
});

test('funding idempotency keys mark missing segments without dropping them', () => {
  const key = buildFundingIdempotencyKey({
    amount: '1',
    expectedSigner: '0xabc',
    regentId: 'regent-1',
    recipientAddress: '0xdef',
    nonce: 'n',
  });

  assert.equal(key, 'regents-mobile:fund-agent:regent-1:0xabc:0xdef:missing:1:n');
});

test('amounts above the available balance are rejected with friendly copy', () => {
  const usdcWithFive = {
    amount: { amount: '5000000', decimals: '6' },
    token: { symbol: 'USDC' },
  };

  assert.equal(
    getInsufficientBalanceError(usdcWithFive, '5.01'),
    'You can send up to 5 USDC.'
  );
});

test('amounts equal to or below the available balance are allowed', () => {
  const usdcWithFive = {
    amount: { amount: '5000000', decimals: '6' },
    token: { symbol: 'USDC' },
  };

  assert.equal(getInsufficientBalanceError(usdcWithFive, '5'), null);
  assert.equal(getInsufficientBalanceError(usdcWithFive, '4.999999'), null);
});

test('a missing token amount means a zero balance, not a free pass', () => {
  const tokenWithoutAmount = { amount: null, token: { symbol: 'USDC' } };

  assert.equal(
    getInsufficientBalanceError(tokenWithoutAmount, '1'),
    'You can send up to 0 USDC.'
  );
});

test('an unavailable balance does not block the send', () => {
  const tokenWithBadDecimals = {
    amount: { amount: '5000000', decimals: 'not-a-number' },
    token: { symbol: 'USDC' },
  };

  assert.equal(getInsufficientBalanceError(tokenWithBadDecimals, '999'), null);
});

const ownEvmAddress = '0x52908400098527886E0F7030069857D2E4169EE7';
const ownSolanaAddress = '9xQeWvG816bnpHmjTuiCGB1zSxhGfWSFNdRKnyhVbqRb';

test('self-sends are rejected on EVM networks even when the case differs', () => {
  const expected = 'This is your own wallet address. Enter a different recipient.';

  assert.equal(
    getSelfSendError({
      network: 'base',
      recipientAddress: ownEvmAddress,
      smartAccountAddress: ownEvmAddress,
      solanaAddress: null,
    }),
    expected
  );
  assert.equal(
    getSelfSendError({
      network: 'ethereum',
      recipientAddress: ownEvmAddress.toLowerCase(),
      smartAccountAddress: ownEvmAddress,
      solanaAddress: null,
    }),
    expected
  );
});

test('self-sends are rejected on Solana', () => {
  assert.equal(
    getSelfSendError({
      network: 'solana',
      recipientAddress: ownSolanaAddress,
      smartAccountAddress: null,
      solanaAddress: ownSolanaAddress,
    }),
    'This is your own wallet address. Enter a different recipient.'
  );
});

test('sends to a different recipient are allowed on both network families', () => {
  assert.equal(
    getSelfSendError({
      network: 'base',
      recipientAddress: '0x0000000000000000000000000000000000000001',
      smartAccountAddress: ownEvmAddress,
      solanaAddress: null,
    }),
    null
  );
  assert.equal(
    getSelfSendError({
      network: 'solana',
      recipientAddress: '9xQeWvG816bnpHmjTuiCGB1zSxhGfWSFNdRKnyhVbqRc',
      smartAccountAddress: null,
      solanaAddress: ownSolanaAddress,
    }),
    null
  );
});

type FakeAccountInfo = {
  data: Buffer;
  owner: PublicKey;
  executable: boolean;
  lamports: number;
};

function makeFakeConnection({
  blockhash,
  accounts,
  balance,
}: {
  blockhash: string;
  accounts: Map<string, FakeAccountInfo>;
  balance: number;
}) {
  return {
    getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 1 }),
    getAccountInfo: async (address: PublicKey) => accounts.get(address.toBase58()) ?? null,
    getBalance: async () => balance,
  } as unknown as Connection;
}

function encodeTokenAccount(mint: PublicKey, owner: PublicKey): FakeAccountInfo {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint,
      owner,
      amount: 1_000_000n,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data
  );
  return { data, owner: TOKEN_PROGRAM_ID, executable: false, lamports: 2_039_280 };
}

const blockhash = Keypair.generate().publicKey.toBase58();
const sender = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;

test('native SOL transfers build a single SystemProgram instruction', async () => {
  const connection = makeFakeConnection({ blockhash, accounts: new Map(), balance: 0 });

  const transaction = await buildSolanaTransferTransaction({
    connection,
    fromAddress: sender.toBase58(),
    recipientAddress: recipient.toBase58(),
    amountRaw: 1_000_000n,
    mintAddress: null,
    tokenSymbol: 'SOL',
    isDevnet: false,
  });

  assert.equal(transaction.instructions.length, 1);
  assert.ok(transaction.instructions[0].programId.equals(SystemProgram.programId));
  assert.ok(transaction.feePayer?.equals(sender));
  assert.equal(transaction.recentBlockhash, blockhash);
});

test('SPL transfers fail with friendly copy when the sender holds no token account', async () => {
  const connection = makeFakeConnection({ blockhash, accounts: new Map(), balance: 1e9 });

  await assert.rejects(
    buildSolanaTransferTransaction({
      connection,
      fromAddress: sender.toBase58(),
      recipientAddress: recipient.toBase58(),
      amountRaw: 1n,
      mintAddress: mint.toBase58(),
      tokenSymbol: 'USDC',
      isDevnet: false,
    }),
    /You do not have any USDC in this wallet yet/
  );
});

test('SPL transfers fail with the fee guard when the sender has no SOL', async () => {
  const fromAta = await getAssociatedTokenAddress(mint, sender);
  const accounts = new Map([[fromAta.toBase58(), encodeTokenAccount(mint, sender)]]);
  const connection = makeFakeConnection({ blockhash, accounts, balance: 0 });

  await assert.rejects(
    buildSolanaTransferTransaction({
      connection,
      fromAddress: sender.toBase58(),
      recipientAddress: recipient.toBase58(),
      amountRaw: 1n,
      mintAddress: mint.toBase58(),
      tokenSymbol: 'USDC',
      isDevnet: true,
    }),
    /Insufficient SOL for transaction fees[\s\S]*faucet\.solana\.com/
  );
});

test('SPL transfers create the destination token account when it is missing', async () => {
  const fromAta = await getAssociatedTokenAddress(mint, sender);
  const accounts = new Map([[fromAta.toBase58(), encodeTokenAccount(mint, sender)]]);
  const connection = makeFakeConnection({ blockhash, accounts, balance: 1e9 });

  const transaction = await buildSolanaTransferTransaction({
    connection,
    fromAddress: sender.toBase58(),
    recipientAddress: recipient.toBase58(),
    amountRaw: 1n,
    mintAddress: mint.toBase58(),
    tokenSymbol: 'USDC',
    isDevnet: false,
  });

  assert.equal(transaction.instructions.length, 2);
  assert.ok(transaction.instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.ok(transaction.instructions[1].programId.equals(TOKEN_PROGRAM_ID));
});

test('SPL transfers skip ATA creation when the destination account exists', async () => {
  const fromAta = await getAssociatedTokenAddress(mint, sender);
  const toAta = await getAssociatedTokenAddress(mint, recipient);
  const accounts = new Map([
    [fromAta.toBase58(), encodeTokenAccount(mint, sender)],
    [toAta.toBase58(), encodeTokenAccount(mint, recipient)],
  ]);
  const connection = makeFakeConnection({ blockhash, accounts, balance: 1e9 });

  const transaction = await buildSolanaTransferTransaction({
    connection,
    fromAddress: sender.toBase58(),
    recipientAddress: recipient.toBase58(),
    amountRaw: 1n,
    mintAddress: mint.toBase58(),
    tokenSymbol: 'USDC',
    isDevnet: false,
  });

  assert.equal(transaction.instructions.length, 1);
  assert.ok(transaction.instructions[0].programId.equals(TOKEN_PROGRAM_ID));
});
