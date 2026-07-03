import { render } from '@testing-library/react-native';
import React, { type ReactElement } from 'react';

import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * Renders a component inside ThemeProvider so themed components (which call
 * useTheme internally) can mount in the component-test lane. Returns the same
 * queries as @testing-library/react-native's render.
 */
export function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}
