import type { MobileAgentKind } from '@/types/regents';

export const AGENT_KIND_OPTIONS: readonly { kind: MobileAgentKind; label: string }[] = [
  { kind: 'muse', label: 'Muse' },
  { kind: 'grok_bot', label: 'Grok Bot' },
  { kind: 'hermes', label: 'Hermes' },
  { kind: 'other', label: 'Other agent' },
];

export function agentKindLabel(kind: MobileAgentKind) {
  return AGENT_KIND_OPTIONS.find((option) => option.kind === kind)?.label ?? 'Agent';
}

export function isAgentKind(value: unknown): value is MobileAgentKind {
  return AGENT_KIND_OPTIONS.some((option) => option.kind === value);
}

export function formatUsdcBalance(balance: string | null) {
  if (balance === null) {
    return 'Balance unavailable';
  }
  const amount = Number(balance);
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}
