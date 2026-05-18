import { mobileVoiceSafetyIdentifier } from '../mobileVoiceSessions.js';

export function buildRealtimeSafetyIdentifier(input: {
  userId: string;
  agentId: string;
  environment?: string | undefined;
}) {
  return mobileVoiceSafetyIdentifier({
    userId: input.userId,
    agentId: input.agentId,
    environment: input.environment || process.env.NODE_ENV || 'development',
  });
}
