import { isReleaseRuntime } from '../runtime.js';

export type HermesVoiceAccount = {
  required: true;
  satisfied: boolean;
  provider: 'openai_chatgpt';
  connect_url?: string | null | undefined;
};

export type HermesVoiceTool = {
  name: string;
  owner: 'hermes' | 'ios';
  description: string;
  requires_approval?: boolean;
};

export type HermesVoiceStatus = {
  enabled: boolean;
  health: 'ok' | 'degraded' | 'unavailable';
  agent_id: string;
  account: HermesVoiceAccount;
  active_session_id?: string | null;
  active_turn_id?: string | null;
  queue_depth?: number;
  last_event_id?: string | null;
};

export type HermesVoiceSession = {
  session_id: string;
  agent_id: string;
  expires_at: string;
  realtime: {
    provider: 'openai-realtime';
    model: string;
    client_secret: string;
    client_secret_expires_at: string;
    calls_url?: string;
    realtime_session_id?: string | null;
  };
  tools: HermesVoiceTool[];
};

export type HermesVoiceToolResult = {
  session_id: string;
  tool_call_id: string;
  ok: boolean;
  result?: unknown;
  error?: Record<string, unknown> | null | undefined;
};

export type HermesVoiceClientResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'missing_config'; requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' | 'voice.session_url' | 'voice.status_url' }
  | { kind: 'unauthorized' }
  | { kind: 'upstream_error'; message: string };

export type HermesVoiceClient = {
  status(input: { statusUrl: string; authorization?: string | undefined }): Promise<HermesVoiceClientResult<HermesVoiceStatus>>;
  createSession(input: {
    sessionUrl: string;
    authorization?: string | undefined;
    safetyIdentifier: string;
    body: Record<string, unknown>;
  }): Promise<HermesVoiceClientResult<HermesVoiceSession>>;
  prewarm(input: { sessionUrl: string; authorization?: string | undefined; safetyIdentifier: string }): Promise<HermesVoiceClientResult<{ ok: boolean }>>;
  disconnect(input: {
    sessionUrl: string;
    authorization?: string | undefined;
    safetyIdentifier: string;
    body: Record<string, unknown>;
  }): Promise<HermesVoiceClientResult<{ ok: boolean }>>;
  submitToolResult(input: {
    sessionUrl: string;
    authorization?: string | undefined;
    safetyIdentifier: string;
    body: HermesVoiceToolResult;
  }): Promise<HermesVoiceClientResult<{ ok: boolean }>>;
};

function gatewayToken() {
  return process.env.HERMES_VOICE_GATEWAY_TOKEN?.trim() || '';
}

/**
 * Host pin for the voice gateway. The session_url/status_url values come from
 * the Platform projection; if Platform ever served an attacker-influenced URL
 * the gateway token in the Authorization header would leak to that host. Only
 * talk to hosts we recognize as agent workspaces (`*.sprites.dev`, HTTPS) or
 * hosts the operator explicitly allowed via HERMES_VOICE_ALLOWED_HOSTS
 * (comma-separated exact hostnames, e.g. a local gateway during development).
 */
const ALLOWED_GATEWAY_HOST_SUFFIXES = ['.sprites.dev'];

function operatorAllowedHosts(): string[] {
  return (process.env.HERMES_VOICE_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

export function isAllowedHermesGatewayUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (operatorAllowedHosts().includes(host)) {
    return true;
  }

  return url.protocol === 'https:' && ALLOWED_GATEWAY_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function headers(input: {
  authorization?: string | undefined;
  contentType?: boolean | undefined;
  safetyIdentifier?: string | undefined;
}) {
  const token = gatewayToken();
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (input.contentType) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (input.authorization) {
    requestHeaders['X-Regent-Mobile-Authorization'] = input.authorization;
  }

  if (input.safetyIdentifier) {
    requestHeaders['OpenAI-Safety-Identifier'] = input.safetyIdentifier;
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  return requestHeaders;
}

function siblingUrl(sessionUrl: string, endpoint: 'prewarm' | 'disconnect' | 'tool-result') {
  const url = new URL(sessionUrl);
  url.pathname = url.pathname.replace(/\/session\/?$/, `/${endpoint}`);
  return url.toString();
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<HermesVoiceClientResult<T>> {
  if (!gatewayToken() && isReleaseRuntime()) {
    return { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' };
  }

  if (!isAllowedHermesGatewayUrl(url)) {
    console.error('❌ [VOICE] Blocked Hermes voice request to unapproved gateway host.');
    return { kind: 'upstream_error', message: 'Hermes voice is unavailable.' };
  }

  try {
    const response = await fetchImpl(url, init);
    if (response.status === 401 || response.status === 403) {
      return { kind: 'unauthorized' };
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { kind: 'upstream_error', message: 'Hermes voice is unavailable.' };
    }

    return { kind: 'ok', data: payload as T };
  } catch (error) {
    return {
      kind: 'upstream_error',
      message: error instanceof Error ? error.message : 'Hermes voice is unavailable.',
    };
  }
}

export function createHermesVoiceClient(fetchImpl: typeof fetch = fetch): HermesVoiceClient {
  return {
    async status(input) {
      if (!input.statusUrl) {
        return { kind: 'missing_config', requiredEnv: 'voice.status_url' };
      }

      return requestJson<HermesVoiceStatus>(fetchImpl, input.statusUrl, {
        method: 'GET',
        headers: headers({ authorization: input.authorization }),
      });
    },

    async createSession(input) {
      if (!input.sessionUrl) {
        return { kind: 'missing_config', requiredEnv: 'voice.session_url' };
      }

      return requestJson<HermesVoiceSession>(fetchImpl, input.sessionUrl, {
        method: 'POST',
        headers: headers({
          authorization: input.authorization,
          contentType: true,
          safetyIdentifier: input.safetyIdentifier,
        }),
        body: JSON.stringify(input.body),
      });
    },

    async prewarm(input) {
      if (!input.sessionUrl) {
        return { kind: 'missing_config', requiredEnv: 'voice.session_url' };
      }

      return requestJson<{ ok: boolean }>(fetchImpl, siblingUrl(input.sessionUrl, 'prewarm'), {
        method: 'POST',
        headers: headers({
          authorization: input.authorization,
          contentType: true,
          safetyIdentifier: input.safetyIdentifier,
        }),
        body: JSON.stringify({}),
      });
    },

    async disconnect(input) {
      if (!input.sessionUrl) {
        return { kind: 'missing_config', requiredEnv: 'voice.session_url' };
      }

      return requestJson<{ ok: boolean }>(fetchImpl, siblingUrl(input.sessionUrl, 'disconnect'), {
        method: 'POST',
        headers: headers({
          authorization: input.authorization,
          contentType: true,
          safetyIdentifier: input.safetyIdentifier,
        }),
        body: JSON.stringify(input.body),
      });
    },

    async submitToolResult(input) {
      if (!input.sessionUrl) {
        return { kind: 'missing_config', requiredEnv: 'voice.session_url' };
      }

      return requestJson<{ ok: boolean }>(fetchImpl, siblingUrl(input.sessionUrl, 'tool-result'), {
        method: 'POST',
        headers: headers({
          authorization: input.authorization,
          contentType: true,
          safetyIdentifier: input.safetyIdentifier,
        }),
        body: JSON.stringify(input.body),
      });
    },
  };
}
