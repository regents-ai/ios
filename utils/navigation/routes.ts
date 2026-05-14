import { Href } from 'expo-router';

export const routes = {
  wallet(): Href {
    return '/wallet';
  },

  walletSend(params?: {
    flow?: 'agent-funding';
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

  terminal(): Href {
    return '/terminal';
  },

  terminalSession(sessionId: string): Href {
    return { pathname: '/terminal/[id]', params: { id: sessionId } };
  },

  agent(regentId: string): Href {
    return { pathname: '/agent/[id]', params: { id: regentId } };
  },

  regentManager(regentId: string): Href {
    return { pathname: '/agent/[id]/regent-manager', params: { id: regentId } };
  },

  onrampReturn(partnerUserRef?: string | null): Href {
    return partnerUserRef
      ? { pathname: '/onramp-return', params: { partnerUserRef } }
      : { pathname: '/onramp-return' };
  },
};
