import { createContext, useContext, type ReactNode } from 'react';

import { MOTION_STAGGER_STEP } from './easePresets';
import { useReducedMotion } from './useReducedMotion';

type StaggerContextValue = {
  reducedMotionEnabled: boolean;
  step: number;
};

const StaggerContext = createContext<StaggerContextValue>({
  reducedMotionEnabled: false,
  step: MOTION_STAGGER_STEP,
});

export function StaggerGroup({
  children,
  step = MOTION_STAGGER_STEP,
}: {
  children: ReactNode;
  step?: number;
}) {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <StaggerContext.Provider
      value={{
        reducedMotionEnabled,
        step: reducedMotionEnabled ? 0 : step,
      }}
    >
      {children}
    </StaggerContext.Provider>
  );
}

export function useStaggerGroup() {
  return useContext(StaggerContext);
}
