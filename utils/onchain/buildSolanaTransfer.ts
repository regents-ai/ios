/**
 * Builds the Solana transaction for a send: native SOL via SystemProgram, or
 * SPL token transfers with associated-token-account checks, fee-balance
 * guards, and destination ATA creation when needed.
 *
 * Stateless apart from the injected Connection, so it is unit-testable with a
 * fake connection.
 */

import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { PublicKey, SystemProgram, Transaction, type Connection } from '@solana/web3.js';

export type SolanaTransferRequest = {
  connection: Connection;
  fromAddress: string;
  recipientAddress: string;
  amountRaw: bigint;
  /** SPL mint address. Omit (or pass null) for native SOL transfers. */
  mintAddress?: string | null;
  tokenSymbol: string;
  isDevnet: boolean;
};

export async function buildSolanaTransferTransaction(request: SolanaTransferRequest): Promise<Transaction> {
  const { connection, fromAddress, recipientAddress, amountRaw, mintAddress, tokenSymbol, isDevnet } = request;

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  if (!mintAddress) {
    return new Transaction({
      recentBlockhash: blockhash,
      feePayer: new PublicKey(fromAddress),
    }).add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(fromAddress),
        toPubkey: new PublicKey(recipientAddress),
        lamports: amountRaw,
      })
    );
  }

  const mint = new PublicKey(mintAddress);
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(recipientAddress);

  const fromTokenAccount = await getAssociatedTokenAddress(mint, fromPubkey);

  try {
    await getAccount(connection, fromTokenAccount);
  } catch {
    throw new Error(
      `You do not have any ${tokenSymbol} in this wallet yet.\n\nPlease receive ${tokenSymbol} before you try to send it.`
    );
  }

  const senderSolBalance = await connection.getBalance(fromPubkey);
  const minFeeRequired = 0.00001 * 1e9;

  if (senderSolBalance < minFeeRequired) {
    throw new Error(
      `Insufficient SOL for transaction fees.\n\n` +
      `Current SOL balance: ${(senderSolBalance / 1e9).toFixed(9)} SOL\n` +
      `Required: At least 0.00001 SOL\n\n` +
      (isDevnet
        ? `Add test SOL from: https://faucet.solana.com`
        : `Add SOL to your wallet and try again.`)
    );
  }

  const toTokenAccount = await getAssociatedTokenAddress(mint, toPubkey);

  let needsATACreation = false;
  try {
    await getAccount(connection, toTokenAccount);
  } catch {
    needsATACreation = true;

    const senderBalance = await connection.getBalance(fromPubkey);
    const minRequired = 0.003 * 1e9;

    if (senderBalance < minRequired) {
      throw new Error(
        `The receiving wallet needs a little SOL before this send can finish.\n\n` +
        `Current balance: ${(senderBalance / 1e9).toFixed(6)} SOL\n` +
        `Required: ~0.003 SOL\n\n` +
        (isDevnet
          ? `Add test SOL from: https://faucet.solana.com`
          : `Add SOL to your wallet and try again.`)
      );
    }
  }

  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: fromPubkey,
  });

  if (needsATACreation) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        fromPubkey, // payer
        toTokenAccount, // ata
        toPubkey, // owner
        mint // mint
      )
    );
  }

  transaction.add(
    createTransferInstruction(
      fromTokenAccount, // source
      toTokenAccount, // destination
      fromPubkey, // owner
      amountRaw // amount
    )
  );

  return transaction;
}
