import { HermesVoiceSheet } from '@/components/voice/HermesVoiceSheet';
import { regentApi } from '@/utils/regentApi/client';
import type { RegentDetail } from '@/types/regents';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

export default function AgentVoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const [agent, setAgent] = useState<RegentDetail | null>(null);

  useEffect(() => {
    if (!agentId) {
      return;
    }
    let active = true;
    regentApi
      .getRegent(agentId)
      .then((detail) => {
        if (active) {
          setAgent(detail);
        }
      })
      .catch(() => {
        if (active) {
          router.back();
        }
      });
    return () => {
      active = false;
    };
  }, [agentId, router]);

  if (!agent) {
    return null;
  }

  return (
    <HermesVoiceSheet
      agentId={agent.id}
      agentName={agent.name}
      runtimeKind={agent.runtimeKind}
      agentWallet={agent.walletAddress}
      visible
      onClose={() => router.back()}
    />
  );
}
