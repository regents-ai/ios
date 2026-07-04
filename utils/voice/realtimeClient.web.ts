/**
 * Web variant of the Hermes realtime voice client.
 *
 * Metro resolves this file for web builds instead of `realtimeClient.ts`, so
 * the native voice stack (react-native-webrtc) never enters the web bundle.
 * Voice sessions are a phone feature; this variant keeps the same surface and
 * reports that voice is unavailable if anything tries to start one on web.
 */

import type { HermesVoiceSession } from '@/types/regents';

export type RealtimeToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type HermesRealtimeClient = {
  connect(): Promise<void>;
  disconnect(): void;
  sendToolResult(input: { toolCallId: string; output: unknown }): void;
};

type RealtimeClientOptions = {
  session: HermesVoiceSession;
  onToolCall?: (toolCall: RealtimeToolCall) => void;
  onTranscript?: (turn: { role: 'user' | 'assistant'; text: string }) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onError?: (message: string) => void;
};

export function createHermesRealtimeClient(options: RealtimeClientOptions): HermesRealtimeClient {
  return {
    async connect() {
      options.onStatus?.('disconnected');
      options.onError?.('Voice is available in the Regents app on your phone.');
    },

    disconnect() {
      options.onStatus?.('disconnected');
    },

    sendToolResult() {
      // Voice never connects on web, so there is no session to send results to.
    },
  };
}
