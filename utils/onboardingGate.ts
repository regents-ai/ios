/**
 * Copy-gated forward navigation policy.
 *
 * Some flows must not advance until a critical step has actually happened
 * (for example: a verification code was really sent before the code-entry
 * screen opens). This pure policy answers one question: should this forward
 * navigation be intercepted right now?
 *
 * The bypass flag is an always-available escape hatch: when the user (or the
 * flow) explicitly bypasses the gate, navigation is never intercepted, even
 * if the critical action has not completed.
 */

export type ForwardNavigationGateInput = {
  from: string;
  to: string;
  hasCompletedCriticalAction: boolean;
  hasBypassed: boolean;
};

/**
 * The forward steps that are gated on a critical action. Any other
 * navigation (backward, lateral, or unrelated) is never intercepted.
 */
const GATED_FORWARD_STEPS: readonly { from: string; to: string }[] = [
  { from: '/phone-verify', to: '/phone-code' },
  { from: '/email-verify', to: '/email-code' },
];

export function shouldInterceptForwardNavigation(input: ForwardNavigationGateInput): boolean {
  if (input.hasBypassed) {
    return false;
  }

  const isGatedStep = GATED_FORWARD_STEPS.some(
    (step) => step.from === input.from && step.to === input.to
  );
  if (!isGatedStep) {
    return false;
  }

  return !input.hasCompletedCriticalAction;
}
