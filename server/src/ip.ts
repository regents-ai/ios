
/**
 * IP Resolution Service for Coinbase Onramp API
 *
 * COINBASE SECURITY REQUIREMENTS (Official Docs):
 * @see https://docs.cdp.coinbase.com/onramp-&-offramp/security-requirements
 * @see https://docs.cdp.coinbase.com/onramp-&-offramp/onramp-apis/generating-onramp-url
 *
 * "The client IP address of the end user. This parameter is required for security
 * validation to ensure the quote can only be used by the requesting user.
 * Do not trust HTTP headers like X-Forwarded-For — these can be easily spoofed."
 *
 * IMPLEMENTATION STRATEGY (Fly.io production):
 *
 * 1. FLY-CLIENT-IP HEADER (Production on Fly.io):
 *    - fly-proxy terminates every public connection and always sets the
 *      Fly-Client-IP header to the real client IP, overwriting anything the
 *      client sent. It is the authoritative client IP on Fly.
 *    - X-Forwarded-For is NOT safe here: fly-proxy appends to the chain, so a
 *      client-supplied X-Forwarded-For value survives as the leftmost entry.
 *
 * 2. DIRECT CONNECTION (no Fly-Client-IP header, e.g. self-hosted / tests):
 *    - Use req.ip (Express, with trust proxy = 1) or req.socket.remoteAddress.
 *
 * 3. LOCALHOST (Development):
 *    - Both approaches give 127.0.0.1 (server and client on same machine)
 *    - MUST use external IP service (ipify.org) to get developer's real public IP
 *    - Coinbase will reject localhost IPs in production mode
 */

import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 0, timeout: 10_000 } })); // allow both IPv4 and IPv6

const isPrivate = (ip?: string) => {
  if (!ip) return true;
  const v = ip.replace('::ffff:', '');
  return (
    v === '127.0.0.1' ||
    v === '::1' ||
    v.startsWith('10.') ||
    v.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(v) ||
    v.startsWith('fe80:') || // link-local v6
    v.startsWith('fc') || v.startsWith('fd') // unique local v6
  );
};

async function getPublicIp(): Promise<string> {
  // NO CACHING: User IP can change when switching networks (WiFi ↔ Mobile)
  // Caching would cause mismatches with Coinbase validation

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000); // Shorter timeout

  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    return (j.ip || '').trim();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

/**
 * The trusted client IP for this request, synchronously.
 * Fly-Client-IP (set by fly-proxy on every public request) wins; otherwise the
 * Express-resolved req.ip, otherwise the raw socket address.
 */
export function trustedClientIp(req: {
  headers?: Record<string, string | string[] | undefined> | undefined;
  ip?: string | undefined;
  socket?: { remoteAddress?: string | undefined } | undefined;
}): string {
  const flyClientIp = req.headers?.['fly-client-ip'];
  const headerValue = Array.isArray(flyClientIp) ? flyClientIp[0] : flyClientIp;
  const trimmed = headerValue?.trim();
  if (trimmed) {
    return trimmed;
  }

  return req.ip || req.socket?.remoteAddress || '';
}

export async function resolveClientIp(req: any): Promise<string> {
  const clientIp = trustedClientIp(req);

  // For development environments with private IPs, use fallback
  if (isPrivate(clientIp)) {
    const fallbackIp = await getPublicIp().catch(() => '');
    return fallbackIp || clientIp;
  }

  return clientIp;
}
