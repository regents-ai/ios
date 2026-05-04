import * as WebBrowser from 'expo-web-browser';
import type { Href } from 'expo-router';

import { routes } from '@/utils/navigation/routes';

export const coinbaseWidgetReturnUrl = 'regentsmobile://onramp-return';

type WidgetRouter = {
  push: (href: Href) => void;
};

function partnerUserRefFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get('partnerUserRef');
  } catch {
    return null;
  }
}

export async function openCoinbaseWidgetSession(input: {
  router: WidgetRouter;
  url: string;
  partnerUserRef?: string | null;
}) {
  const result = await WebBrowser.openAuthSessionAsync(input.url, 'regentsmobile://');
  if (result.type !== 'success' || !result.url) {
    return;
  }

  input.router.push(routes.onrampReturn(partnerUserRefFromUrl(result.url) || input.partnerUserRef));
}
