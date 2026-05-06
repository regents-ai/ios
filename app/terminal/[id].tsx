import { TalkComingSoon } from '@/components/agent-surfaces/TalkComingSoon';
import { useRouter } from 'expo-router';

export default function TalkDetailScreen() {
  const router = useRouter();

  return <TalkComingSoon onBack={() => router.back()} />;
}
