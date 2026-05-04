import { Href } from 'expo-router';

export const routes = {
  wallet(): Href {
    return '/wallet';
  },

  agent(regentId: string): Href {
    return { pathname: '/agent/[id]', params: { id: regentId } };
  },

  regentManager(regentId: string): Href {
    return { pathname: '/agent/[id]/regent-manager', params: { id: regentId } };
  },

  terminalSession(sessionId: string): Href {
    return { pathname: '/terminal/[id]', params: { id: sessionId } };
  },

  onrampReturn(partnerUserRef?: string | null): Href {
    return partnerUserRef
      ? { pathname: '/onramp-return', params: { partnerUserRef } }
      : { pathname: '/onramp-return' };
  },
};
