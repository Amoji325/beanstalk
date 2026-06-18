import { useCallback, useRef, useState } from 'react';
import { fetchRandomBean } from '@src/database';
import type { Bean } from '@src/types';

// ─── Safe-Shake Filter ────────────────────────────────────────────────────────
//
// Keyword *stems* screened out of shake-recalled memories so a serendipitous
// rediscovery never ambushes the user with a high-stress entry. Stems are
// matched at a word boundary with any suffix allowed, so "stress" catches
// "stressed"/"stressful", "fail" catches "failed"/"failing", etc.

export const DEFAULT_STRESS_STEMS: string[] = [
  'sad',
  'stress',
  'angr',       // angry, anger
  'cry',        // cry, crying
  'cried',
  'fail',       // fail, failed, failing
  'anx',        // anxious, anxiety
  'depress',
  'hate',
  'furious',
  'miserabl',
  'grief',
  'lonely',
  'terrible',
  'awful',
  'hopeless',
  'panic',
];

/** Concatenates every human-readable text field of a bean, lowercased. */
function readableText(bean: Bean): string {
  return [
    bean.textContent,
    bean.scannedText,
    bean.transcription,
    bean.caption,
    bean.tags?.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * True if the bean's readable text contains any blocked stress keyword stem.
 * Exported so the filter is reusable and unit-testable.
 */
export function containsStressKeywords(
  bean: Bean,
  stems: string[] = DEFAULT_STRESS_STEMS
): boolean {
  const text = readableText(bean);
  if (!text) return false;
  return stems.some((stem) => {
    // \b<stem>\w*  — word boundary, stem, then any word characters.
    const re = new RegExp(`\\b${stem}\\w*`, 'i');
    return re.test(text);
  });
}

// ─── Selector ─────────────────────────────────────────────────────────────────

/**
 * Caps the number of re-rolls. Prevents an infinite loop when every memory is
 * stressful, or when the garden has very few beans (so RANDOM() keeps repeating).
 */
const MAX_ATTEMPTS = 10;

/**
 * Repeatedly pulls a random bean and re-rolls until one passes the Safe-Shake
 * Filter. Returns null if no safe memory surfaces within MAX_ATTEMPTS (or the
 * garden is empty).
 */
async function selectSafeBean(
  stalkId: string,
  stems: string[]
): Promise<Bean | null> {
  const tried = new Set<string>();
  let lastId: string | undefined;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const bean = await fetchRandomBean(stalkId, lastId);
    if (!bean) return null; // garden empty (or all remaining are safeShakeHidden)

    lastId = bean.id;
    if (tried.has(bean.id)) continue; // already screened this one — keep rolling
    tried.add(bean.id);

    if (!containsStressKeywords(bean, stems)) {
      return bean; // safe, neutral or positive memory
    }
  }
  return null; // exhausted attempts without a safe result
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface ShakeMemoryState {
  /** The currently revealed memory, or null when nothing is shown. */
  memory: Bean | null;
  /** True while a safe memory is being selected. */
  isSelecting: boolean;
  /** Kicks off a safe random selection (call from the shake callback). */
  reveal: () => void;
  /** Dismisses the current memory. */
  dismiss: () => void;
}

export function useShakeMemory(
  stalkId: string,
  stressStems: string[] = DEFAULT_STRESS_STEMS
): ShakeMemoryState {
  const [memory, setMemory] = useState<Bean | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const busyRef = useRef(false);

  const reveal = useCallback(() => {
    // Guard against overlapping selections (rapid repeated shakes).
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSelecting(true);

    selectSafeBean(stalkId, stressStems)
      .then((bean) => {
        if (bean) setMemory(bean);
      })
      .catch((e) => console.warn('[Beanstalk] safe-shake select failed:', e))
      .finally(() => {
        busyRef.current = false;
        setIsSelecting(false);
      });
  }, [stalkId, stressStems]);

  const dismiss = useCallback(() => setMemory(null), []);

  return { memory, isSelecting, reveal, dismiss };
}
