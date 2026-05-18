import AsyncStorage from '@react-native-async-storage/async-storage';

const currentVoiceSessionKey = 'regents:hermesVoice:currentSession';

export async function saveCurrentVoiceSession(input: { agentId: string; sessionId: string }) {
  await AsyncStorage.setItem(currentVoiceSessionKey, JSON.stringify(input));
}

export async function clearCurrentVoiceSession() {
  await AsyncStorage.removeItem(currentVoiceSessionKey);
}

export async function readCurrentVoiceSession(): Promise<{ agentId: string; sessionId: string } | null> {
  const rawValue = await AsyncStorage.getItem(currentVoiceSessionKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return typeof parsed.agentId === 'string' && typeof parsed.sessionId === 'string'
      ? { agentId: parsed.agentId, sessionId: parsed.sessionId }
      : null;
  } catch {
    return null;
  }
}
