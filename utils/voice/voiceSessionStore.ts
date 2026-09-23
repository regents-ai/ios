import AsyncStorage from '@react-native-async-storage/async-storage';

const currentVoiceSessionKey = 'regents:hermesVoice:currentSession';

export async function saveCurrentVoiceSession(input: { agentId: string; sessionId: string }) {
  await AsyncStorage.setItem(currentVoiceSessionKey, JSON.stringify(input));
}

export async function clearCurrentVoiceSession() {
  await AsyncStorage.removeItem(currentVoiceSessionKey);
}
