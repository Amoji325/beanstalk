import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Keyboard } from 'react-native';
import type { CaptureMode } from '@src/types';

// ─── Mode Metadata ─────────────────────────────────────────────────────────

export const CAPTURE_MODES: CaptureMode[] = ['scan', 'type', 'voice', 'photo'];

export const MODE_LABELS: Record<CaptureMode, string> = {
  scan:  'SCAN',
  type:  'TYPE',
  voice: 'VOICE',
  photo: 'PHOTO',
};

/** Human-readable verb for each mode's action button. */
export const MODE_ACTION_LABELS: Record<CaptureMode, string> = {
  scan:  'Scan Page',
  type:  'Plant Bean',
  voice: 'Hold to Record',
  photo: 'Take Photo',
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface CaptureContextValue {
  activeMode: CaptureMode;
  activeModeIndex: number;
  setActiveModeIndex: (index: number) => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface CaptureProviderProps {
  children: React.ReactNode;
  /** Starting mode index. Defaults to 1 (TYPE) — works without camera permissions. */
  initialIndex?: number;
}

export function CaptureProvider({
  children,
  initialIndex = 1,
}: CaptureProviderProps) {
  const [activeModeIndex, setActiveModeIndexState] = useState(initialIndex);

  const setActiveModeIndex = useCallback((index: number) => {
    Keyboard.dismiss();
    setActiveModeIndexState(Math.min(3, Math.max(0, index)));
  }, []);

  const value = useMemo<CaptureContextValue>(
    () => ({
      activeMode: CAPTURE_MODES[activeModeIndex],
      activeModeIndex,
      setActiveModeIndex,
    }),
    [activeModeIndex, setActiveModeIndex]
  );

  return (
    <CaptureContext.Provider value={value}>
      {children}
    </CaptureContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCaptureMode(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) {
    throw new Error('useCaptureMode must be called within a CaptureProvider');
  }
  return ctx;
}
