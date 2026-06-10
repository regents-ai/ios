import type { ChatGptSession } from '@/modules/regents-chatgpt-auth/src';
import {
  getSession as getNativeSession,
  refreshSession as refreshNativeSession,
  signIn as signInNative,
  signOut as signOutNative,
} from '@/modules/regents-chatgpt-auth/src';
import { useCallback, useEffect, useState } from 'react';

type Listener = (session: ChatGptSession | null) => void;

let cachedSession: ChatGptSession | null | undefined;
const listeners = new Set<Listener>();

function publishSession(session: ChatGptSession | null) {
  cachedSession = session;
  listeners.forEach((listener) => listener(session));
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPublicError(error: unknown) {
  return error instanceof Error ? error.message : 'ChatGPT sign-in could not finish. Please try again.';
}

export function useChatGptAuth() {
  const [session, setSession] = useState<ChatGptSession | null>(cachedSession ?? null);
  const [isReady, setIsReady] = useState(cachedSession !== undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextSession = await getNativeSession();
      publishSession(nextSession);
      return nextSession;
    } catch (loadError) {
      setError(getPublicError(loadError));
      publishSession(null);
      return null;
    } finally {
      setIsReady(true);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((nextSession) => {
      setSession(nextSession);
      setIsReady(true);
    });
    if (cachedSession === undefined) {
      void loadSession();
    }
    return unsubscribe;
  }, [loadSession]);

  const signIn = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextSession = await signInNative();
      publishSession(nextSession);
      setIsReady(true);
      return nextSession;
    } catch (signInError) {
      setError(getPublicError(signInError));
      throw signInError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextSession = await refreshNativeSession();
      publishSession(nextSession);
      setIsReady(true);
      return nextSession;
    } catch (refreshError) {
      setError(getPublicError(refreshError));
      throw refreshError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signOutNative();
      publishSession(null);
      setIsReady(true);
    } catch (signOutError) {
      setError(getPublicError(signOutError));
      throw signOutError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    session,
    isSignedIn: !!session?.isSignedIn,
    isReady,
    isLoading,
    error,
    getSession: loadSession,
    refreshSession,
    signIn,
    signOut,
    clearError: () => setError(null),
  };
}
