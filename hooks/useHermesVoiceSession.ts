import type { HermesVoiceSession, HermesVoiceStatus, RegentRuntimeKind } from '@/types/regents';
import { describeApiError } from '@/utils/apiError';
import { regentApi } from '@/utils/regentApi/client';
import { isIosOwnedTool, runDeviceTool, type VoiceApprovalRequest } from '@/utils/voice/deviceTools';
import { forwardHermesToolCall, isHermesOwnedTool } from '@/utils/voice/hermesVoiceTools';
import {
  createLocalHermesVoiceSession,
  type LocalVoiceGateway,
} from '@/utils/voice/localGateway';
import { readPairedGateway } from '@/utils/voice/localGatewayStore';
import { createHermesRealtimeClient, type HermesRealtimeClient, type RealtimeToolCall } from '@/utils/voice/realtimeClient';
import { clearCurrentVoiceSession, saveCurrentVoiceSession } from '@/utils/voice/voiceSessionStore';
import { getCalendars, getLocales } from 'expo-localization';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

type VoiceConnectionState = 'idle' | 'checking' | 'connecting' | 'connected' | 'disconnected' | 'error';

type VoiceTranscriptTurn = {
  role: 'user' | 'assistant';
  text: string;
};

function voiceSummary(turns: VoiceTranscriptTurn[]) {
  const lines = turns
    .map((turn) => `${turn.role === 'user' ? 'You' : 'Hermes'}: ${turn.text}`)
    .filter((line) => line.trim());
  const summary = lines.join('\n').slice(0, 2400).trim();
  return summary ? `Voice summary\n${summary}` : null;
}

type UseHermesVoiceSessionInput = {
  agentId: string;
  agentName?: string;
  runtimeKind: RegentRuntimeKind;
  agentWallet: string;
};

export function useHermesVoiceSession({
  agentId,
  agentName = 'Hermes',
  runtimeKind,
  agentWallet,
}: UseHermesVoiceSessionInput) {
  const [status, setStatus] = useState<HermesVoiceStatus | null>(null);
  const [session, setSession] = useState<HermesVoiceSession | null>(null);
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<VoiceApprovalRequest | null>(null);
  const [localGateway, setLocalGateway] = useState<LocalVoiceGateway | null>(null);
  const realtimeClient = useRef<HermesRealtimeClient | null>(null);
  const sessionRef = useRef<HermesVoiceSession | null>(null);
  const transcriptTurns = useRef<VoiceTranscriptTurn[]>([]);
  const persistedVoiceSessionIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const isSelfHosted = runtimeKind === 'self_hosted';

  // A self-run agent talks to its own paired computer; a hosted agent always
  // uses the hosted path and never reads a local gateway. Refreshed when the
  // pairing screen changes it via refreshLocalGateway.
  const refreshLocalGateway = useCallback(async () => {
    if (!isSelfHosted) {
      setLocalGateway(null);
      return null;
    }
    const paired = await readPairedGateway(agentWallet).catch(() => null);
    setLocalGateway(paired);
    return paired;
  }, [isSelfHosted, agentWallet]);

  useEffect(() => {
    void refreshLocalGateway();
  }, [refreshLocalGateway]);

  const submitToolOutput = useCallback(async (input: {
    toolCall: RealtimeToolCall;
    output: Record<string, unknown>;
    ok?: boolean;
  }) => {
    const activeSession = sessionRef.current;
    if (!activeSession) {
      return;
    }

    realtimeClient.current?.sendToolResult({
      toolCallId: input.toolCall.id,
      output: input.output,
    });

    await regentApi.submitHermesVoiceToolResult({
      agentId,
      result: {
        session_id: activeSession.session_id,
        tool_call_id: input.toolCall.id,
        ok: input.ok ?? true,
        result: input.output,
      },
    }).catch(() => null);
  }, [agentId]);

  const handleToolCall = useCallback(async (toolCall: RealtimeToolCall) => {
    const activeSession = sessionRef.current;
    if (!activeSession) {
      return;
    }

    if (isHermesOwnedTool(toolCall.name)) {
      const output = await forwardHermesToolCall({
        agentId,
        sessionId: activeSession.session_id,
        toolCall,
      });
      realtimeClient.current?.sendToolResult({ toolCallId: toolCall.id, output });
      return;
    }

    if (isIosOwnedTool(toolCall.name)) {
      const result = await runDeviceTool(toolCall);
      if (result.kind === 'approval_required') {
        setApprovalRequest(result.approval);
        return;
      }

      await submitToolOutput({ toolCall, output: result.output });
      return;
    }

    await submitToolOutput({
      toolCall,
      ok: false,
      output: {
        ok: false,
        error: 'This voice action is not available.',
      },
    });
  }, [agentId, submitToolOutput]);

  const refreshStatus = useCallback(async () => {
    if (!agentId) {
      return null;
    }

    setConnectionState('checking');
    try {
      const nextStatus = await regentApi.getHermesVoiceStatus(agentId);
      setStatus(nextStatus);
      setConnectionState('idle');
      return nextStatus;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Voice is unavailable right now.');
      setConnectionState('error');
      return null;
    }
  }, [agentId]);

  const openAccountConnection = useCallback(async () => {
    const connectUrl = status?.account.connect_url;
    if (connectUrl) {
      await Linking.openURL(connectUrl);
    }
  }, [status]);

  const prewarm = useCallback(async (voiceStatus: HermesVoiceStatus | null) => {
    if (voiceStatus?.account.satisfied) {
      await regentApi.prewarmHermesVoice(agentId).catch(() => null);
    }
  }, [agentId]);

  const persistVoiceSummary = useCallback(async (sessionId: string | undefined) => {
    if (!sessionId || persistedVoiceSessionIds.current.has(sessionId)) {
      return;
    }

    const summary = voiceSummary(transcriptTurns.current);
    if (!summary) {
      return;
    }

    persistedVoiceSessionIds.current.add(sessionId);
    const thread = await regentApi.createMessageThread({ agentId, agentName });
    await regentApi.sendMessageThreadMessage({
      threadId: thread.id,
      text: summary,
      source: 'voice_summary',
    });
  }, [agentId, agentName]);

  const disconnect = useCallback(async () => {
    const activeSessionId = sessionRef.current?.session_id;
    realtimeClient.current?.disconnect();
    realtimeClient.current = null;
    sessionRef.current = null;
    setSession(null);
    setApprovalRequest(null);
    setConnectionState('disconnected');
    await clearCurrentVoiceSession();

    if (activeSessionId) {
      await regentApi.disconnectHermesVoice({ agentId, sessionId: activeSessionId }).catch(() => null);
      await persistVoiceSummary(activeSessionId).catch(() => null);
    }
  }, [agentId, persistVoiceSummary]);

  const start = useCallback(async () => {
    // Prefer the freshest paired-gateway state at start time.
    const paired = await refreshLocalGateway();

    if (isSelfHosted) {
      // A self-run agent can only talk once its computer is paired. The sheet
      // sends an unpaired agent to the pairing screen, so this is a guard.
      if (!paired) {
        return;
      }
    } else {
      // Hosted path gates on the ChatGPT account. A paired local gateway holds
      // its own OpenAI key, so that gate never applies on the self-run path.
      const nextStatus = status || await refreshStatus();
      if (!nextStatus) {
        return;
      }

      if (!nextStatus.account.satisfied) {
        if (nextStatus.account.connect_url) {
          await Linking.openURL(nextStatus.account.connect_url);
        }
        return;
      }
    }

    setConnectionState('connecting');
    setErrorMessage(null);
    transcriptTurns.current = [];
    try {
      const locale = getLocales()[0]?.languageTag;
      const timezone = getCalendars()[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const sessionRequest = {
        voice: 'marin',
        locale,
        timezone,
        reasoning_effort: 'low' as const,
        preferred_transport: 'webrtc' as const,
        device_capabilities: ['ios_status', 'ios_approval_request', 'ios_tool_result'],
      };
      // Same HermesVoiceSession shape either way, so the realtime client below
      // is identical. Only the mint SOURCE differs: paired local gateway
      // (Bearer token) vs the hosted platform projection session_url.
      const nextSession = paired
        ? await createLocalHermesVoiceSession({ gateway: paired, session: sessionRequest })
        : await regentApi.createHermesVoiceSession({ agentId, session: sessionRequest });

      setSession(nextSession);
      sessionRef.current = nextSession;
      await saveCurrentVoiceSession({ agentId, sessionId: nextSession.session_id });

      const client = createHermesRealtimeClient({
        session: nextSession,
        onToolCall: (toolCall) => {
          void handleToolCall(toolCall);
        },
        onTranscript: (turn) => {
          transcriptTurns.current = [...transcriptTurns.current, turn].slice(-16);
        },
        onStatus: setConnectionState,
        onError: setErrorMessage,
      });
      realtimeClient.current = client;
      await client.connect();
    } catch (error) {
      setErrorMessage(describeApiError(error).message);
      setConnectionState('error');
    }
  }, [agentId, handleToolCall, isSelfHosted, refreshLocalGateway, refreshStatus, status]);

  const resolveApproval = useCallback(async (approved: boolean) => {
    if (!approvalRequest) {
      return;
    }

    const toolCall: RealtimeToolCall = {
      id: approvalRequest.toolCallId,
      name: 'ios_approval_request',
      arguments: {},
    };
    await submitToolOutput({
      toolCall,
      output: {
        ok: approved,
        result: approved ? 'approved' : 'denied',
      },
    });
    setApprovalRequest(null);
  }, [approvalRequest, submitToolOutput]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        void disconnect();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [disconnect]);

  return {
    status,
    session,
    connectionState,
    errorMessage,
    approvalRequest,
    refreshStatus,
    start,
    prewarm,
    disconnect,
    openAccountConnection,
    resolveApproval,
    localGateway,
    refreshLocalGateway,
    isSelfHosted,
    agentWallet,
  };
}
