import { createHash, randomBytes } from 'node:crypto';

export const PORTAL_REDIRECT_URI = 'https://regents-mobile-server.fly.dev/oauth/callback';
const DEFAULT_PORTAL_BASE_URL = 'https://portal.nousresearch.com';
const PORTAL_SCOPE = 'mcp:manage_agents';

export type PortalOAuthConfig = {
  clientId: string;
  baseUrl: string;
};

export type PortalAuthorizationRequest = {
  authorizeUrl: string;
  state: string;
  verifier: string;
};

export type PortalTokenExchangeResult =
  | {
      kind: 'ok';
      refreshToken: string;
      accountLabel: string | null;
    }
  | { kind: 'upstream_error' };

export type PortalOAuthClient = {
  createAuthorizationRequest(): PortalAuthorizationRequest;
  exchangeCode(input: {
    code: string;
    verifier: string;
  }): Promise<PortalTokenExchangeResult>;
};

export class PortalOAuthConfigurationError extends Error {}

function readConfig(env: NodeJS.ProcessEnv): PortalOAuthConfig {
  const clientId = env.PORTAL_CLIENT_ID?.trim();
  if (!clientId) {
    throw new PortalOAuthConfigurationError('PORTAL_CLIENT_ID is required.');
  }

  return {
    clientId,
    baseUrl: env.PORTAL_BASE_URL?.trim() || DEFAULT_PORTAL_BASE_URL,
  };
}

function portalBaseUrl(rawBaseUrl: string) {
  const url = new URL(rawBaseUrl);
  if (url.protocol !== 'https:') {
    throw new PortalOAuthConfigurationError('PORTAL_BASE_URL must use HTTPS.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function portalUrl(baseUrl: URL, pathname: string) {
  const url = new URL(pathname, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new PortalOAuthConfigurationError('Portal request host is not allowed.');
  }
  return url;
}

function base64UrlRandom(bytes: number) {
  return randomBytes(bytes).toString('base64url');
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createPortalOAuthClient(input?: {
  config?: PortalOAuthConfig;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}): PortalOAuthClient {
  const config = input?.config || readConfig(input?.env || process.env);
  const baseUrl = portalBaseUrl(config.baseUrl);
  const fetchImpl = input?.fetchImpl || fetch;

  return {
    createAuthorizationRequest() {
      const state = base64UrlRandom(24);
      const verifier = base64UrlRandom(32);
      const authorizeUrl = portalUrl(baseUrl, '/oauth/authorize');
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', config.clientId);
      authorizeUrl.searchParams.set('redirect_uri', PORTAL_REDIRECT_URI);
      authorizeUrl.searchParams.set('scope', PORTAL_SCOPE);
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('code_challenge', pkceChallenge(verifier));
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');

      return {
        authorizeUrl: authorizeUrl.toString(),
        state,
        verifier,
      };
    },

    async exchangeCode(input) {
      const tokenUrl = portalUrl(baseUrl, '/api/oauth/token');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        redirect_uri: PORTAL_REDIRECT_URI,
        code: input.code,
        code_verifier: input.verifier,
      });

      try {
        const response = await fetchImpl(tokenUrl, {
          method: 'POST',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });
        const payload = await response.json().catch(() => null);
        const refreshToken =
          payload && typeof payload === 'object' && typeof payload.refresh_token === 'string'
            ? payload.refresh_token.trim()
            : null;

        if (!response.ok || !refreshToken) {
          return { kind: 'upstream_error' };
        }

        return {
          kind: 'ok',
          refreshToken,
          accountLabel:
            typeof payload.account_label === 'string' && payload.account_label.trim()
              ? payload.account_label.trim()
              : null,
        };
      } catch {
        return { kind: 'upstream_error' };
      }
    },
  };
}
