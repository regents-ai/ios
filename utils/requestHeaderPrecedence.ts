/**
 * Header precedence for authenticated requests.
 *
 * Precedence rule (single source of truth):
 *   caller/config-supplied headers merge UNDERNEATH security headers,
 *   so caller configuration can never override a security-critical value
 *   such as Authorization.
 *
 * Kept pure (Headers in, Headers out) so the precedence rule itself is
 * unit-testable outside React Native.
 */

export function mergeHeadersUnderSecurity(
  callerHeaders: HeadersInit | undefined,
  securityHeaders: Record<string, string>
): Headers {
  // 1. Start from the caller-supplied headers (the "underneath" layer).
  const headers = new Headers(callerHeaders || {});

  // 2. Security headers are written last and unconditionally, so they always
  //    win over anything the caller (or future user/env config) supplied.
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }

  return headers;
}
