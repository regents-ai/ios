import { HermesVoiceSheet } from '@/components/voice/HermesVoiceSheet';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function AgentVoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const agentName = typeof params.name === 'string' ? params.name : 'Hermes';

  return (
    <HermesVoiceSheet
      agentId={agentId}
      agentName={agentName}
      visible
      onClose={() => router.back()}
    />
  );
}
