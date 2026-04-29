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

export type PlatformProjectionClientResult =
  | { kind: 'ok'; projection: PlatformProjection }
  | { kind: 'missing_config'; requiredEnv: 'PLATFORM_API_BASE_URL' }
  | { kind: 'unauthorized' }
  | { kind: 'upstream_error'; message: string };

export type PlatformProjectionClient = {
  fetchProjection(input: {
    authorization?: string | undefined;
    cookie?: string | undefined;
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
  cookie?: string | undefined;
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
  if (input.cookie) {
    headers.Cookie = input.cookie;
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
        const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/agent-platform/projection`, {
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
      const result = await requestPlatformJson(fetchImpl, auth, '/api/agent-platform/rwr/account', rwrAccountSchema);
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
        `/api/agent-platform/companies/${companyId}/rwr/work-items`,
        rwrWorkItemsSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.work_items } : result;
    },

    async createWorkItem(auth, companyId, input) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/agent-platform/companies/${companyId}/rwr/work-items`,
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
        `/api/agent-platform/companies/${companyId}/rwr/work-items/${workItemId}/runs`,
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
        `/api/agent-platform/companies/${companyId}/rwr/runs/${runId}`,
        rwrRunResponseSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.run } : result;
    },

    async fetchRunEvents(auth, companyId, runId) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/agent-platform/companies/${companyId}/rwr/runs/${runId}/events`,
        rwrRunEventsSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.events } : result;
    },

    async fetchApprovals(auth, companyId, runId) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/agent-platform/companies/${companyId}/rwr/runs/${runId}/approvals`,
        rwrApprovalsSchema
      );
      return result.kind === 'ok' ? { kind: 'ok', data: result.data.approvals } : result;
    },

    async resolveApproval(auth, companyId, runId, approvalId, decision) {
      const result = await requestPlatformJson(
        fetchImpl,
        auth,
        `/api/agent-platform/companies/${companyId}/rwr/runs/${runId}/approvals/${approvalId}/resolve`,
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
