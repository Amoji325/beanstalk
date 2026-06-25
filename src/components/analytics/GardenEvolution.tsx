import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import type { BeanstalkVisualState } from '@src/utils/botanyEngine';
import { bloomStageFor } from '@src/utils/botanyEngine';
import type { VineColors } from '@src/components/HistoryVine';

// ═══════════════════════════════════════════════════════════════════════════════
// GardenEvolution — animated botanical canvas that renders a BeanstalkVisualState
// (Task 5.1, Stage 2). Pure-View vector plant; all motion runs on the UI thread
// via Reanimated shared values so it never blocks the JS/render threads.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DEV GATE — when true, a drag slider at the bottom of the canvas overrides the
 * engine values so the plant can be auditioned live on a simulator. Flip to
 * false (or strip on the production-build pass) to render the real state only.
 */
const SHOW_DEV_PREVIEW_SLIDER = true;

// ─── Canvas geometry ───────────────────────────────────────────────────────────

const CANVAS_H  = 220;
const SOIL_H    = 26;
const MIN_STALK = 14;
const MAX_STALK = CANVAS_H - SOIL_H - 28; // headroom for the bloom crown
const STALK_W   = 8;

// Colour anchors — mirror the endpoints in botanyEngine.buildPalette so the live
// preview matches the real interpolated palette exactly.
const VINE_LOW    = '#6b5566'; const VINE_HIGH   = '#43a047';
const LEAF_LOW    = '#8a7d6b'; const LEAF_HIGH    = '#5cb860';
const BLOOM_LOW   = '#9b6a8f'; const BLOOM_HIGH   = '#ffd479';
const CANVAS_CALM = '#0b1e0d'; const CANVAS_MOODY = '#160b14';

const ANIM = { duration: 520, easing: Easing.out(Easing.cubic) } as const;

// Leaves sprout in sequence as the stalk grows. Each has a growth threshold
// (fraction of full height at which it begins to appear) and a side + height.
interface LeafSpec { threshold: number; side: 'left' | 'right'; bottom: number; }
const LEAVES: LeafSpec[] = [
  { threshold: 0.22, side: 'left',  bottom: SOIL_H + MAX_STALK * 0.20 },
  { threshold: 0.38, side: 'right', bottom: SOIL_H + MAX_STALK * 0.36 },
  { threshold: 0.54, side: 'left',  bottom: SOIL_H + MAX_STALK * 0.52 },
  { threshold: 0.70, side: 'right', bottom: SOIL_H + MAX_STALK * 0.66 },
  { threshold: 0.84, side: 'left',  bottom: SOIL_H + MAX_STALK * 0.80 },
];

// ─── Leaf ──────────────────────────────────────────────────────────────────────
// Each leaf owns its animated style so the parent can render a fixed list without
// violating the rules of hooks.

function Leaf({
  spec,
  growth,
  sentiment,
}: {
  spec: LeafSpec;
  growth: SharedValue<number>;
  sentiment: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const appear = interpolate(
      growth.value,
      [spec.threshold - 0.12, spec.threshold],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const color = interpolateColor(sentiment.value, [0, 1], [LEAF_LOW, LEAF_HIGH]);
    return {
      opacity: appear,
      backgroundColor: color,
      transform: [
        { scale: 0.6 + appear * 0.4 },
        { rotate: spec.side === 'left' ? '-32deg' : '32deg' },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        leafBase.leaf,
        spec.side === 'left' ? leafBase.leafLeft : leafBase.leafRight,
        { bottom: spec.bottom },
        style,
      ]}
    />
  );
}

const leafBase = StyleSheet.create({
  leaf: {
    position: 'absolute',
    width: 30,
    height: 16,
    borderRadius: 12,
  },
  leafLeft:  { right: '50%', marginRight: STALK_W / 2 - 2, transformOrigin: 'right center' },
  leafRight: { left: '50%',  marginLeft: STALK_W / 2 - 2,  transformOrigin: 'left center' },
});

// ─── Props ───────────────────────────────────────────────────────────────────

interface GardenEvolutionProps {
  state: BeanstalkVisualState;
  c: VineColors;
}

export function GardenEvolution({ state, c }: GardenEvolutionProps) {
  // Dev override: a 0..1 percentage the slider writes to; drives the faked engine.
  const [devProgress, setDevProgress] = useState(0.35);

  // Resolve the values the plant should animate toward — either the slider's
  // synthetic sweep, or the real BeanstalkVisualState.
  const targets = useMemo(() => {
    if (SHOW_DEV_PREVIEW_SLIDER) {
      const p = devProgress;
      return { growth: p, sentiment: p, intensity: p };
    }
    return {
      growth: state.growth01,
      sentiment: state.bloomState,
      intensity: state.metrics.recentIntensity ?? 0.5,
    };
  }, [devProgress, state]);

  // UI-thread animation drivers.
  const growth    = useSharedValue(targets.growth);
  const sentiment = useSharedValue(targets.sentiment);
  const intensity = useSharedValue(targets.intensity);

  useEffect(() => {
    growth.value    = withTiming(targets.growth, ANIM);
    sentiment.value = withTiming(targets.sentiment, ANIM);
    intensity.value = withTiming(targets.intensity, ANIM);
  }, [targets, growth, sentiment, intensity]);

  // ── Animated styles ──────────────────────────────────────────────────────
  const canvasStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(intensity.value, [0, 1], [CANVAS_CALM, CANVAS_MOODY]),
  }));

  const stalkStyle = useAnimatedStyle(() => ({
    height: interpolate(growth.value, [0, 1], [MIN_STALK, MAX_STALK], Extrapolation.CLAMP),
    backgroundColor: interpolateColor(sentiment.value, [0, 1], [VINE_LOW, VINE_HIGH]),
  }));

  const bloomStyle = useAnimatedStyle(() => {
    // The crown blooms as the plant nears full height AND sentiment is high.
    const open = interpolate(growth.value, [0.6, 1], [0, 1], Extrapolation.CLAMP) * sentiment.value;
    return {
      opacity: open,
      transform: [{ scale: 0.4 + open * 0.7 }],
      backgroundColor: interpolateColor(sentiment.value, [0, 1], [BLOOM_LOW, BLOOM_HIGH]),
      bottom: SOIL_H + MAX_STALK - 6,
    };
  });

  // ── Live readout (from the same targets the plant follows) ────────────────
  const pct = Math.round(targets.growth * 100);
  const stage = bloomStageFor(targets.sentiment);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: c.textSecondary }]}>YOUR BEANSTALK</Text>

      <Animated.View style={[styles.canvas, canvasStyle]}>
        {/* Soil mound */}
        <View style={[styles.soil, { backgroundColor: `${c.textSecondary}33` }]} />

        {/* Stalk — grows from the soil line upward */}
        <Animated.View style={[styles.stalk, stalkStyle]} />

        {/* Leaves */}
        {LEAVES.map((spec, i) => (
          <Leaf key={i} spec={spec} growth={growth} sentiment={sentiment} />
        ))}

        {/* Bloom crown */}
        <Animated.View style={[styles.bloom, bloomStyle]} />
      </Animated.View>

      {/* Readout */}
      <View style={styles.readoutRow}>
        <Text style={[styles.readout, { color: c.textSecondary }]}>{`Growth ${pct}%`}</Text>
        <Text style={[styles.readout, { color: c.textSecondary }]}>{stage}</Text>
      </View>

      {SHOW_DEV_PREVIEW_SLIDER && (
        <DevSlider value={devProgress} onChange={setDevProgress} c={c} />
      )}
    </View>
  );
}

export default GardenEvolution;

// ─── Dev slider ──────────────────────────────────────────────────────────────
// Lightweight Pan-driven slider (no extra dependency). The thumb position lives
// on the UI thread for buttery dragging; the 0..1 value is mirrored back to React
// state via runOnJS so the plant's synthetic targets recompute.

function DevSlider({
  value,
  onChange,
  c,
}: {
  value: number;
  onChange: (v: number) => void;
  c: VineColors;
}) {
  const trackW = useSharedValue(0);
  const thumbX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      const x = Math.max(0, Math.min(trackW.value, e.x));
      thumbX.value = x;
      if (trackW.value > 0) runOnJS(onChange)(x / trackW.value);
    })
    .onChange((e) => {
      'worklet';
      const x = Math.max(0, Math.min(trackW.value, e.x));
      thumbX.value = x;
      if (trackW.value > 0) runOnJS(onChange)(x / trackW.value);
    });

  const fillStyle  = useAnimatedStyle(() => ({ width: thumbX.value }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value - 9 }] }));

  return (
    <View style={styles.devWrap}>
      <Text style={[styles.devLabel, { color: `${c.textSecondary}aa` }]}>
        DEV PREVIEW · drag to evolve
      </Text>
      <GestureDetector gesture={pan}>
        <View
          style={[styles.sliderTrack, { backgroundColor: `${c.textSecondary}22` }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            trackW.value = w;
            thumbX.value = value * w; // seed thumb from initial value
          }}
        >
          <Animated.View style={[styles.sliderFill, { backgroundColor: c.accent }, fillStyle]} />
          <Animated.View style={[styles.sliderThumb, { backgroundColor: c.accent }, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
    includeFontPadding: false,
  },
  canvas: {
    height: CANVAS_H,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  soil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SOIL_H,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  stalk: {
    position: 'absolute',
    bottom: SOIL_H - 2,
    width: STALK_W,
    borderTopLeftRadius: STALK_W / 2,
    borderTopRightRadius: STALK_W / 2,
  },
  bloom: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  readoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  readout: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  devWrap: {
    marginTop: 16,
    gap: 8,
  },
  devLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sliderTrack: {
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 18,
    borderRadius: 9,
    opacity: 0.5,
  },
  sliderThumb: {
    position: 'absolute',
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
});
