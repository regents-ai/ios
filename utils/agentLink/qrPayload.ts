/**
 * Parse and validate the code a Hermes agent shows as a QR when a person
 * connects it to their phone.
 *
 * The agent encodes JSON of the shape `{ v, kind: 'regents-agent-link',
 * baseUrl, code }`. The app reads only what it needs — the pairing `code` —
 * and always talks to its own backend, so `baseUrl` is informational only.
 *
 * Anything that is not a recognizable Regents agent-link code is rejected with
 * friendly copy so a stray QR never looks like a broken connection.
 */

const AGENT_LINK_KIND = 'regents-agent-link';

export type AgentLinkPayload = {
  code: string;
  baseUrl: string | null;
};

export type AgentLinkParseResult =
  | { ok: true; payload: AgentLinkPayload }
  | { ok: false; message: string };

const NOT_AN_AGENT_CODE = "That doesn't look like an agent code. Scan the code your agent shows on your computer.";

export function parseAgentLinkQr(raw: string): AgentLinkParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, message: NOT_AN_AGENT_CODE };
  }

  if (typeof decoded !== 'object' || decoded === null) {
    return { ok: false, message: NOT_AN_AGENT_CODE };
  }

  const record = decoded as Record<string, unknown>;

  if (record.kind !== AGENT_LINK_KIND) {
    return { ok: false, message: NOT_AN_AGENT_CODE };
  }

  const code = record.code;
  if (typeof code !== 'string' || code.trim() === '') {
    return { ok: false, message: NOT_AN_AGENT_CODE };
  }

  const baseUrl = typeof record.baseUrl === 'string' && record.baseUrl.trim() !== '' ? record.baseUrl : null;

  return { ok: true, payload: { code: code.trim(), baseUrl } };
}
