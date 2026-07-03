/**
 * Authenticated Fetch Wrapper
 *
 * Automatically adds the current app access token to backend requests.
 * Drop-in replacement for fetch() - handles authentication transparently.
 *
 * Usage:
 * ```typescript
 * import { authenticatedFetch } from '@/utils/authenticatedFetch';
 *
 * // Instead of:
 * const response = await fetch(url, { headers: { Authorization: ... } });
 *
 * // Simply use:
 * const response = await authenticatedFetch(url, options);
 * ```
 *
 * Header precedence: caller-supplied headers merge UNDERNEATH the auth
 * header, so caller configuration can never override the Authorization
 * value this wrapper owns (see utils/requestHeaderPrecedence.ts).
 */

import { ApiError } from './apiError';
import { getAccessTokenGlobal } from './getAccessTokenGlobal';
import { mergeHeadersUnderSecurity } from './requestHeaderPrecedence';

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Request-time snapshot: the token is read fresh for every request rather
  // than captured once, so a rotated session is picked up immediately.
  const token = await getAccessTokenGlobal();

  if (!token) {
    throw new ApiError('auth', 'Your session ended. Sign in again to pick up where you left off.');
  }

  // Caller headers first, security headers on top — security always wins.
  const headers = mergeHeadersUnderSecurity(init?.headers, {
    Authorization: `Bearer ${token}`,
  });

  // Log for debugging (in development)
  if (__DEV__) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    console.log('🔐 [AUTH FETCH] Authenticated request to:', url);
  }

  // Make the request with authentication
  return fetch(input, {
    ...init,
    headers,
  });
}
