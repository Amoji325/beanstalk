import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  deleteStalk as deleteStalkDb,
  ensureDatabaseInitialized,
  fetchAllStalks,
  insertStalk,
  type StalkRecord,
} from '@src/database';
import { getBiome, type BiomeConfig } from '@src/constants';
import type { BiomeTheme } from '@src/types';

const DEFAULT_STALK_ID = 'default-garden';

// ─── Context Value ────────────────────────────────────────────────────────────

interface StalkContextValue {
  /** All cultivated stalks, in creation order. */
  stalks: StalkRecord[];
  activeStalkId: string;
  activeStalk: StalkRecord | null;
  /** Resolved biome config for the active stalk (Standard until loaded). */
  biome: BiomeConfig;
  loading: boolean;
  /** Switch the active stalk — drives HistoryVine + theme to refresh. */
  setActiveStalkId: (id: string) => void;
  /** Re-fetch the stalk list from the DB. */
  refreshStalks: () => Promise<void>;
  /**
   * Create a new stalk with a user-chosen name and biome theme, then make it
   * the active stalk.
   */
  createStalk: (name: string, theme: BiomeTheme) => Promise<void>;
  /**
   * Permanently delete a stalk and all its beans. If the deleted stalk is
   * currently active, the context falls back to the default garden. The default
   * stalk ('default-garden') cannot be deleted — the DB layer enforces this.
   */
  deleteStalk: (id: string) => Promise<void>;
}

const StalkContext = createContext<StalkContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugifyId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'stalk';
  return `${slug}-${Date.now().toString(36)}`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StalkProvider({ children }: { children: React.ReactNode }) {
  const [stalks, setStalks] = useState<StalkRecord[]>([]);
  const [activeStalkId, setActiveStalkId] = useState<string>(DEFAULT_STALK_ID);
  const [loading, setLoading] = useState(true);

  const refreshStalks = useCallback(async () => {
    const rows = await fetchAllStalks();
    setStalks(rows);
    setLoading(false);
    // If the active stalk no longer exists (e.g. first load), fall back to the
    // first available stalk.
    setActiveStalkId((current) =>
      rows.some((s) => s.id === current) ? current : (rows[0]?.id ?? DEFAULT_STALK_ID)
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureDatabaseInitialized();
      if (!cancelled) await refreshStalks();
    })();
    return () => { cancelled = true; };
  }, [refreshStalks]);

  const deleteStalk = useCallback(async (id: string) => {
    // Switch away before deleting so the active view never points at a ghost.
    setActiveStalkId((current) => (current === id ? DEFAULT_STALK_ID : current));
    await deleteStalkDb(id);
    await refreshStalks();
  }, [refreshStalks]);

  const createStalk = useCallback(async (name: string, theme: BiomeTheme) => {
    const record: StalkRecord = {
      id: slugifyId(name),
      name: name.trim() || 'New Stalk',
      themeType: theme,
      isPremium: theme !== 'standard',
    };
    await insertStalk(record);
    await refreshStalks();
    setActiveStalkId(record.id);
  }, [refreshStalks]);

  const activeStalk = useMemo(
    () => stalks.find((s) => s.id === activeStalkId) ?? null,
    [stalks, activeStalkId]
  );

  const biome = useMemo(
    () => getBiome(activeStalk?.themeType),
    [activeStalk?.themeType]
  );

  const value = useMemo<StalkContextValue>(
    () => ({
      stalks,
      activeStalkId,
      activeStalk,
      biome,
      loading,
      setActiveStalkId,
      refreshStalks,
      createStalk,
      deleteStalk,
    }),
    [stalks, activeStalkId, activeStalk, biome, loading, refreshStalks, createStalk, deleteStalk]
  );

  return <StalkContext.Provider value={value}>{children}</StalkContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStalk(): StalkContextValue {
  const ctx = useContext(StalkContext);
  if (!ctx) {
    throw new Error('useStalk must be called within a StalkProvider');
  }
  return ctx;
}
