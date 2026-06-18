import { useCallback, useEffect, useState } from 'react';
import { ensureDatabaseInitialized, fetchBeansForStalk } from '@src/database';
import type { Bean } from '@src/types';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBeansResult {
  beans: Bean[];
  loading: boolean;
  /** Re-queries the DB. Call after any insert / delete. */
  refresh: () => Promise<void>;
}

/**
 * Loads (and re-loads) the beans for a given stalk. When `stalkId` changes —
 * e.g. the user switches stalks — `loading` flips back to true and the new
 * stalk's rows are fetched, so HistoryVine refreshes immediately.
 */
export function useBeans(stalkId: string): UseBeansResult {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await fetchBeansForStalk(stalkId);
    setBeans(data);
    setLoading(false);
  }, [stalkId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBeans([]); // clear stale rows while the new stalk loads
    (async () => {
      await ensureDatabaseInitialized();
      if (!cancelled) await refresh();
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  return { beans, loading, refresh };
}
