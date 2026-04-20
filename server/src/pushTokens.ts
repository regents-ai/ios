type PushTokenRecord = {
  token: string;
  platform: string;
  tokenType?: string;
  updatedAt: number;
};

export function canAccessPushTokenDebug(requestedUserId: string, currentUserId: string | undefined) {
  if (!currentUserId) {
    return false;
  }

  return requestedUserId === currentUserId || requestedUserId === `sandbox-${currentUserId}`;
}

export function buildPushTokenDebugResponse(userId: string, tokenData: PushTokenRecord | null) {
  return {
    userId,
    hasToken: !!tokenData,
    tokenData: tokenData
      ? {
          platform: tokenData.platform,
          tokenType: tokenData.tokenType,
          tokenLength: tokenData.token?.length,
          updatedAt: new Date(tokenData.updatedAt).toISOString(),
        }
      : null,
  };
}
