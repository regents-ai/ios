import { z } from 'zod';

const platformBlockerSchema = z.object({
  message: z.string(),
});

const platformCompanySchema = z.object({
  company: z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    claimed_label: z.string(),
    basename_fqdn: z.string(),
    status: z.string(),
    wallet_address: z.string().nullable().optional(),
    runtime_status: z.string(),
    workspace_url: z.string().nullable().optional(),
    sprite_free_until: z.string().nullable().optional(),
    public_summary: z.string().nullable().optional(),
  }),
  runtime: z.object({
    sprite: z.object({
      status: z.string(),
      free_until: z.string().nullable().optional(),
    }),
    workspace: z.object({
      status: z.string(),
    }).passthrough(),
    hermes: z.object({
      status: z.string(),
    }).passthrough(),
    voice: z.object({
      enabled: z.boolean(),
      health: z.enum(['ok', 'degraded', 'unavailable']),
      status_url: z.string(),
      session_url: z.string(),
      provider: z.literal('openai-realtime'),
      model: z.string(),
      tool_registry_digest: z.string(),
      account: z.object({
        required: z.literal(true),
        satisfied: z.boolean(),
        provider: z.literal('openai_chatgpt'),
        connect_url: z.string().nullable().optional(),
      }),
    }),
  }),
  formation: z.object({
    status: z.string(),
    last_error_message: z.string().nullable().optional(),
  }).nullable(),
  public_profile: z.object({
    slug: z.string(),
    basename_fqdn: z.string(),
  }),
});

const rwrCompanySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
});

const rwrWorkItemSchema = z.object({
  id: z.number().int(),
  company_id: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  visibility: z.string(),
  desired_runner_kind: z.string().nullable(),
  assigned_worker_id: z.number().int().nullable(),
  assigned_agent_profile_id: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const rwrRunSchema = z.object({
  id: z.number().int(),
  company_id: z.number().int(),
  work_item_id: z.number().int(),
  parent_run_id: z.number().int().nullable(),
  root_run_id: z.number().int().nullable(),
  worker_id: z.number().int().nullable(),
  runtime_profile_id: z.number().int().nullable(),
  runner_kind: z.string(),
  status: z.string(),
  visibility: z.string(),
  summary: z.string().nullable(),
  failure_reason: z.string().nullable(),
  cost_usd: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const rwrRunEventSchema = z.object({
  id: z.number().int(),
  company_id: z.number().int(),
  run_id: z.number().int(),
  sequence: z.number().int(),
  kind: z.string(),
  actor_kind: z.string().nullable(),
  actor_id: z.string().nullable(),
  visibility: z.string(),
  sensitivity: z.string(),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: z.string(),
});

const rwrApprovalSchema = z.object({
  id: z.number().int(),
  company_id: z.number().int(),
  run_id: z.number().int(),
  approval_type: z.string(),
  status: z.enum(['pending', 'approved', 'denied', 'expired', 'canceled']),
  requested_by_actor_kind: z.string(),
  requested_by_actor_id: z.string().nullable(),
  risk_summary: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  resolved_by_human_id: z.number().int().nullable(),
  resolved_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const rwrAccountSchema = z.object({
  ok: z.literal(true),
  authenticated: z.boolean(),
  companies: z.array(rwrCompanySchema),
});

const rwrWorkItemsSchema = z.object({
  ok: z.literal(true),
  company_id: z.number().int(),
  work_items: z.array(rwrWorkItemSchema),
});

const rwrWorkItemResponseSchema = z.object({
  ok: z.literal(true),
  work_item: rwrWorkItemSchema,
});

const rwrRunResponseSchema = z.object({
  ok: z.literal(true),
  run: rwrRunSchema,
});

const rwrRunEventsSchema = z.object({
  ok: z.literal(true),
  run_id: z.number().int(),
  events: z.array(rwrRunEventSchema),
});

const rwrApprovalsSchema = z.object({
  ok: z.literal(true),
  run_id: z.number().int(),
  approvals: z.array(rwrApprovalSchema),
});

const rwrApprovalResponseSchema = z.object({
  ok: z.literal(true),
  approval: rwrApprovalSchema,
});

const nullableStringSchema = z.string().nullable();
const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const decimalValueSchema = z.string().regex(/^\d+$/);
const hexDataSchema = z.string().regex(/^0x([a-fA-F0-9]{2})*$/);

const regentStakingStateSchema = z.object({
  ok: z.literal(true).optional(),
  chain_id: z.number().int(),
  chain_label: z.string(),
  contract_address: z.string(),
  owner_address: z.string(),
  stake_token_address: z.string(),
  usdc_address: z.string(),
  treasury_recipient: z.string(),
  revenue_share_supply_denominator_raw: z.string(),
  revenue_share_supply_denominator: z.string(),
  paused: z.boolean(),
  total_staked_raw: z.string(),
  total_staked: z.string(),
  total_usdc_received_raw: z.string(),
  total_usdc_received: z.string(),
  direct_deposit_usdc_raw: z.string(),
  direct_deposit_usdc: z.string(),
  treasury_residual_usdc_raw: z.string(),
  treasury_residual_usdc: z.string(),
  materialized_outstanding_raw: z.string(),
  materialized_outstanding: z.string(),
  available_reward_inventory_raw: z.string(),
  available_reward_inventory: z.string(),
  total_claimed_so_far_raw: z.string(),
  total_claimed_so_far: z.string(),
  wallet_address: nullableStringSchema.optional(),
  connected_wallet_address: nullableStringSchema.optional(),
  wallet_stake_balance_raw: nullableStringSchema.optional(),
  wallet_stake_balance: nullableStringSchema.optional(),
  wallet_token_balance_raw: nullableStringSchema.optional(),
  wallet_token_balance: nullableStringSchema.optional(),
  wallet_claimable_usdc_raw: nullableStringSchema.optional(),
  wallet_claimable_usdc: nullableStringSchema.optional(),
  wallet_claimable_regent_raw: nullableStringSchema.optional(),
  wallet_claimable_regent: nullableStringSchema.optional(),
  wallet_funded_claimable_regent_raw: nullableStringSchema.optional(),
  wallet_funded_claimable_regent: nullableStringSchema.optional(),
});

const regentStakingActionStateSchema = z.object({
  chain_id: z.number().int(),
  chain_label: z.string(),
  contract_address: evmAddressSchema,
  wallet_address: evmAddressSchema,
});

const platformWalletActionSchema = z.object({
  action_id: z.string(),
  owner_product: z.literal('platform'),
  resource: z.literal('regent_staking'),
  resource_id: z.string(),
  action: z.enum(['stake', 'unstake', 'claim_usdc', 'claim_regent', 'claim_and_restake_regent']),
  chain_id: z.number().int(),
  to: evmAddressSchema,
  value: decimalValueSchema,
  data: hexDataSchema,
  expected_signer: evmAddressSchema,
  expires_at: z.string(),
  idempotency_key: z.string(),
  simulation: z.object({
    required: z.boolean(),
    status: z.enum(['not_required', 'pending', 'passed', 'failed']),
    block_number: z.number().int().nullable().optional(),
  }),
  risk_copy: z.string(),
  approval: z.object({
    token: evmAddressSchema,
    spender: evmAddressSchema,
    amount: decimalValueSchema,
    data: hexDataSchema,
  }).optional(),
});

const regentStakingActionResponseSchema = z.object({
  ok: z.literal(true),
  staking: regentStakingActionStateSchema,
  wallet_action: platformWalletActionSchema,
});

const agentPhoneLinkClaimSchema = z.object({
  ok: z.literal(true),
  agent: z.object({
    id: z.number().int(),
    name: z.string(),
  }).passthrough(),
});

/** Platform error envelope (StatusMessage): the message lives at `error.message`. */
const platformStatusMessageSchema = z.object({
  error: z.object({
    message: z.string().min(1),
  }).passthrough(),
});

const platformProjectionSchema = z.object({
  ok: z.boolean(),
  projection: z.object({
    formation: z.object({
      formation_state: z.object({
        state: z.enum(['pending', 'blocked', 'provisioning', 'ready']),
        blockers: z.array(platformBlockerSchema),
      }),
    }).passthrough(),
    billing_account: z.object({
      status: z.string(),
      runtime_credit_balance_usd_cents: z.number().int(),
    }).passthrough(),
    billing_usage: z.object({
      runtime_credit_balance_usd_cents: z.number().int(),
    }).passthrough(),
    companies: z.array(platformCompanySchema),
    public_profiles: z.array(z.object({
      slug: z.string(),
      basename_fqdn: z.string(),
    }).passthrough()),
  }),
});

export type PlatformProjectionResponse = z.infer<typeof platformProjectionSchema>;
export type PlatformProjection = PlatformProjectionResponse['projection'];
export type PlatformCompanyProjection = PlatformProjection['companies'][number];
export type RwrCompany = z.infer<typeof rwrCompanySchema>;
export type RwrWorkItem = z.infer<typeof rwrWorkItemSchema>;
export type RwrRun = z.infer<typeof rwrRunSchema>;
export type RwrRunEvent = z.infer<typeof rwrRunEventSchema>;
export type RwrApproval = z.infer<typeof rwrApprovalSchema>;
export type RegentStakingState = Omit<z.infer<typeof regentStakingStateSchema>, 'ok'>;
export type RegentStakingActionResponse = Omit<z.infer<typeof regentStakingActionResponseSchema>, 'ok'>;

export type PlatformProjectionClientResult =
  | { kind: 'ok'; projection: PlatformProjection }
  | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
  | { kind: 'unauthorized' }
  | { kind: 'upstream_error'; message: string };

export type PlatformProjectionClient = {
  fetchProjection(input: {
    authorization?: string | undefined;
  }): Promise<PlatformProjectionClientResult>;
};

export type PlatformRwrClientResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'upstream_error'; message: string };

export type PlatformRequestAuth = {
  authorization?: string | undefined;
};

export type PlatformRwrClient = {
  fetchAccount(auth: PlatformRequestAuth): Promise<PlatformRwrClientResult<{ authenticated: boolean; companies: RwrCompany[] }>>;
  fetchWorkItems(auth: PlatformRequestAuth, companyId: number): Promise<PlatformRwrClientResult<RwrWorkItem[]>>;
  createWorkItem(
    auth: PlatformRequestAuth,
    companyId: number,
    input: { title: string; description?: string | null; priority?: 'normal' | 'urgent'; visibility?: 'operator' | 'company' | 'public'; metadata?: Record<string, unknown> }
  ): Promise<PlatformRwrClientResult<RwrWorkItem>>;
  startRun(
    auth: PlatformRequestAuth,
    companyId: number,
    workItemId: number,
    input: { instructions: string; runnerKind?: string; metadata?: Record<string, unknown> }
  ): Promise<PlatformRwrClientResult<RwrRun>>;
  fetchRun(auth: PlatformRequestAuth, companyId: number, runId: number): Promise<PlatformRwrClientResult<RwrRun>>;
  fetchRunEvents(auth: PlatformRequestAuth, companyId: number, runId: number): Promise<PlatformRwrClientResult<RwrRunEvent[]>>;
  fetchApprovals(auth: PlatformRequestAuth, companyId: number, runId: number): Promise<PlatformRwrClientResult<RwrApproval[]>>;
  resolveApproval(
    auth: PlatformRequestAuth,
    companyId: number,
    runId: number,
    approvalId: number,
    decision: 'approved' | 'denied'
  ): Promise<PlatformRwrClientResult<RwrApproval>>;
};

export type ConnectedAgent = {
  id: string;
  name: string;
};

/**
 * Claim results carry one kind beyond the shared client results: `conflict`
 * relays the Platform envelope's person-facing message verbatim (expired
 * code, or agent already connected to a different account).
 */
export type PlatformAgentLinkClaimResult =
  | { kind: 'ok'; data: { connectedAgent: ConnectedAgent } }
  | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'upstream_error'; message: string };

export type PlatformAgentLinkClient = {
  claim(auth: PlatformRequestAuth, code: string): Promise<PlatformAgentLinkClaimResult>;
};

export type PlatformStakingClient = {
  fetchStaking(auth: PlatformRequestAuth, walletAddress: string): Promise<PlatformRwrClientResult<{ staking: RegentStakingState }>>;
  stake(
    auth: PlatformRequestAuth,
    input: { walletAddress: string; amount: string; receiver?: string | undefined }
  ): Promise<PlatformRwrClientResult<RegentStakingActionResponse>>;
  unstake(
    auth: PlatformRequestAuth,
    input: { walletAddress: string; amount: string }
  ): Promise<PlatformRwrClientResult<RegentStakingActionResponse>>;
  claimUsdc(auth: PlatformRequestAuth, walletAddress: string): Promise<PlatformRwrClientResult<RegentStakingActionResponse>>;
  claimRegent(auth: PlatformRequestAuth, walletAddress: string): Promise<PlatformRwrClientResult<RegentStakingActionResponse>>;
  claimAndRestakeRegent(auth: PlatformRequestAuth, walletAddress: string): Promise<PlatformRwrClientResult<RegentStakingActionResponse>>;
};

function withoutOk<T extends { ok?: boolean | undefined }>(value: T): Omit<T, 'ok'> {
  const { ok: _ok, ...rest } = value;
  return rest;
}

function platformBaseUrl() {
  return process.env.PLATFORM_API_BASE_URL?.trim() || '';
}

function platformHeaders(input: PlatformRequestAuth, contentType = false) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (contentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (input.authorization) {
    headers.Authorization = input.authorization;
  }

  return headers;
}

async function requestPlatformJson<T>(
  fetchImpl: typeof fetch,
  auth: PlatformRequestAuth,
  path: string,
  schema: z.ZodType<T>,
  init?: { method?: string; body?: Record<string, unknown> }
): Promise<PlatformRwrClientResult<T>> {
  const baseUrl = platformBaseUrl();
  if (!baseUrl) {
    return { kind: 'missing_config', requiredEnv: 'PLATFORM_API_BASE_URL' };
  }

  try {
    const requestInit: RequestInit = {
      method: init?.method || 'GET',
      headers: platformHeaders(auth, !!init?.body),
    };
    if (init?.body) {
      requestInit.body = JSON.stringify(init.body);
    }

    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, requestInit);

    if (response.status === 401) {
      return { kind: 'unauthorized' };
    }
    if (response.status === 404) {
      return { kind: 'not_found' };
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { kind: 'upstream_error', message: 'Platform records are unavailable.' };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return { kind: 'upstream_error', message: 'Platform response did not match the current contract.' };
    }

    return { kind: 'ok', data: parsed.data };
  } catch (error) {
    return {
      kind: 'upstream_error',
      message: error instanceof Error ? error.message : 'Platform records are unavailable.',
    };
  }
}

export function createPlatformProjectionClient(fetchImpl: typeof fetch = fetch): PlatformProjectionClient {
  return {
    async fetchProjection(input) {
      const baseUrl = platformBaseUrl();
      if (!baseUrl) {
        return { kind: 'missing_config', requiredEnv: 'PLATFORM_API_BASE_URL' };
      }

      try {
        const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/platform/projection`, {
          method: 'GET',
          headers: platformHeaders(input),
        });

        if (response.status === 401) {
          return { kind: 'unauthorized' };
        }

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          return { kind: 'upstream_error', message: 'Platform projection is unavailable.' };
        }

        const parsed = platformProjectionSchema.safeParse(payload);
        if (!parsed.success || !parsed.data.ok) {
          return { kind: 'upstream_error', message: 'Platform projection response did not match the current contract.' };
        }

        return { kind: 'ok', projection: parsed.data.projection };
      } catch (error) {
        return {
          kind: 'upstream_error',
          message: error instanceof Error ? error.message : 'Platform projection is unavailable.',
        };
      }
    },
  };
}

export function createPlatformRwrClient(fetchImpl: typeof fetch = fetch): PlatformRwrClient {
  return {
    async fetchAccount(auth) {
      const result = await requestPlatformJson(fetchImpl, auth, '/api/platform/rwr/account', rwrAccountSchema);
      if (result.kind !== 'ok') {
        return result;
      }

      return {
        kind: 'ok',
        data: {
          authenticated: result.data.authenticated,
          companies: result.data.companies,
        },
      };
    },

    async fetchWorkItems(auth, companyId) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/work-items`,
        rwrWorkItemsSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.work_items } : result;
    },

    async createWorkItem(auth, companyId, input) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/work-items`,
        rwrWorkItemResponseSchema,
        {
          method: 'POST',
          body: {
            company_id: String(companyId),
            title: input.title,
            description: input.description || null,
            priority: input.priority || 'normal',
            visibility: input.visibility || 'operator',
            metadata: input.metadata || {},
          },
        }
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.work_item } : result;
    },

    async startRun(auth, companyId, workItemId, input) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/work-items/${workItemId}/runs`,
        rwrRunResponseSchema,
        {
          method: 'POST',
          body: {
            company_id: String(companyId),
            work_item_id: String(workItemId),
            runner_kind: input.runnerKind || 'codex',
            instructions: input.instructions,
            metadata: input.metadata || {},
          },
        }
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.run } : result;
    },

    async fetchRun(auth, companyId, runId) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/runs/${runId}`,
        rwrRunResponseSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.run } : result;
    },

    async fetchRunEvents(auth, companyId, runId) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/runs/${runId}/events`,
        rwrRunEventsSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.events } : result;
    },

    async fetchApprovals(auth, companyId, runId) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/runs/${runId}/approvals`,
        rwrApprovalsSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.approvals } : result;
    },

    async resolveApproval(auth, companyId, runId, approvalId, decision) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/regents/${companyId}/rwr/runs/${runId}/approvals/${approvalId}/resolve`,
        rwrApprovalResponseSchema,
        {
          method: 'POST',
          body: {
            company_id: String(companyId),
            run_id: String(runId),
            decision,
            resolution: {},
          },
        }
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.approval } : result;
    },
  };
}

export function createPlatformAgentLinkClient(fetchImpl: typeof fetch = fetch): PlatformAgentLinkClient {
  return {
    async claim(auth, code) {
      const baseUrl = platformBaseUrl();
      if (!baseUrl) {
        return { kind: 'missing_config', requiredEnv: 'PLATFORM_API_BASE_URL' };
      }

      try {
        const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/platform/mobile/agent-links/claim`, {
          method: 'POST',
          headers: platformHeaders(auth, true),
          body: JSON.stringify({ code }),
        });

        if (response.status === 401) {
          return { kind: 'unauthorized' };
        }
        if (response.status === 404) {
          return { kind: 'not_found' };
        }

        const payload = await response.json().catch(() => null);

        // Platform answers 409 for the two person-meaningful refusals —
        // an expired code, or an agent already connected to a different
        // account — with copy already written for end users. Relay it.
        if (response.status === 409) {
          const parsedEnvelope = platformStatusMessageSchema.safeParse(payload);
          if (!parsedEnvelope.success) {
            return { kind: 'upstream_error', message: 'Platform response did not match the current contract.' };
          }
          return { kind: 'conflict', message: parsedEnvelope.data.error.message };
        }

        if (!response.ok) {
          return { kind: 'upstream_error', message: 'Platform records are unavailable.' };
        }

        const parsed = agentPhoneLinkClaimSchema.safeParse(payload);
        if (!parsed.success) {
          return { kind: 'upstream_error', message: 'Platform response did not match the current contract.' };
        }

        return {
          kind: 'ok',
          data: { connectedAgent: { id: String(parsed.data.agent.id), name: parsed.data.agent.name } },
        };
      } catch (error) {
        return {
          kind: 'upstream_error',
          message: error instanceof Error ? error.message : 'Platform records are unavailable.',
        };
      }
    },
  };
}

export function createPlatformStakingClient(fetchImpl: typeof fetch = fetch): PlatformStakingClient {
  const actionRequest = (
    auth: PlatformRequestAuth,
    path: string,
    body: Record<string, unknown>
  ): Promise<PlatformRwrClientResult<RegentStakingActionResponse>> =>
    requestPlatformJson(fetchImpl, auth, path, regentStakingActionResponseSchema, {
      method: 'POST',
      body,
    }).then((result) => result.kind === 'ok' ? { kind: 'ok', data: withoutOk(result.data) } : result);

  return {
    async fetchStaking(auth, walletAddress) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/platform/mobile/regent/staking?wallet_address=${encodeURIComponent(walletAddress)}`,
        regentStakingStateSchema
      );

      return result.kind === 'ok' ? { kind: 'ok', data: { staking: withoutOk(result.data) } } : result;
    },

    stake(auth, input) {
      return actionRequest(auth, '/api/platform/mobile/regent/staking/stake', {
        wallet_address: input.walletAddress,
        amount: input.amount,
        ...(input.receiver ? { receiver: input.receiver } : {}),
      });
    },

    unstake(auth, input) {
      return actionRequest(auth, '/api/platform/mobile/regent/staking/unstake', {
        wallet_address: input.walletAddress,
        amount: input.amount,
      });
    },

    claimUsdc(auth, walletAddress) {
      return actionRequest(auth, '/api/platform/mobile/regent/staking/claim-usdc', {
        wallet_address: walletAddress,
      });
    },

    claimRegent(auth, walletAddress) {
      return actionRequest(auth, '/api/platform/mobile/regent/staking/claim-regent', {
        wallet_address: walletAddress,
      });
    },

    claimAndRestakeRegent(auth, walletAddress) {
      return actionRequest(auth, '/api/platform/mobile/regent/staking/claim-and-restake-regent', {
        wallet_address: walletAddress,
      });
    },
  };
}
