import { Redirect } from 'expo-router';

/**
 * Debug-only route. In release builds this redirects home and the Motion Lab
 * module is never required, so Metro drops it from the production bundle.
 */
export default function MotionLabRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MotionLab = require('@/components/motion/MotionLab').default as () => React.JSX.Element;
  return <MotionLab />;
}
