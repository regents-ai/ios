import { timingSafeEqual } from 'node:crypto';

import type { PushTokenRecord } from './pushDelivery.js';
import { summarizeErrorLog, summarizePushTokenUserLog } from './security.js';
import { z } from 'zod';

type PushNotificationInput = {
  title: string;
  body: string;
  data: Record<string, string | undefined>;
};

type MobileMessagePushDeps = {
  env: Record<string, string | undefined>;
  readPushTokenForUser(userId: string): Promise<PushTokenRecord | null>;
  sendPushNotification(tokenData: PushTokenRecord, input: PushNotificationInput): Promise<void>;
};

type MobileMessagePushRequest = {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

type MobileMessagePushResult = {
  status: number;
  body:
    | { delivered: boolean; reason?: 'no_token' }
    | { error: { code: string; message: string } };
};

const mobileMessagePushBodySchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  eventId: z.string().min(1),
  eventType: z.enum(['assistant_message', 'approval_request']),
  agentName: z.string().min(1),
  message: z.string().max(240).optional(),
}).strict();

function readHeader(headers: MobileMessagePushRequest['headers'], name: string) {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function configuredToken(env: Record<string, string | undefined>) {
  return env.PLATFORM_MOBILE_PUSH_WEBHOOK_TOKEN?.trim() || '';
}

function authorizePlatformWebhook(request: MobileMessagePushRequest, env: Record<string, string | undefined>) {
  const expectedToken = configuredToken(env);
  if (!expectedToken) {
    return { ok: false as const, status: 503, code: 'MobileMessagePushNotConfigured', message: 'Message notifications are not configured.' };
  }

  const actualToken = readHeader(request.headers, 'x-regent-platform-webhook-token')?.trim() || '';
  if (!actualToken || !secureEqual(actualToken, expectedToken)) {
    return { ok: false as const, status: 401, code: 'Unauthorized', message: 'Message notification authorization failed.' };
  }

  return { ok: true as const };
}

function pushCopy(input: z.infer<typeof mobileMessagePushBodySchema>): PushNotificationInput {
  if (input.eventType === 'approval_request') {
    return {
      title: `${input.agentName} needs your review`,
      body: input.message || 'Open Regents to review the request.',
      data: {
        type: 'mobile_message',
        eventType: input.eventType,
        eventId: input.eventId,
        threadId: input.threadId,
      },
    };
  }

  return {
    title: `${input.agentName} replied`,
    body: input.message || 'Open Regents to read the new message.',
    data: {
      type: 'mobile_message',
      eventType: input.eventType,
      eventId: input.eventId,
      threadId: input.threadId,
    },
  };
}

function error(status: number, code: string, message: string): MobileMessagePushResult {
  return {
    status,
    body: {
      error: {
        code,
        message,
      },
    },
  };
}

export async function processMobileMessagePushRequest(
  request: MobileMessagePushRequest,
  deps: MobileMessagePushDeps,
): Promise<MobileMessagePushResult> {
  const authorization = authorizePlatformWebhook(request, deps.env);
  if (!authorization.ok) {
    return error(authorization.status, authorization.code, authorization.message);
  }

  const parsed = mobileMessagePushBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return error(400, 'BadRequest', 'A valid message notification is required.');
  }

  const token = await deps.readPushTokenForUser(parsed.data.userId);
  if (!token) {
    console.log('[MESSAGE PUSH] No push token for user:', summarizePushTokenUserLog(parsed.data.userId));
    return {
      status: 202,
      body: {
        delivered: false,
        reason: 'no_token',
      },
    };
  }

  try {
    await deps.sendPushNotification(token, pushCopy(parsed.data));
    console.log('[MESSAGE PUSH] Notification sent:', summarizePushTokenUserLog(parsed.data.userId));
    return {
      status: 202,
      body: {
        delivered: true,
      },
    };
  } catch (pushError) {
    console.error('[MESSAGE PUSH] Delivery failed:', summarizeErrorLog(pushError));
    return error(503, 'MobileMessagePushDeliveryFailed', 'Message notification delivery is not available right now.');
  }
}
