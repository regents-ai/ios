import { Href } from 'expo-router';

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
    regentId?: string;
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

  settings(): Href {
    return '/settings';
  },

  localVoicePairing(params: { regentId: string; agentWallet: string; name?: string }): Href {
    return {
      pathname: '/settings/local-voice',
      params: params.name
        ? { id: params.regentId, wallet: params.agentWallet, name: params.name }
        : { id: params.regentId, wallet: params.agentWallet },
    };
  },

  message(): Href {
    return '/message';
  },

  messageThread(threadId: string): Href {
    return { pathname: '/message/[id]', params: { id: threadId } };
  },

  agent(regentId: string): Href {
    return { pathname: '/agent/[id]', params: { id: regentId } };
  },

  regentManager(regentId: string): Href {
    return { pathname: '/agent/[id]/regent-manager', params: { id: regentId } };
  },

  agentVoice(regentId: string, name?: string): Href {
    return name
      ? { pathname: '/agent/[id]/voice', params: { id: regentId, name } }
      : { pathname: '/agent/[id]/voice', params: { id: regentId } };
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
};
