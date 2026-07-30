import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { sendError } from '../httpResponses.js';
import {
  createPortalOAuthClient,
  PortalOAuthConfigurationError,
  type PortalOAuthClient,
} from '../services/portalOAuthClient.js';
import {
  createSharedStateStore,
  type SharedStateRedis,
} from '../sharedStateStore.js';

const PAIRING_LIFETIME_MS = 5 * 60 * 1000;
const GENERATION_RETENTION_MS = PAIRING_LIFETIME_MS * 4;
const PORTAL_RETURN_URL = 'regentsmobile://portal-return';

const pendingPairingSchema = z.object({
  userId: z.string().min(1),
  verifier: z.string().min(1),
  expiresAt: z.number().int().positive(),
  generation: z.string().min(1),
});

const pairedAccountSchema = z.object({
  refreshToken: z.string().trim().min(1),
  accountLabel: z.string().min(1).nullable(),
  pairedAt: z.string().datetime(),
});
const pairingGenerationSchema = z.object({
  value: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
});

const portalPairingStateSchema = z.object({
  pendingByState: z.record(z.string(), pendingPairingSchema),
  pairedByUser: z.record(z.string(), pairedAccountSchema),
  pairingGenerationByUser: z.record(z.string(), pairingGenerationSchema),
});

type PortalPairingState = z.infer<typeof portalPairingStateSchema>;
type PortalPairingStateStore = ReturnType<
  typeof createSharedStateStore<PortalPairingState>
>;

const completeBodySchema = z
  .object({
    code: z.string().trim().min(1),
    state: z.string().trim().min(1),
  })
  .strict();

function initialPortalPairingState(): PortalPairingState {
  return {
    pendingByState: {},
    pairedByUser: {},
    pairingGenerationByUser: {},
  };
}

const defaultPortalPairingStore = createPortalPairingStateStore();

export function createPortalPairingStateStore(
  key = 'regents:portal-pairing:v1',
) {
  return createSharedStateStore(key, initialPortalPairingState);
}

function validRecords<T>(
  records: unknown,
  schema: z.ZodType<T>,
): Record<string, T> {
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    return {};
  }

  const valid: Record<string, T> = {};
  for (const [key, value] of Object.entries(records)) {
    const parsed = schema.safeParse(value);
    if (parsed.success) {
      valid[key] = parsed.data;
    }
  }
  return valid;
}

function normalizeState(state: PortalPairingState) {
  state.pendingByState = validRecords(
    state.pendingByState,
    pendingPairingSchema,
  );
  state.pairedByUser = validRecords(state.pairedByUser, pairedAccountSchema);
  state.pairingGenerationByUser = validRecords(
    state.pairingGenerationByUser,
    pairingGenerationSchema,
  );
}

function newPairingGeneration() {
  return randomBytes(18).toString('base64url');
}

function pruneExpiredState(
  state: PortalPairingState,
  currentTime: number,
) {
  for (const [stateKey, pending] of Object.entries(state.pendingByState)) {
    if (pending.expiresAt <= currentTime) {
      delete state.pendingByState[stateKey];
    }
  }
  for (const [userId, generation] of Object.entries(
    state.pairingGenerationByUser,
  )) {
    if (generation.updatedAt + GENERATION_RETENTION_MS <= currentTime) {
      delete state.pairingGenerationByUser[userId];
    }
  }
}

function currentUserId(req: Request, res: Response) {
  if (req.userId) {
    return req.userId;
  }

  sendError(res, 401, 'Unauthorized', 'Sign in before pairing your Nous Portal account.');
  return null;
}

function statusForAccount(account: PortalPairingState['pairedByUser'][string] | undefined) {
  return account
    ? {
        paired: true,
        accountLabel: account.accountLabel,
        pairedAt: account.pairedAt,
      }
    : {
        paired: false,
        accountLabel: null,
        pairedAt: null,
      };
}

function callbackTarget(req: Request) {
  const query = new URLSearchParams();
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;

  if (code) {
    query.set('code', code);
  }
  if (state) {
    query.set('state', state);
  }

  const suffix = query.toString();
  return suffix ? `${PORTAL_RETURN_URL}?${suffix}` : PORTAL_RETURN_URL;
}

export function createPortalPairingRoutes(input?: {
  oauthClient?: PortalOAuthClient;
  redis?: SharedStateRedis | null;
  now?: () => number;
  store?: PortalPairingStateStore;
}) {
  const router = Router();
  const redis = input?.redis || null;
  const now = input?.now || Date.now;
  const store = input?.store || defaultPortalPairingStore;

  function oauthClient() {
    return input?.oauthClient || createPortalOAuthClient();
  }

  router.get('/oauth/callback', (req, res) => {
    return res.redirect(302, callbackTarget(req));
  });

  router.post('/mobile/portal-pairing/start', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    try {
      const request = oauthClient().createAuthorizationRequest();
      const initialGeneration = newPairingGeneration();
      await store.update((state) => {
        normalizeState(state);
        const currentTime = now();
        pruneExpiredState(state, currentTime);
        let generation = state.pairingGenerationByUser[userId];
        if (!generation) {
          generation = {
            value: initialGeneration,
            updatedAt: currentTime,
          };
          state.pairingGenerationByUser[userId] = generation;
        } else {
          generation.updatedAt = currentTime;
        }
        state.pendingByState[request.state] = {
          userId,
          verifier: request.verifier,
          expiresAt: currentTime + PAIRING_LIFETIME_MS,
          generation: generation.value,
        };
      }, redis);

      return res.json({ authorizeUrl: request.authorizeUrl });
    } catch (error) {
      if (error instanceof PortalOAuthConfigurationError) {
        return sendError(res, 503, 'PortalPairingUnavailable', 'Nous Portal pairing is not available for this build.');
      }
      return sendError(res, 500, 'PortalPairingUnavailable', 'Unable to start pairing right now.');
    }
  });

  router.post('/mobile/portal-pairing/complete', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const parsed = completeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'Return to Nous Portal and try pairing again.');
    }

    const consumeResult: {
      pending: z.infer<typeof pendingPairingSchema> | null;
      conflict: 'expired' | 'owner' | 'used';
    } = {
      pending: null,
      conflict: 'used',
    };
    await store.update((state) => {
      normalizeState(state);
      consumeResult.pending = null;
      consumeResult.conflict = 'used';
      const candidate = state.pendingByState[parsed.data.state];

      if (!candidate) {
        return;
      }
      if (candidate.expiresAt <= now()) {
        delete state.pendingByState[parsed.data.state];
        consumeResult.conflict = 'expired';
        return;
      }
      if (candidate.userId !== userId) {
        consumeResult.conflict = 'owner';
        return;
      }
      delete state.pendingByState[parsed.data.state];
      consumeResult.pending = candidate;
    }, redis);

    if (!consumeResult.pending) {
      const message =
        consumeResult.conflict === 'expired'
          ? 'This pairing attempt expired. Start again to continue.'
          : consumeResult.conflict === 'owner'
            ? 'This pairing attempt belongs to a different signed-in account.'
            : 'This pairing attempt was already used. Start again to continue.';
      return sendError(res, 409, 'PortalPairingConflict', message);
    }

    let exchange;
    try {
      exchange = await oauthClient().exchangeCode({
        code: parsed.data.code,
        verifier: consumeResult.pending.verifier,
      });
    } catch (error) {
      if (error instanceof PortalOAuthConfigurationError) {
        return sendError(res, 503, 'PortalPairingUnavailable', 'Nous Portal pairing is not available for this build.');
      }
      return sendError(res, 502, 'PortalPairingFailed', 'Nous Portal could not finish pairing. Please try again.');
    }

    if (exchange.kind !== 'ok') {
      return sendError(res, 502, 'PortalPairingFailed', 'Nous Portal could not finish pairing. Please try again.');
    }

    const pairedAt = new Date(now()).toISOString();
    let stored = false;
    await store.update((state) => {
      normalizeState(state);
      stored = false;
      if (
        state.pairingGenerationByUser[userId]?.value !==
        consumeResult.pending?.generation
      ) {
        return;
      }
      state.pairedByUser[userId] = {
        refreshToken: exchange.refreshToken,
        accountLabel: exchange.accountLabel,
        pairedAt,
      };
      stored = true;
    }, redis);

    if (!stored) {
      return sendError(
        res,
        502,
        'PortalPairingFailed',
        'Nous Portal could not finish pairing. Please try again.',
      );
    }

    return res.json({
      paired: true,
      accountLabel: exchange.accountLabel,
      pairedAt,
    });
  });

  router.get('/mobile/portal-pairing', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const state = await store.read(redis);
    normalizeState(state);
    return res.json(statusForAccount(state.pairedByUser[userId]));
  });

  router.delete('/mobile/portal-pairing', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const nextGeneration = newPairingGeneration();
    await store.update((state) => {
      normalizeState(state);
      delete state.pairedByUser[userId];
      for (const [stateKey, pending] of Object.entries(state.pendingByState)) {
        if (pending.userId === userId) {
          delete state.pendingByState[stateKey];
        }
      }
      state.pairingGenerationByUser[userId] = {
        value: nextGeneration,
        updatedAt: now(),
      };
    }, redis);

    return res.json(statusForAccount(undefined));
  });

  return router;
}
