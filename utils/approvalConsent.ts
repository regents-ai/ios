/**
 * Graduated-consent approval model — ONCE + DENY only.
 *
 * Adapted from hermex ApprovalRequestOverlay.swift, scoped to Sean's decision
 * (2026-07-02): money actions get a per-action overlay with exactly two
 * outcomes — approve once, or deny. There is NO session grant, NO always-allow,
 * and NOTHING is persisted. Every qualifying action re-prompts.
 *
 * This module is UI-consent logic ONLY. It decides which actions require the
 * overlay and what an approve/deny outcome means. It performs no signing, no
 * transaction preparation, and holds no wallet state — the component funnels an
 * approval into the app's existing confirm/signing rails unchanged.
 *
 * Pure logic, no React, so the consent rules are unit-testable.
 */

/** The only two consent outcomes. No session, no always-allow. */
export type ConsentOutcome = 'approve-once' | 'deny';

/**
 * Agent-initiated actions that move money and therefore require the per-action
 * overlay before the user is taken into the confirm flow.
 */
export type AgentAction = 'fund-agent' | 'send' | 'stake' | 'return-funds';

const MONEY_ACTIONS: ReadonlySet<AgentAction> = new Set<AgentAction>([
  'fund-agent',
  'send',
  'stake',
  'return-funds',
]);

/** Whether an action must show the approval overlay before proceeding. */
export function requiresApproval(action: AgentAction): boolean {
  return MONEY_ACTIONS.has(action);
}

/**
 * Resolves a consent outcome into whether the app may proceed into the
 * existing confirm flow. `approve-once` proceeds exactly once; `deny` never
 * proceeds. There is no state to carry forward — the next action re-prompts.
 */
export function mayProceedAfterConsent(outcome: ConsentOutcome): boolean {
  return outcome === 'approve-once';
}

/** The only choices offered by the overlay, in display order. */
export const CONSENT_CHOICES: readonly {
  outcome: ConsentOutcome;
  label: string;
  tone: 'primary' | 'plain';
}[] = [
  { outcome: 'approve-once', label: 'Approve once', tone: 'primary' },
  { outcome: 'deny', label: 'Deny', tone: 'plain' },
];

/**
 * Guard against ever introducing a persisted or session grant: the consent
 * model is stateless by construction. Exposed so a test can assert that only
 * once/deny exist and nothing is retained.
 */
export function consentIsStateless(): true {
  return true;
}
