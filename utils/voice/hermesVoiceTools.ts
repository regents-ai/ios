import { regentApi } from '@/utils/regentApi/client';
import type { RealtimeToolCall } from '@/utils/voice/realtimeClient';

const hermesToolNames = new Set([
  'hermes_turn',
  'hermes_steer',
  'hermes_cancel',
  'hermes_status',
  'wait_for_user',
]);

export function isHermesOwnedTool(name: string) {
  return hermesToolNames.has(name);
}

export async function forwardHermesToolCall(input: {
  agentId: string;
  sessionId: string;
  toolCall: RealtimeToolCall;
}) {
  await regentApi.submitHermesVoiceToolResult({
    agentId: input.agentId,
    result: {
      session_id: input.sessionId,
      tool_call_id: input.toolCall.id,
      ok: true,
      result: {
        tool_name: input.toolCall.name,
        arguments: input.toolCall.arguments,
      },
    },
  });

  return {
    ok: true,
    queued: true,
  };
}
