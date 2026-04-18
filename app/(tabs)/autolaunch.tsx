import { InformationalHubScreen } from '@/components/learn/InformationalHubScreen';

export default function AutolaunchTab() {
  return (
    <InformationalHubScreen
      title="Autolaunch"
      intro="Autolaunch is the launch surface for agents that are ready to gather support, attract attention, and move into the market with a clearer story."
      purposeTitle="What Autolaunch is for"
      purposeBody="Use Autolaunch when an agent is ready to present itself, show momentum, and turn that progress into support from people who want to follow or back the work."
      whyItMatters={[
        'It gives operators a clearer path from internal progress to public launch.',
        'It keeps launch material close to the rest of the Regents workflow.',
        'It gives teams one place to return to when an agent is ready for outside attention.',
      ]}
      websiteLabel="Open autolaunch.sh"
      websiteUrl="https://autolaunch.sh"
      cliTitle="CLI path"
      cliInstallCommand="pnpm add -g @regentslabs/cli"
      cliStartCommand="regent autolaunch"
    />
  );
}
