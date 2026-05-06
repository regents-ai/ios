export type PushTokenRecord = {
  token: string;
  platform: string;
  tokenType: 'native' | 'expo';
  updatedAt: number;
};

type ApnsProvider = {
  send(notification: unknown, token: string): Promise<{ sent?: unknown[]; failed?: unknown[] }>;
};

type PushNotificationInput = {
  title: string;
  body: string;
  data: Record<string, string | undefined>;
};

type PushDeliveryDeps = {
  apnProvider?: ApnsProvider | null | undefined;
  createApnsNotification?: ((input: PushNotificationInput) => unknown) | undefined;
  fetchImpl?: typeof fetch | undefined;
};

export class PushDeliveryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushDeliveryConfigurationError';
  }
}

function hasApnsConfig(env: Record<string, string | undefined>) {
  return !!(env.APNS_KEY_ID?.trim() && env.APNS_TEAM_ID?.trim() && env.APNS_KEY?.trim());
}

function hasPartialApnsConfig(env: Record<string, string | undefined>) {
  return !!(env.APNS_KEY_ID?.trim() || env.APNS_TEAM_ID?.trim() || env.APNS_KEY?.trim());
}

export async function createApnsProviderFromEnv(
  env: Record<string, string | undefined>,
  releaseRuntime: boolean
): Promise<ApnsProvider | null> {
  if (!hasApnsConfig(env)) {
    if (releaseRuntime || hasPartialApnsConfig(env)) {
      throw new PushDeliveryConfigurationError('APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY are required for native iOS push.');
    }

    console.log('ℹ️ APNs is not configured. Expo push tokens can still be delivered in local dev.');
    return null;
  }

  try {
    const apn = await import('@parse/node-apn');
    const apnsKey = env.APNS_KEY!.replace(/\\n/g, '\n');

    const provider = new apn.Provider({
      token: {
        key: apnsKey,
        keyId: env.APNS_KEY_ID!,
        teamId: env.APNS_TEAM_ID!,
      },
      production: true,
    });

    console.log('✅ Direct APNs delivery is configured for native iOS push tokens.');
    return provider;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'APNs provider could not be initialized.';
    throw new PushDeliveryConfigurationError(`APNs provider could not be initialized: ${message}`);
  }
}

async function createDefaultApnsNotification(input: PushNotificationInput) {
  const apn = await import('@parse/node-apn');
  return new apn.Notification({
    alert: { title: input.title, body: input.body },
    topic: 'com.regentslabs.mobile',
    sound: 'default',
    payload: input.data,
  });
}

export async function sendPushNotification(
  tokenData: PushTokenRecord,
  input: PushNotificationInput,
  deps: PushDeliveryDeps = {}
) {
  if (tokenData.tokenType === 'native') {
    if (tokenData.platform !== 'ios') {
      throw new PushDeliveryConfigurationError('Native push delivery is only configured for iOS tokens.');
    }

    if (!deps.apnProvider) {
      throw new PushDeliveryConfigurationError('APNs is required before native iOS push tokens can be delivered.');
    }

    console.log('📤 [WEBHOOK] Sending via direct APNs', {
      platform: tokenData.platform,
      tokenType: tokenData.tokenType,
      tokenLength: tokenData.token.length,
    });

    const notification = deps.createApnsNotification
      ? deps.createApnsNotification(input)
      : await createDefaultApnsNotification(input);
    const result = await deps.apnProvider.send(notification, tokenData.token);
    console.log('📊 [WEBHOOK] APNs result:', {
      sent: result.sent?.length || 0,
      failed: result.failed?.length || 0,
    });

    if (result.failed && result.failed.length > 0) {
      throw new Error('APNs rejected the notification.');
    }
    return;
  }

  const fetchImpl = deps.fetchImpl || fetch;
  console.log('📤 [WEBHOOK] Sending via Expo push service');
  const pushResponse = await fetchImpl('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: tokenData.token,
      sound: 'default',
      title: input.title,
      body: input.body,
      data: input.data,
    }),
  });

  const pushResult = await pushResponse.json().catch(() => null) as { data?: { status?: string; message?: string } } | null;
  if (!pushResponse.ok || pushResult?.data?.status === 'error') {
    throw new Error(pushResult?.data?.message || 'Push notification service rejected the notification.');
  }

  console.log('✅ [WEBHOOK] Push notification sent');
}
