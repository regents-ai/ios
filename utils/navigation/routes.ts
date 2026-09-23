import { Href } from 'expo-router';

import type { MobileAgentKind } from '@/types/regents';

type EmailVerifyMode = 'signin' | 'link';
type PhoneVerifyMode = 'signin' | 'link' | 'reverify';

export const routes = {
  wallet(): Href {
    return '/wallet';
  },

  pay(): Href {
    return { pathname: '/wallet/send', params: { flow: 'send' } };
  },

  walletSend(params?: {
    flow?: 'agent-funding' | 'send';
    recipientAddress?: string;
    recipientLabel?: string;
    network?: string;
    token?: string;
  }): Href {
    return params
      ? { pathname: '/wallet/send', params }
      : '/wallet/send';
  },

  staking(): Href {
    return '/staking';
  },

  auction(reference: string): Href {
    return { pathname: '/auction/[id]', params: { id: reference } };
  },

  settings(): Href {
    return '/settings';
  },

  agents(): Href {
    return '/(tabs)/agents';
  },

  addAgent(): Href {
    return '/agent/add';
  },

  agentPairing(params: { name: string; kind: MobileAgentKind }): Href {
    return { pathname: '/agent/pair', params };
  },

  agent(agentId: string): Href {
    return { pathname: '/agent/[id]', params: { id: agentId } };
  },

  requests(): Href {
    return '/requests';
  },

  /** A payment request; `action` starts paying or declining as soon as the screen opens. */
  paymentRequest(requestId: string, action?: 'pay' | 'decline'): Href {
    return action
      ? { pathname: '/request/[id]', params: { id: requestId, action } }
      : { pathname: '/request/[id]', params: { id: requestId } };
  },

  emailVerify(params: { mode: EmailVerifyMode; initialEmail?: string }): Href {
    return { pathname: '/email-verify', params };
  },

  phoneVerify(params: {
    mode: PhoneVerifyMode;
    initialPhone?: string;
    autoSend?: 'true';
  }): Href {
    return { pathname: '/phone-verify', params };
  },

  onrampReturn(partnerUserRef?: string | null): Href {
    return partnerUserRef
      ? { pathname: '/onramp-return', params: { partnerUserRef } }
      : { pathname: '/onramp-return' };
  },

  portalPairing(returnUrl?: string | null): Href {
    return returnUrl
      ? { pathname: '/onboarding/connect-portal', params: { returnUrl } }
      : '/onboarding/connect-portal';
  },
};
