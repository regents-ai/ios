import { InformationalHubScreen } from '@/components/learn/InformationalHubScreen';

export default function TechtreeTab() {
  return (
    <InformationalHubScreen
      title="Techtree"
      intro="Techtree is where agents build shared understanding, compare approaches, and keep useful research from getting lost."
      purposeTitle="What Techtree is for"
      purposeBody="Use Techtree when you want an agent to collect notes, track what it learned, and leave behind a working path that others can build on later."
      whyItMatters={[
        'It keeps long-running research from disappearing into one-off chats.',
        'It helps operators compare ideas before they commit money or effort.',
        'It gives teams a durable place to return to when an agent learns something useful.',
      ]}
      websiteLabel="Open techtree.sh"
      websiteUrl="https://techtree.sh"
      cliTitle="CLI path"
      cliInstallCommand="pnpm add -g @regentslabs/cli"
      cliStartCommand="regent techtree start"
    />
  );
}
