import {
  CreateHermesVoiceSessionRequest,
  HermesVoiceSession,
  HermesVoiceStatus,
  HermesVoiceToolResult,
} from '@/types/regents';

const mobileAgentVoicePath = '/mobile/agents';

export type MobileHermesVoicePath =
  | `${typeof mobileAgentVoicePath}/${string}/voice/status`
  | `${typeof mobileAgentVoicePath}/${string}/voice/session`
  | `${typeof mobileAgentVoicePath}/${string}/voice/prewarm`
  | `${typeof mobileAgentVoicePath}/${string}/voice/disconnect`
  | `${typeof mobileAgentVoicePath}/${string}/voice/tool-results`;

type RequestJson = <T>(path: MobileHermesVoicePath, init?: RequestInit, errorMessage?: string) => Promise<T>;

const voicePath = (
  agentId: string,
  suffix: 'status' | 'session' | 'prewarm' | 'disconnect' | 'tool-results',
): MobileHermesVoicePath =>
  `${mobileAgentVoicePath}/${encodeURIComponent(agentId)}/voice/${suffix}`;

export function createHermesVoiceApi(requestJson: RequestJson) {
  return {
    getHermesVoiceStatus(agentId: string): Promise<HermesVoiceStatus> {
      return requestJson<HermesVoiceStatus>(
        voicePath(agentId, 'status'),
        undefined,
        'Unable to load voice right now.',
      );
    },

    createHermesVoiceSession(input: {
      agentId: string;
      session: CreateHermesVoiceSessionRequest;
    }): Promise<HermesVoiceSession> {
      return requestJson<HermesVoiceSession>(
        voicePath(input.agentId, 'session'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input.session),
        },
        'Unable to start voice right now.',
      );
    },

    prewarmHermesVoice(agentId: string): Promise<{ ok: boolean }> {
      return requestJson<{ ok: boolean }>(
        voicePath(agentId, 'prewarm'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
        'Unable to prepare voice right now.',
      );
    },

    disconnectHermesVoice(input: { agentId: string; sessionId: string }): Promise<{ ok: boolean }> {
      return requestJson<{ ok: boolean }>(
        voicePath(input.agentId, 'disconnect'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: input.sessionId }),
        },
        'Unable to end voice right now.',
      );
    },

    submitHermesVoiceToolResult(input: {
      agentId: string;
      result: HermesVoiceToolResult;
    }): Promise<{ ok: boolean }> {
      return requestJson<{ ok: boolean }>(
        voicePath(input.agentId, 'tool-results'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input.result),
        },
        'Unable to send this voice response right now.',
      );
    },
  };
}
