/**
 * Read-only client for Autolaunch's public, no-auth auction JSON.
 *
 * Public data, so the app reads autolaunch.sh directly rather than through
 * the mobile backend. Failures become the app's ApiError taxonomy so the
 * list and detail screens describe them like every other load.
 */

import { AUTOLAUNCH_URL } from '@/constants/AUTOLAUNCH_URL';
import type { AutolaunchAuction, AutolaunchAuctionPage } from '@/types/autolaunch';
import { ApiError, apiFailureKindForStatus } from '@/utils/apiError';

type AutolaunchPath = '/api/v1/auctions' | `/api/v1/auctions/${string}`;

async function autolaunchFetch<T>(path: AutolaunchPath): Promise<T> {
  const response = await fetch(`${AUTOLAUNCH_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('invalid-response', 'Autolaunch sent an unexpected reply.', response.status);
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error?: { message?: string } }).error?.message ?? ''
        : '';
    throw new ApiError(apiFailureKindForStatus(response.status), message, response.status);
  }

  return body as T;
}

/** Every public auction, newest first. */
export async function listAutolaunchAuctions(): Promise<AutolaunchAuction[]> {
  const page = await autolaunchFetch<AutolaunchAuctionPage>('/api/v1/auctions');
  return page.data;
}

/** One auction by its Base id or Robinhood address. */
export async function getAutolaunchAuction(reference: string): Promise<AutolaunchAuction> {
  const body = await autolaunchFetch<{ data: AutolaunchAuction }>(
    `/api/v1/auctions/${encodeURIComponent(reference)}`
  );
  return body.data;
}
