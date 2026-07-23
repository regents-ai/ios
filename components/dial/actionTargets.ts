import type { Href } from 'expo-router';

import type { DialPetalAction } from '@/components/dial/petalRegistry';
import type { RegentSummary } from '@/types/regents';
import { routes } from '@/utils/navigation/routes';

export type DialActionTargets = {
  primaryRegent: RegentSummary | null | undefined;
  urgentThreadId: string | null | undefined;
};

export function resolveDialActionHref(
  action: DialPetalAction,
  targets: DialActionTargets
): Href {
  if (action.kind === 'navigate') {
    return action.href;
  }

  if (action.kind === 'primaryAgentVoice') {
    return targets.primaryRegent
      ? routes.agentVoice(targets.primaryRegent.id, targets.primaryRegent.name)
      : '/agents';
  }

  return targets.urgentThreadId
    ? routes.messageThread(targets.urgentThreadId)
    : routes.message();
}
