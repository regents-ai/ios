export type MobilePublicConfig = {
  privyAppId: string | null;
  privyClientId: string | null;
  cdpProjectId: string | null;
};

// Privy client IDs are issued as "client-" followed by an alphanumeric token.
const PRIVY_CLIENT_ID_PATTERN = /^client-[A-Za-z0-9]+$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readMobilePublicConfig(): MobilePublicConfig {
  return {
    privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID || null,
    privyClientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || null,
    cdpProjectId: process.env.EXPO_PUBLIC_CDP_PROJECT_ID || null,
  };
}

export function hasRegentsAccountConfig(config = readMobilePublicConfig()) {
  return (
    !!config.privyAppId &&
    !!config.privyClientId &&
    PRIVY_CLIENT_ID_PATTERN.test(config.privyClientId) &&
    !!config.cdpProjectId &&
    UUID_V4_PATTERN.test(config.cdpProjectId)
  );
}
