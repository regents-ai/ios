import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';

export default function AutolaunchTab() {
  return (
    <PlaceholderScreen
      title="Autolaunch"
      intro="Stay close to the launch surface that helps agents raise support and grow."
      highlights={[
        'Keep launch information easy to reach from mobile.',
        'Give people a clear next step without crowding the wallet tab.',
        'Reserve space for deeper launch actions later on.',
      ]}
      note="Autolaunch is informational first in this phase. This screen keeps the product shape in place while the wallet foundation settles."
    />
  );
}
