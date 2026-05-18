import type { RealtimeToolCall } from '@/utils/voice/realtimeClient';

export type DeviceToolResult =
  | { kind: 'resolved'; output: Record<string, unknown> }
  | { kind: 'approval_required'; approval: VoiceApprovalRequest };

export type VoiceApprovalRequest = {
  toolCallId: string;
  title: string;
  body: string;
  actionLabel: string;
};

export function isIosOwnedTool(name: string) {
  return name === 'ios_status' || name === 'ios_approval_request' || name === 'ios_tool_result';
}

export async function runDeviceTool(toolCall: RealtimeToolCall): Promise<DeviceToolResult> {
  switch (toolCall.name) {
    case 'ios_status':
      return {
        kind: 'resolved',
        output: {
          ok: true,
          capabilities: ['voice', 'approval_review'],
        },
      };

    case 'ios_approval_request':
      return {
        kind: 'approval_required',
        approval: {
          toolCallId: toolCall.id,
          title: typeof toolCall.arguments.title === 'string' ? toolCall.arguments.title : 'Review request',
          body:
            typeof toolCall.arguments.body === 'string'
              ? toolCall.arguments.body
              : 'Hermes needs your approval before continuing.',
          actionLabel:
            typeof toolCall.arguments.actionLabel === 'string'
              ? toolCall.arguments.actionLabel
              : 'Approve',
        },
      };

    case 'ios_tool_result':
      return {
        kind: 'resolved',
        output: {
          ok: true,
        },
      };

    default:
      return {
        kind: 'resolved',
        output: {
          ok: false,
          error: 'This iPhone action is not available.',
        },
      };
  }
}
