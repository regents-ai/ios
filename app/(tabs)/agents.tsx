import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';

export default function AgentsTab() {
  return (
    <PlaceholderScreen
      title="Agents"
      intro="Keep your operators, balances, and funding actions in one place."
      highlights={[
        'See each agent and its wallet at a glance.',
        'Move stablecoins between your wallet and an agent.',
        'Open the agent workspace from the same tab.',
      ]}
      note="This tab is being held for the full agent view. The wallet tab is the only live money surface in this phase."
    />
  );
}
