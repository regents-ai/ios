import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import LocalVoicePairingScreen from '@/app/settings/local-voice';
import { renderThemed } from './helpers/renderThemed';

const mockRequestPermission = jest.fn();
const mockReadPairedGateway = jest.fn(() => Promise.resolve(null));
let mockPermission: { granted: boolean } | null = { granted: false };

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({
    name: 'Hermes',
    wallet: '0x1234567890123456789012345678901234567890',
  }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/utils/voice/localGatewayStore', () => ({
  clearPairedGateway: jest.fn(),
  readPairedGateway: () => mockReadPairedGateway(),
  savePairedGateway: jest.fn(),
}));

jest.mock('@/hooks/useCoinbaseAlert', () => ({
  useCoinbaseAlert: () => ({
    alertProps: {
      message: '',
      onConfirm: jest.fn(),
      title: '',
      visible: false,
    },
    showAlert: jest.fn(),
  }),
}));

jest.mock('@/components/ui/CoinbaseAlerts', () => ({
  CoinbaseAlert: () => null,
}));

describe('LocalVoicePairingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermission = { granted: false };
    mockReadPairedGateway.mockResolvedValue(null);
  });

  it('serializes denied camera permission requests and exposes button state', async () => {
    let resolvePermission: (permission: { granted: boolean }) => void = () => undefined;
    const permissionPromise = new Promise<{ granted: boolean }>((resolve) => {
      resolvePermission = resolve;
    });
    mockRequestPermission.mockReturnValueOnce(permissionPromise);
    const { getByLabelText } = renderThemed(<LocalVoicePairingScreen />);
    const scanButton = getByLabelText('Scan code');

    expect(scanButton.props.accessibilityRole).toBe('button');
    expect(getByLabelText('Go back').props.accessibilityRole).toBe('button');
    fireEvent.press(scanButton);
    fireEvent.press(scanButton);

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const preparingButton = getByLabelText('Preparing camera');
      expect(preparingButton.props.accessibilityRole).toBe('button');
      expect(preparingButton.props.accessibilityState).toEqual({ busy: true, disabled: true });
    });

    await act(async () => {
      resolvePermission({ granted: false });
      await permissionPromise;
    });

    await waitFor(() =>
      expect(getByLabelText('Scan code').props.accessibilityState).toEqual({
        busy: false,
        disabled: false,
      }),
    );
  });
});
