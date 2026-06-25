import type { Bean } from '@src/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Botany Engine — pure, stateless growth + colour mathematics for the visual
// Beanstalk evolution (Task 5.1). NO React, NO side effects, NO hidden clock.
//
// Everything here is a pure function of its inputs, so it can be:
//   • unit-tested with fixed arrays and a fixed `now`,
//   • run inside a background sync worker, or
//   • memoised in a component without touching render lifecycles.
//
// The only "environmental" input — the current time — is passed in explicitly
// (see StalkEvolutionOptions.now). It is never read from Date.now() internally.
// `new Date(ts)` with an argument is used purely to bucket a timestamp into its
// local calendar day; it reads no ambient state.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Public model: BeanstalkVisualState ───────────────────────────────────────

/** Discrete bloom stage bucketed from the continuous bloomState float. */
export type BloomStage = 'dropping' | 'budded' | 'open';

/**
 * Interpolated colour set for the garden canvas and plant strokes. All values
 * are `#rrggbb` hex strings ready to drop straight into RN style props.
 */
export interface BotanyPalette {
  /** Full-canvas background wash. Moodier/warmer as recent intensity rises. */
  canvasWash: string;
  /** Primary vine / stalk stroke. Duller at low sentiment, vivid green at high. */
  vineStroke: string;
  /** Leaf fill. Dry/greyed at low sentiment, bright living green at high. */
  leafFill: string;
  /** Bloom / flower accent. Muted mauve at low sentiment, warm gold at high. */
  bloomAccent: string;
}

/** Recent-window emotional indexes that drove the palette + bloom. */
export interface BotanyMetrics {
  /** Mean aiSentiment across classified beans in the recent window (0..1), or null if none. */
  recentSentiment: number | null;
  /** Mean aiIntensity across classified beans in the recent window (0..1), or null if none. */
  recentIntensity: number | null;
  /** Recent-half mean minus prior-half mean sentiment, clamped to [-1, 1]. */
  sentimentTrend: number;
  /** Count of beans in the window that carried AI classification data. */
  classifiedCount: number;
}

/**
 * The single unified payload the renderer consumes. Every field is a finished
 * visual dimension — the UI layer should do zero math beyond reading these.
 */
export interface BeanstalkVisualState {
  /** Current consecutive writing streak in calendar days (grace: still counts if the last entry was yesterday). */
  streakDays: number;
  /** All-time longest consecutive streak (calendar days). */
  longestStreakDays: number;
  /** Virtual stalk height in growth segments, derived from the current streak. */
  height: number;
  /** Normalised growth 0..1 for render scaling (height against a soft cap). */
  growth01: number;
  /** Continuous bloom openness 0..1 from recent average sentiment. */
  bloomState: number;
  /** Discrete bloom stage bucketed from bloomState. */
  bloomStage: BloomStage;
  /** Interpolated colour set for canvas + plant strokes. */
  colorPalette: BotanyPalette;
  /** The emotional indexes behind the palette/bloom — exposed for debugging + UI copy. */
  metrics: BotanyMetrics;
}

// ─── Tuning constants ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** A brand-new garden still shows one segment of sprout. */
const BASE_SEGMENTS = 1;

/** Streak length that maps to a "fully grown" stalk for render normalisation. */
const HEIGHT_SOFT_CAP = 30;

/** How many days back the emotional averaging window reaches. */
const RECENT_WINDOW_DAYS = 14;

/** Neutral sentiment/intensity used when no AI data exists yet. */
const NEUTRAL = 0.5;

// Palette anchors — [low metric, high metric] endpoints, lerped per-channel.
// Sentiment drives plant colour (valence); intensity drives the canvas mood.
const VINE_LOW   = '#6b5566'; const VINE_HIGH   = '#43a047'; // greyed mauve → vivid leaf
const LEAF_LOW   = '#8a7d6b'; const LEAF_HIGH   = '#5cb860'; // dry tan → bright blossom
const BLOOM_LOW  = '#9b6a8f'; const BLOOM_HIGH  = '#ffd479'; // muted mauve → warm gold
const CANVAS_CALM = '#0b1e0d'; const CANVAS_MOODY = '#160b14'; // calm canopy → warm moody dark

// ─── Numeric helpers (pure) ────────────────────────────────────────────────────

/** Clamps to [0, 1]; NaN collapses to 0 so precision drift can never escape. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Linear-interpolates two hex colours; t is clamped to [0, 1]. */
export function lerpHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex(
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  );
}

// ─── Calendar-day bucketing (pure given ts) ────────────────────────────────────

/**
 * Maps a Unix-ms timestamp to an integer ordinal for its LOCAL calendar day.
 * Two timestamps on the same local day yield the same ordinal; consecutive days
 * differ by exactly 1. Uses Date.UTC of the local Y/M/D to get a stable integer
 * (no timezone drift, no ambient clock read).
 */
export function dayOrdinal(ts: number): number {
  const d = new Date(ts);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

// ─── Streak sweep ──────────────────────────────────────────────────────────────

/**
 * Computes current + longest consecutive-day streaks from a set of active day
 * ordinals. The current streak ends at the most recent active day and only
 * counts toward "now" if that day is today or yesterday (a one-day grace so the
 * stalk doesn't visibly collapse before the user has had a chance to write today).
 */
export function computeStreaks(
  dayOrdinals: number[],
  todayOrdinal: number,
): { current: number; longest: number } {
  if (dayOrdinals.length === 0) return { current: 0, longest: 0 };

  // Unique, ascending.
  const days = Array.from(new Set(dayOrdinals)).sort((a, b) => a - b);

  // Longest run anywhere in history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // Current run ending at the most recent active day, gated by the grace window.
  const mostRecent = days[days.length - 1];
  let current = 0;
  if (mostRecent >= todayOrdinal - 1) {
    let expected = mostRecent;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i] === expected) {
        current++;
        expected--;
      } else {
        break;
      }
    }
  }

  return { current, longest };
}

// ─── Recent emotional averaging ────────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Averages aiSentiment / aiIntensity over the recent window and measures a
 * short-term trend (recent half vs prior half of the window). Beans without AI
 * data are simply skipped — they never poison the average with a default value.
 */
export function averageRecentMetrics(
  beans: Bean[],
  now: number,
  windowDays: number,
): BotanyMetrics {
  const windowStart = now - windowDays * DAY_MS;
  const windowMid = now - (windowDays / 2) * DAY_MS;

  const inWindow = beans.filter(
    (b) => b.createdAt >= windowStart && b.createdAt <= now && b.aiSentiment != null,
  );

  const recentSentiment = mean(inWindow.map((b) => clamp01(b.aiSentiment ?? 0)));
  const recentIntensity = mean(
    inWindow.filter((b) => b.aiIntensity != null).map((b) => clamp01(b.aiIntensity ?? 0)),
  );

  const recentHalf = mean(
    inWindow.filter((b) => b.createdAt >= windowMid).map((b) => clamp01(b.aiSentiment ?? 0)),
  );
  const priorHalf = mean(
    inWindow.filter((b) => b.createdAt < windowMid).map((b) => clamp01(b.aiSentiment ?? 0)),
  );

  const sentimentTrend =
    recentHalf != null && priorHalf != null
      ? Math.max(-1, Math.min(1, recentHalf - priorHalf))
      : 0;

  return {
    recentSentiment,
    recentIntensity,
    sentimentTrend,
    classifiedCount: inWindow.length,
  };
}

// ─── Palette + bloom mapping ───────────────────────────────────────────────────

/** Builds the interpolated colour set from normalised sentiment + intensity. */
export function buildPalette(sentiment01: number, intensity01: number): BotanyPalette {
  const s = clamp01(sentiment01);
  const i = clamp01(intensity01);
  return {
    vineStroke:  lerpHex(VINE_LOW, VINE_HIGH, s),
    leafFill:    lerpHex(LEAF_LOW, LEAF_HIGH, s),
    bloomAccent: lerpHex(BLOOM_LOW, BLOOM_HIGH, s),
    canvasWash:  lerpHex(CANVAS_CALM, CANVAS_MOODY, i),
  };
}

/** Buckets a continuous 0..1 bloom value into its discrete stage. */
export function bloomStageFor(bloom01: number): BloomStage {
  const b = clamp01(bloom01);
  if (b < 0.34) return 'dropping';
  if (b < 0.67) return 'budded';
  return 'open';
}

// ─── Public entry point ────────────────────────────────────────────────────────

export interface StalkEvolutionOptions {
  /**
   * Reference "now" timestamp (Unix ms) anchoring streak + window math.
   * Omit in tests for deterministic output — it then defaults to the latest
   * bean's createdAt. Production callers should pass Date.now().
   */
  now?: number;
  /** Recent emotional-averaging window in days. Default 14. */
  recentWindowDays?: number;
}

/** The state a brand-new / empty garden renders as. */
function seedState(): BeanstalkVisualState {
  return {
    streakDays: 0,
    longestStreakDays: 0,
    height: BASE_SEGMENTS,
    growth01: clamp01(BASE_SEGMENTS / HEIGHT_SOFT_CAP),
    bloomState: NEUTRAL,
    bloomStage: bloomStageFor(NEUTRAL),
    colorPalette: buildPalette(NEUTRAL, NEUTRAL),
    metrics: {
      recentSentiment: null,
      recentIntensity: null,
      sentimentTrend: 0,
      classifiedCount: 0,
    },
  };
}

/**
 * Parses a stalk's journal history into a unified BeanstalkVisualState:
 *   1. bucket every entry into its local calendar day,
 *   2. sweep for current + longest consecutive-day streaks,
 *   3. average recent AI sentiment/intensity (skipping unclassified entries),
 *   4. derive height, bloom, and an interpolated colour palette.
 *
 * Pure and deterministic for a fixed (beans, options) pair.
 */
export function calculateStalkEvolution(
  historicalBeans: Bean[],
  options: StalkEvolutionOptions = {},
): BeanstalkVisualState {
  if (historicalBeans.length === 0) return seedState();

  // Deterministic clock-free default: anchor to the most recent entry.
  const latest = historicalBeans.reduce((max, b) => Math.max(max, b.createdAt), 0);
  const now = options.now ?? latest;
  const windowDays = options.recentWindowDays ?? RECENT_WINDOW_DAYS;

  // 1–2. Streaks.
  const todayOrdinal = dayOrdinal(now);
  const ordinals = historicalBeans.map((b) => dayOrdinal(b.createdAt));
  const { current, longest } = computeStreaks(ordinals, todayOrdinal);

  // 3. Recent emotional indexes.
  const metrics = averageRecentMetrics(historicalBeans, now, windowDays);

  // 4. Derived dimensions. Bloom follows recent sentiment; when there is no AI
  // data yet, fall back to neutral so the stalk reads as "tightly budded".
  const sentiment = metrics.recentSentiment ?? NEUTRAL;
  const intensity = metrics.recentIntensity ?? NEUTRAL;

  const height = BASE_SEGMENTS + current;
  const bloomState = clamp01(sentiment);

  return {
    streakDays: current,
    longestStreakDays: longest,
    height,
    growth01: clamp01(height / HEIGHT_SOFT_CAP),
    bloomState,
    bloomStage: bloomStageFor(bloomState),
    colorPalette: buildPalette(sentiment, intensity),
    metrics,
  };
}
