import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';

export default function TerminalTab() {
  return (
    <PlaceholderScreen
      title="Terminal"
      intro="Follow your agent sessions from your phone and step in when you need to."
      highlights={[
        'Read live session output in one feed.',
        'Reply without leaving the app.',
        'See when an agent needs approval or attention.',
      ]}
      note="This tab is reserved for the mobile terminal experience. It stays intentionally simple until the live session view is ready."
    />
  );
}
