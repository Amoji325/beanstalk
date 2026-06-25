import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { Bean } from '@src/types';
import type { VineColors } from '@src/components/HistoryVine';
import { GardenEvolution } from '@src/components/analytics/GardenEvolution';
import { calculateStalkEvolution } from '@src/utils/botanyEngine';

// ─── Semantic Analytics ───────────────────────────────────────────────────────
// On-device AI classification display: sentiment + intensity mood bars and an
// auto-tag cloud. Renders three lifecycle states:
//   1. Pending  → shimmer skeleton while classification (or transcription) runs
//   2. Computed → mood bars + tag cloud
//   3. N/A      → nothing, for media-only entries that will never be classified

type RGB = readonly [number, number, number];

/** Clamps to [0, 1] so floating-point precision drift can never reach the style engine. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Linear-interpolates between two RGB tuples; t is clamped to [0, 1]. */
function lerpColor(a: RGB, b: RGB, t: number): string {
  const x = clamp01(t);
  const r = Math.round(a[0] + (b[0] - a[0]) * x);
  const g = Math.round(a[1] + (b[1] - a[1]) * x);
  const bl = Math.round(a[2] + (b[2] - a[2]) * x);
  return `rgb(${r}, ${g}, ${bl})`;
}

// Sentiment valence: moody dusty-rose (low) → calm pastel green (high).
const SENTIMENT_LOW:  RGB = [176, 106, 134]; // #b06a86
const SENTIMENT_HIGH: RGB = [127, 192, 140]; // #7fc08c
// Emotional intensity: calm slate-blue (low) → deep warm amber (high).
const INTENSITY_LOW:  RGB = [143, 184, 196]; // #8fb8c4
const INTENSITY_HIGH: RGB = [200, 122, 82];  // #c87a52

function MoodBar({
  label,
  value,
  lowColor,
  highColor,
  c,
}: {
  label: string;
  value: number;
  lowColor: RGB;
  highColor: RGB;
  c: VineColors;
}) {
  const v = clamp01(value);
  const pct = Math.round(v * 100); // integer percent — no precision drift
  const fill = lerpColor(lowColor, highColor, v);
  return (
    <View style={semanticStyles.barBlock}>
      <View style={semanticStyles.barLabelRow}>
        <Text style={[semanticStyles.barLabel, { color: c.textSecondary }]}>{label}</Text>
        <Text style={[semanticStyles.barValue, { color: c.textSecondary }]}>{pct}%</Text>
      </View>
      <View style={[semanticStyles.barTrack, { backgroundColor: `${c.textSecondary}22` }]}>
        <View style={[semanticStyles.barFill, { width: `${pct}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

function AnalyzingSkeleton({ c }: { c: VineColors }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const shimmer = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const barTint = `${c.textSecondary}26`;
  return (
    <View style={semanticStyles.root}>
      <Text style={[semanticStyles.sectionTitle, { color: c.textSecondary }]}>ATMOSPHERE</Text>
      <Animated.View style={shimmer}>
        <Text style={[semanticStyles.skelLabel, { color: c.textSecondary }]}>
          Analyzing your garden&apos;s atmosphere…
        </Text>
        <View style={[semanticStyles.skelBar, { backgroundColor: barTint, width: '70%' }]} />
        <View style={[semanticStyles.skelBar, { backgroundColor: barTint, width: '52%' }]} />
        <View style={[semanticStyles.skelBar, { backgroundColor: barTint, width: '40%' }]} />
      </Animated.View>
    </View>
  );
}

export function SemanticAnalytics({ bean, c }: { bean: Bean; c: VineColors }) {
  // Stalk visual state for the garden canvas. Hook must run before any early
  // return. NOTE: derived from this single bean for now — wiring the full stalk
  // history in is a later stage; the Stage-2 dev slider overrides these values.
  const stalkState = useMemo(() => calculateStalkEvolution([bean]), [bean]);

  // `== null` catches both null (DB) and undefined (in-memory unclassified).
  const hasAi = bean.aiSentiment != null;
  const willClassify =
    !!(bean.textContent || bean.scannedText || bean.transcription) || bean.type === 'voice';

  const aiTags = bean.aiTags ?? [];

  // The analytics body below the garden: computed metrics, a pending shimmer,
  // or nothing (media-only entries that will never be classified).
  let body: React.ReactNode = null;
  if (hasAi) {
    body = (
      <View style={semanticStyles.root}>
        <Text style={[semanticStyles.sectionTitle, { color: c.textSecondary }]}>ATMOSPHERE</Text>

        <MoodBar
          label="Sentiment"
          value={bean.aiSentiment ?? 0}
          lowColor={SENTIMENT_LOW}
          highColor={SENTIMENT_HIGH}
          c={c}
        />
        <MoodBar
          label="Intensity"
          value={bean.aiIntensity ?? 0}
          lowColor={INTENSITY_LOW}
          highColor={INTENSITY_HIGH}
          c={c}
        />

        {aiTags.length > 0 && (
          <View style={semanticStyles.tagCloud}>
            {aiTags.map((tag, index) => (
              <View
                key={index}
                style={[
                  semanticStyles.tagPill,
                  { borderColor: `${c.accent}66`, backgroundColor: `${c.accent}14` },
                ]}
              >
                <Text
                  style={[semanticStyles.tagText, { color: c.textPrimary }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  } else if (willClassify) {
    // Pending: fresh entry awaiting on-device inference or a transcription.
    body = <AnalyzingSkeleton c={c} />;
  }

  return (
    <>
      <GardenEvolution state={stalkState} c={c} />
      {body}
    </>
  );
}

export default SemanticAnalytics;

const semanticStyles = StyleSheet.create({
  root: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
    includeFontPadding: false,
  },
  barBlock: {
    marginBottom: 14,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagPill: {
    // No maxWidth — pills size to their text + padding and wrap organically.
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  skelLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  skelBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
});
