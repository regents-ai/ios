import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type ChatGptSession = {
  accountId: string;
  planType: string | null;
  expiresAt: string;
  isSignedIn: boolean;
};

type RegentsChatGptAuthNativeModule = {
  signIn(): Promise<ChatGptSession>;
  getSession(): Promise<ChatGptSession | null>;
  refreshSession(): Promise<ChatGptSession | null>;
  signOut(): Promise<void>;
};

const nativeModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<RegentsChatGptAuthNativeModule>('RegentsChatGptAuth')
    : null;

function requireNativeModule() {
  if (!nativeModule) {
    throw new Error('ChatGPT sign-in is available in the iPhone app.');
  }

  return nativeModule;
}

export async function signIn() {
  return requireNativeModule().signIn();
}

export async function getSession() {
  return nativeModule?.getSession() ?? null;
}

export async function refreshSession() {
  return nativeModule?.refreshSession() ?? null;
}

export async function signOut() {
  await nativeModule?.signOut();
}
