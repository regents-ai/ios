import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import AgentDetailScreen from '@/app/agent/[id]';
import AgentRegentManagerScreen from '@/app/agent/[id]/regent-manager';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { RegentDetail, RegentManagerDetail } from '@/types/regents';

const mockGetRegent = jest.fn<Promise<RegentDetail>, [string]>();
const mockGetRegentManager = jest.fn<Promise<RegentManagerDetail>, [string]>();
const mockShowAlert = jest.fn();
const mockRouter = { back: jest.fn(), push: jest.fn() };

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getRegent: (id: string) => mockGetRegent(id),
    getRegentManager: (id: string) => mockGetRegentManager(id),
  },
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ id: 'agent-1' }),
  useRouter: () => mockRouter,
}));

jest.mock('@/hooks/useCoinbaseAlert', () => ({
  useCoinbaseAlert: () => ({
    alertProps: { message: '', onConfirm: jest.fn(), title: '', visible: false },
    showAlert: mockShowAlert,
  }),
}));

jest.mock('@/components/agent-surfaces/StatusPill', () => ({ StatusPill: () => null }));
jest.mock('@/components/motion/SpinningRefreshIcon', () => ({
  SpinningRefreshIcon: () => null,
}));
jest.mock('@/components/ui/ApprovalOverlay', () => ({ ApprovalOverlay: () => null }));
jest.mock('@/components/ui/CoinbaseAlerts', () => ({ CoinbaseAlert: () => null }));
jest.mock('@/components/voice/HermesVoiceButton', () => ({ HermesVoiceButton: () => null }));
jest.mock('@/components/voice/HermesVoiceSheet', () => ({ HermesVoiceSheet: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const agent: RegentDetail = {
  id: 'agent-1',
  name: 'Hermes',
  status: 'active',
  runtimeStatus: 'online',
  runtimeKind: 'hosted',
  walletAddress: '0x1234567890123456789012345678901234567890',
  platformState: {
    claimedName: 'Hermes',
    slug: 'hermes',
    formationStatus: 'ready',
    billingStatus: 'prepaid',
    runtimeStatus: 'ready',
    blockers: [],
    dashboardUrl: 'https://example.com/hermes',
  },
  voice: {
    enabled: true,
    health: 'ok',
    account: { required: true, satisfied: true, provider: 'openai_chatgpt' },
  },
  lastActiveAt: '2026-08-30T12:00:00.000Z',
  runtimeHeadline: 'Running normally',
  mission: 'Help the founder.',
  recentActivity: [],
  returnRequests: [],
};

const manager: RegentManagerDetail = {
  regentId: 'agent-1',
  headline: 'Company brief',
  companySummary: 'Everything is on track.',
  dashboardUrl: 'https://example.com/hermes',
  goals: [],
  activeTasks: [],
  recentEvents: [],
  roster: [],
};

describe('agent header controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRegent.mockResolvedValue(agent);
    mockGetRegentManager.mockResolvedValue(manager);
  });

  it('exposes the agent back and refresh actions as buttons', async () => {
    const screen = render(
      <ThemeProvider>
        <AgentDetailScreen />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh agent' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy();
  });

  it('exposes the Agent Brief back and refresh actions as buttons', async () => {
    const screen = render(
      <ThemeProvider>
        <AgentRegentManagerScreen />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh agent brief' })).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy();
  });
});
