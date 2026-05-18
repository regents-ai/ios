import type { HermesVoiceSession } from '@/types/regents';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import type { MediaStream } from 'react-native-webrtc';

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
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onError?: (message: string) => void;
};

function parseArguments(rawValue: unknown) {
  if (!rawValue) {
    return {};
  }

  if (typeof rawValue === 'string') {
    try {
      return JSON.parse(rawValue) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
}

function toolCallFromRealtimeEvent(event: Record<string, unknown>): RealtimeToolCall | null {
  if (event.type === 'response.function_call_arguments.done') {
    const id = event.call_id || event.item_id;
    const name = event.name;
    if (typeof id === 'string' && typeof name === 'string') {
      return {
        id,
        name,
        arguments: parseArguments(event.arguments),
      };
    }
  }

  if (event.type === 'response.output_item.done') {
    const item = event.item;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const id = record.call_id || record.id;
      const name = record.name;
      if (record.type === 'function_call' && typeof id === 'string' && typeof name === 'string') {
        return {
          id,
          name,
          arguments: parseArguments(record.arguments),
        };
      }
    }
  }

  return null;
}

export function createHermesRealtimeClient(options: RealtimeClientOptions): HermesRealtimeClient {
  const peerConnection = new RTCPeerConnection({});
  const dataChannel = peerConnection.createDataChannel('oai-events');
  const messageChannel = dataChannel as unknown as {
    addEventListener(eventName: 'message', listener: (message: { data: unknown }) => void): void;
  };
  let localStream: MediaStream | null = null;
  let disconnected = false;

  messageChannel.addEventListener('message', (message) => {
    try {
      const event = JSON.parse(String(message.data)) as Record<string, unknown>;
      const toolCall = toolCallFromRealtimeEvent(event);
      if (toolCall) {
        options.onToolCall?.(toolCall);
      }
    } catch {
      options.onError?.('Voice had trouble reading a response.');
    }
  });

  const disconnect = () => {
    if (disconnected) {
      return;
    }

    disconnected = true;
    for (const sender of peerConnection.getSenders()) {
      sender.track?.stop();
    }
    localStream?.getTracks().forEach((track) => track.stop());
    dataChannel.close();
    peerConnection.close();
    options.onStatus?.('disconnected');
  };

  const client: HermesRealtimeClient = {
    async connect() {
      options.onStatus?.('connecting');
      try {
        localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
        for (const track of localStream.getTracks()) {
          peerConnection.addTrack(track, localStream);
        }

        const offer = await peerConnection.createOffer({});
        await peerConnection.setLocalDescription(offer);

        const callsUrl = options.session.realtime.calls_url || 'https://api.openai.com/v1/realtime/calls';
        const response = await fetch(callsUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.session.realtime.client_secret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp || '',
        });

        if (!response.ok) {
          throw new Error('Voice could not start.');
        }

        const answer = await response.text();
        await peerConnection.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answer,
        }));
        options.onStatus?.('connected');
      } catch (error) {
        options.onStatus?.('disconnected');
        options.onError?.(error instanceof Error ? error.message : 'Voice could not start.');
        disconnect();
      }
    },

    disconnect,

    sendToolResult(input) {
      if (dataChannel.readyState !== 'open') {
        return;
      }

      dataChannel.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: input.toolCallId,
          output: JSON.stringify(input.output),
        },
      }));
      dataChannel.send(JSON.stringify({ type: 'response.create' }));
    },
  };

  return client;
}
