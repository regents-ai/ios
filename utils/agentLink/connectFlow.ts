/**
 * Pure state machine for the connect-an-agent screen.
 *
 * Keeps the screen thin: the component owns the camera and network calls, and
 * defers every "what shows next" decision to `nextConnectPhase`, which is easy
 * to test without rendering.
 */

import { describeApiError } from '../apiError';
import { parseAgentLinkQr } from './qrPayload';

export type ConnectPhase = 'idle' | 'scanning' | 'submitting' | 'connected';

export type ConnectAlert = { title: string; message: string };

export type ScanOutcome =
  | { kind: 'submit'; code: string; phase: ConnectPhase }
  | { kind: 'reject'; phase: ConnectPhase; alert: ConnectAlert };

/**
 * Decide what happens when a QR is scanned: either a code to submit (moving to
 * `submitting`) or a rejection that returns to `idle` with friendly copy.
 */
export function outcomeForScan(raw: string): ScanOutcome {
  const parsed = parseAgentLinkQr(raw);
  if (!parsed.ok) {
    return {
      kind: 'reject',
      phase: 'idle',
      alert: { title: "That code didn't work", message: parsed.message },
    };
  }

  return { kind: 'submit', code: parsed.payload.code, phase: 'submitting' };
}

/** Copy and phase to show when a claim submission fails. */
export function outcomeForClaimError(error: unknown): { phase: ConnectPhase; alert: ConnectAlert } {
  return { phase: 'idle', alert: describeApiError(error) };
}
