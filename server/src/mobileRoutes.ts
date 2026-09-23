import { Router, type Request, type Response } from 'express';
import type { Address } from 'viem';
import { z } from 'zod';

import { sendError } from './httpResponses.js';
import {
  parseRegentAmount,
  prepareRegentStakingAction,
  readRegentStaking,
  type RegentStakingReader,
} from './regentStaking.js';

const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const stakingWalletBodySchema = z.object({
  walletAddress: evmAddressSchema.transform((value) => value as Address),
});

const stakingAmountBodySchema = stakingWalletBodySchema.extend({
  amount: z.string().min(1),
});

function queryValue(req: Request, name: string) {
  const rawValue = req.query[name];
  if (typeof rawValue === 'string') {
    return rawValue;
  }

  const requestUrl = req.originalUrl || req.url;
  return new URL(requestUrl, 'http://localhost').searchParams.get(name) || undefined;
}

/**
 * REGENT staking routes. The staking contract is the source of truth and the
 * wallet is bound the same way the other wallet routes bind it: the app
 * declares its own smart-account address under the signed-in user, every
 * prepared call names that address as signer and recipient, and the app
 * signs only when that signer is its own wallet.
 */
export function createMobileRoutes(input?: { readStaking?: RegentStakingReader }) {
  const router = Router();
  const readStaking = input?.readStaking || readRegentStaking;

  router.get('/mobile/regent/staking', async (req, res) => {
    const parsed = stakingWalletBodySchema.safeParse({
      walletAddress: queryValue(req, 'walletAddress'),
    });

    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid wallet address is required.');
    }

    const result = await readStaking(parsed.data.walletAddress);
    if (result.kind === 'missing_rpc') {
      return sendError(
        res,
        503,
        'BaseRpcMissing',
        `${result.requiredEnv} is required before staking can be loaded.`,
      );
    }
    if (result.kind === 'rpc_error') {
      console.error('❌ [STAKING] Base read failed:', { name: result.name });
      return sendError(res, 502, 'BaseRpcError', 'Staking could not be read from Base right now.');
    }

    return res.json({ staking: result.staking });
  });

  const stakingAmountRoute =
    (action: 'stake' | 'unstake') =>
    (req: Request, res: Response) => {
      const parsed = stakingAmountBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'BadRequest', 'A wallet address and amount are required.');
      }

      const amount = parseRegentAmount(parsed.data.amount);
      if (amount === null) {
        return sendError(res, 400, 'BadRequest', 'Enter a REGENT amount above zero with at most 18 decimal places.');
      }

      return res.json({
        wallet_action: prepareRegentStakingAction({ action, walletAddress: parsed.data.walletAddress, amount }),
      });
    };

  const stakingClaimRoute =
    (action: 'claim_usdc' | 'claim_regent' | 'claim_and_restake_regent') =>
    (req: Request, res: Response) => {
      const parsed = stakingWalletBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'BadRequest', 'A valid wallet address is required.');
      }

      return res.json({
        wallet_action: prepareRegentStakingAction({ action, walletAddress: parsed.data.walletAddress }),
      });
    };

  router.post('/mobile/regent/staking/stake', stakingAmountRoute('stake'));
  router.post('/mobile/regent/staking/unstake', stakingAmountRoute('unstake'));
  router.post('/mobile/regent/staking/claim-usdc', stakingClaimRoute('claim_usdc'));
  router.post('/mobile/regent/staking/claim-regent', stakingClaimRoute('claim_regent'));
  router.post('/mobile/regent/staking/claim-and-restake-regent', stakingClaimRoute('claim_and_restake_regent'));

  return router;
}
