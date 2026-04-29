import { PendingTerminalApproval } from '@/types/terminal';

export type TerminalApprovalSafetyRow = {
  label: string;
  value: string;
};

function describesMoneyMovement(text: string) {
  return /\b(usdc|eth|eurc|btc|cash|fund|funds|treasury|transfer|wallet|move|send|return)\b/i.test(text);
}

function moneyPathCopy(approval: PendingTerminalApproval) {
  const amount = approval.amount && approval.currency ? `${approval.amount} ${approval.currency}` : 'Amount not listed';
  const contract = approval.contractAddress ? `Contract ${approval.contractAddress}` : 'No contract listed';
  return `${amount}. ${contract}. ${approval.riskCopy}`;
}

export function buildTerminalApprovalSafetyRows(input: {
  agentName: string;
  approval: PendingTerminalApproval;
}): TerminalApprovalSafetyRow[] {
  const details = `${input.approval.action} ${input.approval.riskCopy}`;
  const isMoneyMovement = describesMoneyMovement(details);

  return [
    {
      label: 'Decision',
      value: 'You decide before anything continues.',
    },
    {
      label: 'Requesting Regent',
      value: input.approval.regentName || input.agentName,
    },
    {
      label: isMoneyMovement ? 'Money path' : 'Requested action',
      value: isMoneyMovement ? moneyPathCopy(input.approval) : input.approval.action,
    },
    {
      label: 'Risk',
      value: input.approval.riskCopy,
    },
    {
      label: 'Expires',
      value: new Date(input.approval.expiresAt).toLocaleString(),
    },
    {
      label: 'Final check',
      value: isMoneyMovement
        ? 'Wallet and Base records decide the final balance.'
        : 'The talk history keeps the decision with this request.',
    },
  ];
}
