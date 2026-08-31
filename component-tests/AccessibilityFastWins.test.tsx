import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Linking, StyleSheet, Text } from 'react-native';

import { InformationalHubScreen } from '@/components/learn/InformationalHubScreen';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { AppIconSection } from '@/components/settings/AppIconSection';
import { AppearanceToggle } from '@/components/settings/AppearanceToggle';
import { SettingsMenu } from '@/components/settings/SettingsShell';
import { PinnedNoticeStrip } from '@/components/ui/PinnedNoticeStrip';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { THEME_COLORS } from '@/theme/tokens';
import { renderThemed } from './helpers/renderThemed';

const mockGetAppIconName = jest.fn<string | null, []>(() => null);
const mockSetAlternateAppIcon = jest.fn<Promise<void>, [string | null]>();

jest.mock('expo-alternate-app-icons', () => ({
  getAppIconName: mockGetAppIconName,
  setAlternateAppIcon: mockSetAlternateAppIcon,
  supportsAlternateIcons: true,
}));

describe('accessibility fast wins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppIconName.mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes the Settings menu as tabs with one selected section', () => {
    const onSectionChange = jest.fn();
    const { getAllByRole, getByRole, getByText, UNSAFE_getByProps } = renderThemed(
      <SettingsMenu
        activeSection="connect"
        displayEmail="sean@example.com"
        onSectionChange={onSectionChange}
      />,
    );

    expect(UNSAFE_getByProps({ accessibilityRole: 'tablist' }).props.accessibilityLabel).toBe(
      'Settings sections',
    );
    const tabs = getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((tab) => tab.props.accessibilityState?.selected)).toHaveLength(1);
    expect(getByRole('tab', { name: /Connect/ }).props.accessibilityState).toEqual({
      selected: true,
    });

    fireEvent.press(getByText('Help'));
    expect(onSectionChange).toHaveBeenCalledWith('help');
  });

  it('exposes Appearance as a radio group', () => {
    const { getAllByRole, UNSAFE_getByProps } = renderThemed(<AppearanceToggle />);

    expect(UNSAFE_getByProps({ accessibilityRole: 'radiogroup' }).props.accessibilityLabel).toBe(
      'Appearance',
    );
    const radios = getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.filter((radio) => radio.props.accessibilityState?.checked)).toHaveLength(1);
    expect(radios.every((radio) => StyleSheet.flatten(radio.props.style).minHeight === 44)).toBe(
      true,
    );
  });

  it('queues changed pinned statuses on iOS without announcing the initial mount', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    const firstNotice = {
      id: 'notice-1',
      pendingLabel: 'Saving reply',
      confirmedLabel: 'Reply saved',
      status: 'pending' as const,
      createdAtMs: 1,
    };
    const { rerender } = renderThemed(<PinnedNoticeStrip notices={[firstNotice]} />);

    expect(announce).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider>
        <PinnedNoticeStrip
          notices={[
            firstNotice,
            {
              id: 'notice-2',
              pendingLabel: 'Uploading attachment',
              confirmedLabel: 'Attachment uploaded',
              status: 'pending',
              createdAtMs: 2,
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Saving reply. Uploading attachment', { queue: true });
  });

  it('serializes app icon changes and reconciles with the native selection', async () => {
    let resolveChange: () => void = () => undefined;
    const changePromise = new Promise<void>((resolve) => {
      resolveChange = resolve;
    });
    mockSetAlternateAppIcon.mockReturnValueOnce(changePromise);
    mockGetAppIconName.mockReturnValueOnce(null).mockReturnValue('Light');
    const { getByLabelText } = renderThemed(<AppIconSection isExpoGo={false} />);
    const light = getByLabelText('Use the light app icon');

    fireEvent.press(light);
    fireEvent.press(getByLabelText('Use the blue app icon'));

    expect(mockSetAlternateAppIcon).toHaveBeenCalledTimes(1);
    expect(mockSetAlternateAppIcon).toHaveBeenCalledWith('Light');
    expect(getByLabelText('Use the dark app icon').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    expect(getByLabelText('Use the blue app icon').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });

    await act(async () => {
      resolveChange();
      await changePromise;
    });

    await waitFor(() =>
      expect(getByLabelText('Use the light app icon').props.accessibilityState).toEqual({
        busy: false,
        disabled: false,
        selected: true,
      }),
    );
  });

  it('announces an app icon failure and restores the native selection', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    mockGetAppIconName.mockReturnValue(null);
    mockSetAlternateAppIcon.mockRejectedValueOnce(new Error('native failure'));
    const { findByText, getByLabelText } = renderThemed(<AppIconSection isExpoGo={false} />);

    expect(announce).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Use the light app icon'));

    expect(await findByText('Could not change the app icon. Try again.')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Could not change the app icon. Try again.', {
      queue: true,
    });
    expect(getByLabelText('Use the dark app icon').props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
      selected: true,
    });
    expect(getByLabelText('Use the light app icon').props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
      selected: false,
    });
  });

  it('exposes pinned notices as a status element', () => {
    const { getByRole } = renderThemed(
      <PinnedNoticeStrip
        notices={[
          {
            id: 'notice-1',
            pendingLabel: 'Saving reply',
            confirmedLabel: 'Reply saved',
            status: 'pending',
            createdAtMs: 1,
          },
        ]}
      />,
    );

    expect(getByRole('status').props.accessibilityRole).toBe('status');
  });

  it('uses semantic success color for live-value feedback', () => {
    const { getByTestId } = renderThemed(
      <LiveValueFlash value={1}>
        <Text>1</Text>
      </LiveValueFlash>,
    );
    const tintStyle = StyleSheet.flatten(getByTestId('live-value-flash-tint').props.style);

    expect([THEME_COLORS.dark.success, THEME_COLORS.light.success]).toContain(
      tintStyle.backgroundColor,
    );
  });

  it('gives informational hub actions link semantics and browser hints', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined);
    const { getAllByRole, getByText } = renderThemed(
      <InformationalHubScreen
        title="Guide"
        intro="Learn the basics."
        purposeTitle="Purpose"
        purposeBody="Understand the workflow."
        whyItMatters={['Stay oriented']}
        websiteLabel="Visit Regents"
        websiteUrl="https://regents.sh"
        resourceTitle="Resource"
        resourceBody="Read more."
        resourceLabel="Open guide"
        resourceUrl="https://example.com/guide"
      />,
    );

    const links = getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.props.accessibilityHint === 'Opens in your browser')).toBe(true);

    fireEvent.press(getByText('Visit Regents'));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://regents.sh'));
    openUrl.mockRestore();
  });

});
