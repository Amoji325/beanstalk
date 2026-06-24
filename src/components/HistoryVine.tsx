import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ListRenderItemInfo,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { Bean, BeanType } from '@src/types';
import type { BiomeConfig } from '@src/constants';

// ─── Layout Constants ─────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TRUNK_CX    = Math.round(SCREEN_WIDTH / 2); // round to whole pixel to keep all card positions on-grid
const TRUNK_W     = 12;  // thick continuous pillar
const BRANCH_LEN  = 36;  // horizontal arm to the card
const KNOT_D      = 18;  // chunky knot nodes
const SHADOW_OFF  = 5;   // flat offset shadow depth

/** Fixed row heights per bean type — constant so getItemLayout stays O(1). */
const ROW_H: Record<BeanType, number> = {
  type:  124,
  photo: 198,
  voice:  92,
  scan:  104,
};

const NODE_W: Record<BeanType, number> = {
  type:  146,
  photo: 138,
  voice: 130,
  scan:  152,
};
const NODE_H: Record<BeanType, number> = {
  type:   72,
  photo: 152,
  voice:  52,
  scan:   54,
};

// ─── Theme-derived colours ────────────────────────────────────────────────────

/** Returns true when a hex colour string is perceptually light. */
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 128;
}

type PodRadius = Pick<ViewStyle,
  'borderTopLeftRadius' | 'borderTopRightRadius' |
  'borderBottomLeftRadius' | 'borderBottomRightRadius'
>;

/** Asymmetric border-radius for the organic leaf-pod card shape. */
function podRadius(side: 'left' | 'right'): PodRadius {
  // Big curves on the diagonal corners facing away from the vine branch.
  return side === 'right'
    ? { borderTopLeftRadius: 6,  borderTopRightRadius: 28,
        borderBottomLeftRadius: 28, borderBottomRightRadius: 6 }
    : { borderTopLeftRadius: 28, borderTopRightRadius: 6,
        borderBottomLeftRadius: 6,  borderBottomRightRadius: 28 };
}

/** Flat colour bundle derived once per biome and threaded into every row. */
interface VineColors {
  canvas: string;
  trunk: string;
  knot: string;
  leafBorder: string;
  flowerBorder: string;
  fruitBorder: string;
  rootBorder: string;
  nodeSurface: string;
  nodeBorderTint?: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  glow: boolean;
  nodeBorderWidth: number;
  /** Cartoon outline border for all pod cards. Adapts to surface brightness. */
  cardOutline: string;
  /** Flat offset shadow colour behind the cards. */
  cardShadow: string;
}

function makeColors(biome: BiomeConfig): VineColors {
  const { palette, nodeSurface, visuals } = biome;
  const lightSurface = isLightColor(nodeSurface);
  return {
    canvas: palette.backgroundEnd,
    trunk: palette.vineColor,
    knot: palette.accentColor,
    leafBorder: palette.leafColor,
    flowerBorder: palette.flowerColor,
    fruitBorder: palette.fruitColor,
    rootBorder: palette.rootColor,
    nodeSurface,
    nodeBorderTint: visuals.nodeBorderTint,
    textPrimary: palette.textPrimary,
    textSecondary: palette.textSecondary,
    accent: palette.accentColor,
    glow: visuals.glow,
    nodeBorderWidth: visuals.nodeBorderWidth,
    cardOutline: visuals.cardOutline ?? (lightSurface ? '#2a1a08' : 'rgba(255,255,255,0.22)'),
    cardShadow:  visuals.cardShadow  ?? (lightSurface ? 'rgba(42,26,8,0.40)' : 'rgba(0,0,0,0.45)'),
  };
}

/** Coloured glow applied to node strokes in neon / cosmic biomes. */
function glowStyle(color: string, on: boolean): ViewStyle {
  if (!on) return {};
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 6,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string | undefined, len: number): string {
  if (!text) return '';
  return text.length > len ? `${text.slice(0, len).trimEnd()}…` : text;
}

function fmtDuration(seconds: number | undefined): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Bean Node Renderers ──────────────────────────────────────────────────────

interface NodeProps { bean: Bean; c: VineColors; side: 'left' | 'right' }

function LeafNode({ bean, c, side }: NodeProps) {
  const r = podRadius(side);
  return (
    <View
      style={[
        nodeStyles.leaf,
        r,
        { backgroundColor: c.nodeSurface, borderColor: c.cardOutline },
        glowStyle(c.accent, c.glow),
      ]}
    >
      <Text style={[nodeStyles.leafText, { color: c.textPrimary }]} numberOfLines={2}>
        {truncate(bean.textContent, 120)}
      </Text>
      <View style={nodeStyles.leafFooter}>
        <Text style={[nodeStyles.leafDate, { color: c.textSecondary }]}>
          {fmtDate(bean.createdAt)}
        </Text>
        {bean.title ? (
          <>
            <Text style={[nodeStyles.leafSep, { color: `${c.textSecondary}88` }]}>{' • '}</Text>
            <Text
              style={[nodeStyles.leafTitle, { color: c.accent, flex: 1 }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {bean.title}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function FlowerNode({ bean, c, side }: NodeProps) {
  const uri = bean.imageUri ?? bean.thumbnailUri;
  const r = podRadius(side);
  // Clip mask covers only the top corners — the image must follow the card's
  // upper organic curves. The bottom of the image transitions directly into the
  // footer area, so no bottom-corner clipping is needed there.
  const clipR: PodRadius = {
    borderTopLeftRadius:     Math.max(0, Number(r.borderTopLeftRadius  ?? 0) - 3),
    borderTopRightRadius:    Math.max(0, Number(r.borderTopRightRadius ?? 0) - 3),
    borderBottomLeftRadius:  0,
    borderBottomRightRadius: 0,
  };
  return (
    <View
      style={[
        nodeStyles.flower,
        r,
        // backgroundColor on the outermost container so the entire card interior
        // is filled — no child layer needs its own background, eliminating the
        // rectangular fill that was cutting across the 3px border.
        { borderColor: c.cardOutline, backgroundColor: c.nodeSurface },
        glowStyle(c.flowerBorder, c.glow),
      ]}
    >
      {/* Clip mask lives on an inner container so overflow:hidden never touches
          the outer border — this keeps all four rounded edges fully continuous. */}
      <View style={[nodeStyles.flowerClip, clipR]}>
        {uri ? (
          <Image source={{ uri }} style={nodeStyles.flowerImage} resizeMode="cover" />
        ) : (
          <View style={[nodeStyles.flowerPlaceholder, { backgroundColor: c.nodeSurface }]}>
            <Text style={[nodeStyles.flowerIcon, { color: c.flowerBorder }]}>⚘</Text>
          </View>
        )}
      </View>
      {/* Footer — transparent; background is provided by the parent card container */}
      <View style={nodeStyles.flowerFooter}>
        <Text
          style={[nodeStyles.flowerDate, { color: c.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {fmtDate(bean.createdAt)}
          {bean.title
            ? <Text style={[nodeStyles.leafTitle, { color: c.accent }]}>{` · ${bean.title}`}</Text>
            : null
          }
        </Text>
      </View>
    </View>
  );
}

function FruitNode({ bean, c, side }: NodeProps) {
  const r = podRadius(side);
  return (
    <View
      style={[
        nodeStyles.fruit,
        r,
        { backgroundColor: c.nodeSurface, borderColor: c.cardOutline },
        glowStyle(c.flowerBorder, c.glow),
      ]}
    >
      <View style={[nodeStyles.fruitDot, { backgroundColor: c.fruitBorder }]} />
      <Text style={[nodeStyles.fruitDuration, { color: c.textPrimary }]}>
        {fmtDuration(bean.audioDurationSeconds)}
      </Text>
      <Text
        style={[nodeStyles.fruitDate, { color: c.textSecondary }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {fmtDate(bean.createdAt)}
        {bean.title
          ? <Text style={[nodeStyles.leafTitle, { color: c.accent }]}>{` · ${bean.title}`}</Text>
          : null
        }
      </Text>
    </View>
  );
}

function RootNode({ bean, c, side }: NodeProps) {
  const r = podRadius(side);
  return (
    <View
      style={[
        nodeStyles.root,
        r,
        { backgroundColor: c.nodeSurface, borderColor: c.cardOutline },
      ]}
    >
      <Text style={[nodeStyles.rootLabel, { color: c.accent }]}>≡ SCAN</Text>
      <Text style={[nodeStyles.rootText, { color: c.textSecondary }]} numberOfLines={1}>
        {truncate(bean.scannedText || bean.caption, 40)}
      </Text>
      <Text
        style={[nodeStyles.rootDate, { color: c.textSecondary }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {fmtDate(bean.createdAt)}
        {bean.title
          ? <Text style={[nodeStyles.leafTitle, { color: c.accent }]}>{` · ${bean.title}`}</Text>
          : null
        }
      </Text>
    </View>
  );
}

function BeanNode({ bean, c, side }: NodeProps) {
  switch (bean.type) {
    case 'type':  return <LeafNode  bean={bean} c={c} side={side} />;
    case 'photo': return <FlowerNode bean={bean} c={c} side={side} />;
    case 'voice': return <FruitNode  bean={bean} c={c} side={side} />;
    case 'scan':  return <RootNode   bean={bean} c={c} side={side} />;
  }
}

// ─── Ladybug Mini Badge (timeline favourite marker) ──────────────────────────
// Thin wrapper — delegates to the scalable LadybugIcon below.
// Defined here (before VineRow) so VineRow can reference it.
// LadybugIcon is defined later in the file; React resolves function hoisting. ✓

function idSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h;
}

function LadybugMini() {
  return (
    <View style={{ shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 0 }, shadowRadius: 0.5, shadowOpacity: 1 }}>
      <LadybugIcon active outlineColor="#1a0000" bodySize={14} />
    </View>
  );
}

// ─── VineItem ─────────────────────────────────────────────────────────────────

export interface VineItem {
  bean: Bean;
  /** Position in the oldest-first DB array — immutable, drives L/R alternation. */
  stableIndex: number;
}

// ─── VineRow ──────────────────────────────────────────────────────────────────

interface VineRowProps {
  item: VineItem;
  colors: VineColors;
  onPress: (bean: Bean) => void;
}

const VineRow = React.memo(function VineRow({ item, colors, onPress }: VineRowProps) {
  const { bean, stableIndex } = item;
  const side: 'left' | 'right' = stableIndex % 2 === 0 ? 'right' : 'left';
  const rowH  = ROW_H[bean.type];
  const nodeW = NODE_W[bean.type];
  const nodeH = NODE_H[bean.type];

  const midY       = rowH / 2;
  const trunkLeft  = TRUNK_CX - TRUNK_W / 2;
  const trunkRight = TRUNK_CX + TRUNK_W / 2;
  const nodeTop    = midY - nodeH / 2;

  const rBranchLeft  = trunkRight;
  const rNodeLeft    = trunkRight + BRANCH_LEN;
  // right: trunkRight places the branch's right edge at trunkLeft from the screen's left,
  // mirroring the right-side geometry and closing the gap between branch and card.
  const lBranchRight = trunkRight;
  const lNodeRight   = SCREEN_WIDTH - (trunkLeft - BRANCH_LEN);

  const handlePress = useCallback(() => onPress(bean), [bean, onPress]);

  // Deterministic ladybug placement — stable across re-renders, unique per bean.
  const seed       = idSeed(bean.id);
  const lbRotation = (seed % 7) * 8 - 24;   // −24° … +24°
  const lbTop      = -4 - (seed % 6);        // −4px … −9px
  const lbRight    = 6 + (seed % 9);         // 6px … 14px

  // Shadow shifts down + outward (away from trunk) for each side.
  const shadowInset: ViewStyle = side === 'right'
    ? { top: SHADOW_OFF, left: SHADOW_OFF }
    : { top: SHADOW_OFF, left: -SHADOW_OFF };

  const cardRadius = podRadius(side);

  return (
    <View style={[styles.vineRow, { height: rowH }]}>
      {/* ── Thick trunk with cartoon side-outline ─────────────────────────── */}
      <View
        style={[
          styles.trunkLine,
          {
            left: trunkLeft,
            width: TRUNK_W,
            height: rowH,
            backgroundColor: colors.trunk,
            borderLeftWidth: 1.5,
            borderRightWidth: 1.5,
            borderLeftColor: colors.cardOutline,
            borderRightColor: colors.cardOutline,
          },
        ]}
      />

      {/* ── Chunky knot pod ───────────────────────────────────────────────── */}
      <View
        style={[
          styles.knot,
          {
            left:            TRUNK_CX - KNOT_D / 2,
            top:             midY - KNOT_D / 2,
            backgroundColor: colors.knot,
            borderWidth:     2,
            borderColor:     colors.cardOutline,
          },
          glowStyle(colors.knot, colors.glow),
        ]}
      />

      {side === 'right' && (
        <>
          {/* Branch arm */}
          <View
            style={[
              styles.branchLine,
              {
                left:            rBranchLeft,
                width:           BRANCH_LEN,
                top:             midY - 3,
                backgroundColor: colors.trunk,
                borderTopWidth:  1.5,
                borderBottomWidth: 1.5,
                borderTopColor:  colors.cardOutline,
                borderBottomColor: colors.cardOutline,
              },
            ]}
          />

          {/* Card wrapper: flat shadow behind, card in front */}
          <View style={[styles.nodeWrap, { left: rNodeLeft, top: nodeTop, width: nodeW }]}>
            <View
              style={[
                styles.nodeShadow,
                cardRadius,
                shadowInset,
                { width: nodeW, height: nodeH, backgroundColor: colors.cardShadow },
              ]}
            />
            <TouchableOpacity onPress={handlePress} activeOpacity={0.78}>
              <BeanNode bean={bean} c={colors} side={side} />
            </TouchableOpacity>
            {bean.isFavorite && (
              <View style={[styles.ladybugBadge, { top: lbTop, right: lbRight, transform: [{ rotate: `${lbRotation}deg` }] }]}>
                <LadybugMini />
              </View>
            )}
          </View>
        </>
      )}

      {side === 'left' && (
        <>
          {/* Branch arm */}
          <View
            style={[
              styles.branchLine,
              {
                right:           lBranchRight,
                width:           BRANCH_LEN,
                top:             midY - 3,
                backgroundColor: colors.trunk,
                borderTopWidth:  1.5,
                borderBottomWidth: 1.5,
                borderTopColor:  colors.cardOutline,
                borderBottomColor: colors.cardOutline,
              },
            ]}
          />

          {/* Card wrapper: flat shadow behind, card in front */}
          <View style={[styles.nodeWrap, { right: lNodeRight, top: nodeTop, width: nodeW }]}>
            <View
              style={[
                styles.nodeShadow,
                cardRadius,
                shadowInset,
                { width: nodeW, height: nodeH, backgroundColor: colors.cardShadow },
              ]}
            />
            <TouchableOpacity onPress={handlePress} activeOpacity={0.78}>
              <BeanNode bean={bean} c={colors} side={side} />
            </TouchableOpacity>
            {bean.isFavorite && (
              <View style={[styles.ladybugBadge, { top: lbTop, right: lbRight, transform: [{ rotate: `${lbRotation}deg` }] }]}>
                <LadybugMini />
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
});

// ─── Stardust Layer (cosmic biome) ────────────────────────────────────────────

// Deterministic star positions (percentages of the canvas) — no RNG so the
// field is stable across renders.
const STARS: { leftPct: number; topPct: number; size: number; opacity: number }[] = [
  { leftPct: 12, topPct:  8, size: 2, opacity: 0.7 },
  { leftPct: 78, topPct: 14, size: 3, opacity: 0.5 },
  { leftPct: 34, topPct: 22, size: 2, opacity: 0.9 },
  { leftPct: 88, topPct: 31, size: 2, opacity: 0.6 },
  { leftPct: 22, topPct: 39, size: 3, opacity: 0.7 },
  { leftPct: 64, topPct: 45, size: 2, opacity: 0.5 },
  { leftPct:  8, topPct: 55, size: 2, opacity: 0.8 },
  { leftPct: 92, topPct: 60, size: 2, opacity: 0.6 },
  { leftPct: 47, topPct: 66, size: 3, opacity: 0.9 },
  { leftPct: 72, topPct: 73, size: 2, opacity: 0.6 },
  { leftPct: 18, topPct: 80, size: 2, opacity: 0.7 },
  { leftPct: 56, topPct: 86, size: 3, opacity: 0.5 },
  { leftPct: 84, topPct: 91, size: 2, opacity: 0.8 },
  { leftPct: 30, topPct: 95, size: 2, opacity: 0.6 },
];

function StardustLayer({ color }: { color: string }) {
  const twinkle = useSharedValue(0.5);

  useEffect(() => {
    twinkle.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600 }),
        withTiming(0.45, { duration: 1600 })
      ),
      -1,
      true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layerStyle = useAnimatedStyle(() => ({ opacity: twinkle.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, layerStyle]} pointerEvents="none">
      {STARS.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (s.leftPct / 100) * SCREEN_WIDTH,
            top: (s.topPct / 100) * SCREEN_HEIGHT,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: color,
            opacity: s.opacity,
          }}
        />
      ))}
    </Animated.View>
  );
}

// ─── Seed Placeholder (empty state) ──────────────────────────────────────────

function SeedPlaceholder({ c }: { c: VineColors }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.10, { duration: 1400 }),
        withTiming(1.00, { duration: 1400 })
      ),
      -1,
      true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={seedStyles.root}>
      <Animated.View style={[seedStyles.seedWrap, pulseStyle]}>
        <View style={[seedStyles.seedOval, { backgroundColor: c.accent }]} />
        <View style={[seedStyles.stemLine, { backgroundColor: c.leafBorder }]} />
        <View style={[seedStyles.leafRowLeft, { backgroundColor: c.flowerBorder }]} />
        <View style={[seedStyles.leafRowRight, { backgroundColor: c.leafBorder }]} />
      </Animated.View>

      <Text style={[seedStyles.title, { color: c.textPrimary }]}>Plant your first bean</Text>
      <Text style={[seedStyles.subtitle, { color: c.textSecondary }]}>
        Swipe up to open the capture dial{'\n'}and begin your garden.
      </Text>
    </View>
  );
}

// ─── Clouds Indicator & Vine Base ─────────────────────────────────────────────

function CloudsIndicator({ c }: { c: VineColors }) {
  return (
    <View style={styles.cloudsWrap} pointerEvents="none">
      <Text style={[styles.cloudsText, { color: c.textSecondary }]}>☁  ☁ ☁</Text>
      <Text style={[styles.cloudsLabel, { color: c.textSecondary }]}>past entries above</Text>
    </View>
  );
}

function VineBase({ c }: { c: VineColors }) {
  return (
    <View style={styles.vineBase}>
      <View style={[styles.baseGlow, { backgroundColor: `${c.accent}26` }]} />
      <View style={[styles.baseDot, { backgroundColor: c.accent, borderColor: c.cardOutline }]} />
    </View>
  );
}

// ─── HistoryVine ──────────────────────────────────────────────────────────────

interface HistoryVineProps {
  beans: Bean[];
  loading: boolean;
  biome: BiomeConfig;
  onPressBean?: (bean: Bean) => void;
}

export default function HistoryVine({ beans, loading, biome, onPressBean }: HistoryVineProps) {
  const listRef = useRef<FlatList<VineItem>>(null);
  // Tracks the user's current scroll position so we only auto-snap to the
  // newest entry when they're already near the bottom (offset 0 in an inverted
  // list). Deep-history reads are left undisturbed by background inserts.
  const scrollOffsetRef = useRef(0);

  // Re-derived only when the biome changes → a theme switch re-renders all rows.
  const colors = useMemo(() => makeColors(biome), [biome]);

  const vineItems = useMemo<VineItem[]>(
    () =>
      [...beans]
        .reverse()
        .map((bean, displayIdx) => ({
          bean,
          stableIndex: beans.length - 1 - displayIdx,
        })),
    [beans]
  );

  const itemOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const item of vineItems) {
      offsets.push(acc);
      acc += ROW_H[item.bean.type];
    }
    return offsets;
  }, [vineItems]);

  const getItemLayout = useCallback(
    (_: ArrayLike<VineItem> | null | undefined, index: number) => ({
      length: ROW_H[vineItems[index]?.bean.type ?? 'type'],
      offset: itemOffsets[index] ?? 0,
      index,
    }),
    [vineItems, itemOffsets]
  );

  const keyExtractor = useCallback((item: VineItem) => item.bean.id, []);

  const handlePressBean = useCallback(
    (bean: Bean) => { onPressBean?.(bean); },
    [onPressBean]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<VineItem>) => (
      <VineRow item={item} colors={colors} onPress={handlePressBean} />
    ),
    [colors, handlePressBean]
  );

  useEffect(() => {
    if (vineItems.length > 0 && scrollOffsetRef.current <= 100) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [vineItems.length]);

  // Themed canvas wraps every state (loading / empty / populated).
  const canvasStyle = [styles.canvas, { backgroundColor: colors.canvas }];

  if (loading) {
    return <View style={canvasStyle} />;
  }

  if (beans.length === 0) {
    return (
      <View style={canvasStyle}>
        {biome.visuals.particles && <StardustLayer color={colors.accent} />}
        <SeedPlaceholder c={colors} />
      </View>
    );
  }

  return (
    <View style={canvasStyle}>
      {biome.visuals.particles && <StardustLayer color={colors.accent} />}
      <FlatList
        ref={listRef}
        data={vineItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        inverted
        ListHeaderComponent={<VineBase c={colors} />}
        ListFooterComponent={<CloudsIndicator c={colors} />}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={9}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      />
    </View>
  );
}

// ─── Node Styles (layout + cartoon border — radius applied inline per side) ────

const nodeStyles = StyleSheet.create({
  // ── Leaf / Note ───────────────────────────────────────────────────────────────
  leaf: {
    width:            NODE_W.type,
    height:           NODE_H.type,
    // border-radius applied inline via podRadius(side)
    borderWidth:      3,
    // borderColor applied inline from c.cardOutline
    paddingHorizontal: 10,
    paddingTop:       8,
    paddingBottom:    12,
    justifyContent:   'space-between',
  },
  leafText: {
    fontSize:   12,
    lineHeight: 17,
    fontWeight: '300',
  },
  leafFooter: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  leafDate: {
    fontSize:   10,
    fontWeight: '500',
  },
  leafSep: {
    fontSize:   10,
    fontWeight: '400',
  },
  leafTitle: {
    fontSize:   11,
    fontWeight: '800',
  },

  // ── Photo ─────────────────────────────────────────────────────────────────────
  flower: {
    width:       NODE_W.photo,
    height:      NODE_H.photo,
    // border-radius applied inline per side
    borderWidth: 3,
    // borderColor applied inline
    // overflow is intentionally NOT set here — keeping it 'visible' (the default)
    // ensures the 3px border stroke is composited without being clipped at corners.
  },
  // Separate inner container that carries overflow:hidden so the image clips to
  // the rounded shape without interfering with the outer border geometry.
  flowerClip: {
    width:    '100%',
    flex:     1,
    overflow: 'hidden',
  },
  flowerImage: {
    width: '100%',
    flex:  1,
  },
  flowerPlaceholder: {
    width:          '100%',
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  flowerIcon: {
    fontSize: 32,
  },
  flowerFooter: {
    width:            '100%',
    paddingBottom:    14,
    paddingHorizontal: 12,
    alignItems:       'center',
  },
  flowerDate: {
    fontSize:   10,
    fontWeight: '500',
    marginTop:  4,
    textAlign:  'center',
  },

  // ── Voice ─────────────────────────────────────────────────────────────────────
  fruit: {
    width:            NODE_W.voice,
    height:           NODE_H.voice,
    // border-radius applied inline
    borderWidth:      3,
    // borderColor applied inline
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 14,
    gap:              8,
  },
  fruitDot: {
    width:        12,
    height:       12,
    borderRadius: 6,
  },
  fruitDuration: {
    fontSize:    13,
    fontWeight:  '700',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  fruitDate: {
    flex:      1,
    fontSize:  10,
    textAlign: 'right',
  },

  // ── Scan ──────────────────────────────────────────────────────────────────────
  root: {
    width:             NODE_W.scan,
    height:            NODE_H.scan,
    // border-radius applied inline
    borderWidth:       3,
    // borderColor applied inline
    paddingHorizontal: 12,
    paddingVertical:   6,
    justifyContent:    'space-between',
  },
  rootLabel: {
    fontSize:     10,
    fontWeight:   '700',
    letterSpacing: 1.5,
  },
  rootText: {
    fontSize:   11,
    fontWeight: '300',
  },
  rootDate: {
    fontSize:   9,
    fontWeight: '400',
  },
});

// ─── Vine Layout Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 16,
  },

  vineRow: {
    width: SCREEN_WIDTH,
    position: 'relative',
  },
  trunkLine: {
    position: 'absolute',
    top: 0,
    // borderLeft/Right applied inline for cartoon outline
  },
  knot: {
    position: 'absolute',
    width:        KNOT_D,
    height:       KNOT_D,
    borderRadius: KNOT_D / 2,
    // borderWidth + borderColor applied inline
  },
  branchLine: {
    position: 'absolute',
    height:   6,
    // borderTop/Bottom applied inline for cartoon outline
  },
  nodeShadow: {
    position: 'absolute',
    // top/left offset, width, height, backgroundColor applied inline
  },
  nodeWrap: {
    position: 'absolute',
  },
  ladybugBadge: {
    position: 'absolute',
    zIndex: 10,
  },

  vineBase: {
    height:         72,
    alignItems:     'center',
    justifyContent: 'flex-end',
    paddingBottom:  10,
  },
  baseGlow: {
    position:     'absolute',
    bottom:       8,
    width:        44,
    height:       44,
    borderRadius: 22,
  },
  baseDot: {
    width:        22,
    height:       22,
    borderRadius: 11,
    marginBottom: 4,
    borderWidth:  3,
    // borderColor set inline from cardOutline
  },

  cloudsWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 6,
  },
  cloudsText: {
    fontSize: 24,
    letterSpacing: 6,
    opacity: 0.5,
  },
  cloudsLabel: {
    fontSize: 11,
    letterSpacing: 1,
    opacity: 0.4,
  },
});

// ─── Ladybug Icon & Toggle (inspect sheet) ───────────────────────────────────

interface LadybugIconProps {
  active: boolean;
  outlineColor: string;
  /** Diameter of the body circle in dp. Defaults to 20. */
  bodySize?: number;
}

/**
 * Scalable cartoon ladybug drawn entirely with Views.
 * All internal measurements are derived from `bodySize` so the geometry is
 * always perfectly centred regardless of size.
 *
 * Layout (top → bottom):
 *   • head  — small dark circle, centred horizontally, half-overlapping body top
 *   • body  — bright-red circle (overflow:hidden clips divider + spots to the disc)
 *     ├── divider — 1-2px line through the exact horizontal midpoint
 *     └── 4 spots — symmetric pairs in upper/lower halves
 */
function LadybugIcon({ active, outlineColor, bodySize = 20 }: LadybugIconProps) {
  // ── Derived dimensions (all from bodySize) ────────────────────────────────
  const border  = Math.max(1.5, Math.round(bodySize * 0.1));
  const headD   = Math.round(bodySize * 0.42);       // e.g. 8 for size=20
  const spotD   = Math.max(3, Math.round(bodySize * 0.22));
  const divW    = Math.max(1.5, Math.round(bodySize * 0.09));
  const innerW  = bodySize - border * 2;             // inner padding-box width
  const protrude = Math.ceil(headD / 2);             // px the head sticks above body

  // Divider: centred in the inner box
  const divLeft = (innerW - divW) / 2;
  // Spots: inset from inner edge
  const sp      = Math.max(1, Math.round(innerW * 0.12));

  // ── Colours ───────────────────────────────────────────────────────────────
  const bodyBg  = active ? '#E53935' : 'transparent';
  const spotBg  = active ? '#1a0000' : 'transparent';
  const divBg   = active ? '#1a0000' : outlineColor;
  const headBg  = active ? '#1a0000' : outlineColor;
  const borderC = active ? '#1a0000' : outlineColor;

  return (
    // Outer container sized to accommodate the protruding head
    <View style={{ width: bodySize, height: bodySize + protrude }}>

      {/* Body — overflow:hidden clips the divider and spots to the disc */}
      <View style={{
        position: 'absolute',
        bottom: 0, left: 0,
        width: bodySize, height: bodySize,
        borderRadius: bodySize / 2,
        backgroundColor: bodyBg,
        borderWidth: border,
        borderColor: borderC,
        overflow: 'hidden',
      }}>
        {/* Vertical wing divider — passes through exact centre */}
        <View style={{
          position: 'absolute', top: 0, bottom: 0,
          left: divLeft, width: divW,
          backgroundColor: divBg,
        }} />
        {/* Spot — upper-left */}
        <View style={{ position: 'absolute', top: sp, left: sp, width: spotD, height: spotD, borderRadius: spotD / 2, backgroundColor: spotBg }} />
        {/* Spot — upper-right */}
        <View style={{ position: 'absolute', top: sp, right: sp, width: spotD, height: spotD, borderRadius: spotD / 2, backgroundColor: spotBg }} />
        {/* Spot — lower-left */}
        <View style={{ position: 'absolute', bottom: sp, left: sp, width: spotD, height: spotD, borderRadius: spotD / 2, backgroundColor: spotBg }} />
        {/* Spot — lower-right */}
        <View style={{ position: 'absolute', bottom: sp, right: sp, width: spotD, height: spotD, borderRadius: spotD / 2, backgroundColor: spotBg }} />
      </View>

      {/* Head — sibling so it sits above the body's overflow:hidden boundary */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: (bodySize - headD) / 2,
        width: headD, height: headD,
        borderRadius: headD / 2,
        backgroundColor: headBg,
        zIndex: 2,
      }} />
    </View>
  );
}

// ---

interface LadybugToggleProps { active: boolean; onToggle: () => void; outlineColor: string }

const LB_BTN = 34;
const LB_SHD = 3;

function LadybugToggle({ active, onToggle, outlineColor }: LadybugToggleProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.3, { damping: 6, stiffness: 400 }),
      withSpring(1.0, { damping: 10, stiffness: 300 }),
    );
    onToggle();
  };

  return (
    <TouchableOpacity onPress={handlePress} hitSlop={10} activeOpacity={0.85}>
      <Animated.View style={[lbToggleStyles.wrap, animStyle]}>
        <View
          style={[
            lbToggleStyles.shadow,
            { backgroundColor: active ? 'rgba(229,57,53,0.30)' : 'transparent' },
          ]}
        />
        <View
          style={[
            lbToggleStyles.btn,
            {
              borderColor: active ? '#E53935' : `${outlineColor}55`,
              backgroundColor: active ? 'rgba(229,57,53,0.08)' : 'transparent',
            },
          ]}
        >
          <LadybugIcon active={active} outlineColor={active ? '#E53935' : outlineColor} bodySize={18} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const lbToggleStyles = StyleSheet.create({
  wrap: {
    width: LB_BTN + LB_SHD,
    height: LB_BTN + LB_SHD,
  },
  shadow: {
    position: 'absolute',
    top: LB_SHD,
    left: LB_SHD,
    width: LB_BTN,
    height: LB_BTN,
    borderRadius: LB_BTN / 2,
  },
  btn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LB_BTN,
    height: LB_BTN,
    borderRadius: LB_BTN / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Entry Inspect Sheet ──────────────────────────────────────────────────────

const TYPE_DISPLAY: Record<BeanType, string> = {
  type:  'NOTE',
  photo: 'PHOTO',
  voice: 'VOICE',
  scan:  'SCAN',
};

// ─── Voice Player Widget ──────────────────────────────────────────────────────

interface VoicePlayerWidgetProps {
  uri: string;
  fallbackDuration: number | undefined;
  c: VineColors;
}

function VoicePlayerWidget({ uri, fallbackDuration, c }: VoicePlayerWidgetProps) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const [barWidth, setBarWidth] = useState(0);

  const currentTime = status.currentTime ?? 0;
  // duration from the player; fall back to the stored value while loading
  const duration = status.duration > 0 ? status.duration : (fallbackDuration ?? 0);
  const progress  = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const handlePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleSeek = (e: { nativeEvent: { locationX: number } }) => {
    if (!barWidth || !duration) return;
    const ratio = e.nativeEvent.locationX / barWidth;
    void player.seekTo(Math.max(0, Math.min(duration, ratio * duration)));
  };

  return (
    <View style={playerStyles.root}>
      {/* Play / Pause button */}
      <TouchableOpacity
        style={[playerStyles.playBtn, { borderColor: `${c.fruitBorder}55` }]}
        onPress={handlePlayPause}
        activeOpacity={0.8}
      >
        {status.playing ? (
          <View style={playerStyles.pauseWrap}>
            <View style={[playerStyles.pauseBar, { backgroundColor: c.fruitBorder }]} />
            <View style={[playerStyles.pauseBar, { backgroundColor: c.fruitBorder }]} />
          </View>
        ) : (
          // Solid triangle drawn with border trick
          <View style={[playerStyles.playTriangle, { borderLeftColor: c.fruitBorder }]} />
        )}
      </TouchableOpacity>

      {/* Scrub track */}
      <TouchableOpacity
        style={[playerStyles.track, { backgroundColor: `${c.fruitBorder}20` }]}
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={handleSeek}
        activeOpacity={1}
      >
        {/* Fill */}
        <View
          style={[
            playerStyles.fill,
            { width: `${progress * 100}%`, backgroundColor: c.fruitBorder },
          ]}
        />
        {/* Scrub knob — absolutely positioned based on measured bar width */}
        {barWidth > 0 && (
          <View
            style={[
              playerStyles.knob,
              {
                left: progress * barWidth - playerStyles.knob.width / 2,
                backgroundColor: c.fruitBorder,
              },
            ]}
          />
        )}
      </TouchableOpacity>

      {/* Time labels */}
      <View style={playerStyles.timeRow}>
        <Text style={[playerStyles.timeText, { color: c.textSecondary }]}>
          {fmtDuration(Math.floor(currentTime))}
        </Text>
        <Text style={[playerStyles.timeText, { color: c.textSecondary }]}>
          {fmtDuration(Math.floor(duration))}
        </Text>
      </View>
    </View>
  );
}

const KNOB_SIZE = 14;

const playerStyles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 22,
    width: '100%',
  },

  // ── Play / Pause ─────────────────────────────────────────────────────────────
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 22,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 4,
  },
  pauseWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  pauseBar: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },

  // ── Scrub track ──────────────────────────────────────────────────────────────
  track: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'visible',
    justifyContent: 'center',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    top: -(KNOB_SIZE / 2 - 2),
  },

  // ── Times ────────────────────────────────────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timeText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    letterSpacing: 0.5,
  },
});

// ─── Bean Inspect Body ────────────────────────────────────────────────────────

function BeanInspectBody({ bean, c }: { bean: Bean; c: VineColors }) {
  switch (bean.type) {
    case 'type':
      return (
        <Text style={[inspectStyles.bodyText, { color: c.textPrimary }]}>
          {bean.textContent ?? ''}
        </Text>
      );
    case 'photo':
      return bean.imageUri ? (
        <Image
          source={{ uri: bean.imageUri }}
          style={inspectStyles.fullImage}
          resizeMode="contain"
        />
      ) : (
        <Text style={[inspectStyles.emptyHint, { color: c.textSecondary }]}>No image captured.</Text>
      );
    case 'voice':
      if (!bean.audioUri) {
        return (
          <View style={inspectStyles.voiceCenter}>
            <Text style={[inspectStyles.voiceDuration, { color: c.textPrimary }]}>
              {fmtDuration(bean.audioDurationSeconds)}
            </Text>
            <Text style={[inspectStyles.voiceHint, { color: c.textSecondary }]}>
              Audio file unavailable
            </Text>
          </View>
        );
      }
      return (
        <VoicePlayerWidget
          uri={bean.audioUri}
          fallbackDuration={bean.audioDurationSeconds}
          c={c}
        />
      );
    case 'scan':
      return (
        <>
          {bean.scanThumbnailUri && (
            <Image
              source={{ uri: bean.scanThumbnailUri }}
              style={inspectStyles.scanThumb}
              resizeMode="contain"
            />
          )}
          {bean.scannedText ? (
            <Text style={[inspectStyles.bodyText, { color: c.textPrimary }]}>
              {bean.scannedText}
            </Text>
          ) : (
            <Text style={[inspectStyles.emptyHint, { color: c.textSecondary }]}>OCR pending…</Text>
          )}
        </>
      );
  }
}

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

function SemanticAnalytics({ bean, c }: { bean: Bean; c: VineColors }) {
  // `== null` catches both null (DB) and undefined (in-memory unclassified).
  const hasAi = bean.aiSentiment != null;
  const willClassify =
    !!(bean.textContent || bean.scannedText || bean.transcription) || bean.type === 'voice';

  // Media-only entries (e.g. a photo with no caption) are never classified —
  // render nothing rather than an eternal shimmer.
  if (!hasAi && !willClassify) return null;

  // Pending: fresh entry awaiting on-device inference or a transcription.
  if (!hasAi) return <AnalyzingSkeleton c={c} />;

  const aiTags = bean.aiTags ?? [];

  return (
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
}

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
    maxWidth: '46%',
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

export interface EntryInspectSheetProps {
  bean: Bean | null;
  biome: BiomeConfig;
  onClose: () => void;
  onUpdate?: (id: string, patch: Partial<Pick<Bean, 'title' | 'isFavorite'>>) => Promise<void>;
}

export function EntryInspectSheet({ bean, biome, onClose, onUpdate }: EntryInspectSheetProps) {
  const c = useMemo(() => makeColors(biome), [biome]);

  // All hooks must be declared before any conditional return.
  const [isFavorite, setIsFavorite] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Sync local state whenever a different bean is opened.
  useEffect(() => {
    if (bean) {
      setIsFavorite(bean.isFavorite ?? false);
      setTitleDraft(bean.title ?? '');
      setEditingTitle(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bean?.id]);

  if (!bean) return null;

  const typeAccent: Record<BeanType, string> = {
    type:  c.leafBorder,
    photo: c.flowerBorder,
    voice: c.fruitBorder,
    scan:  c.rootBorder,
  };
  const accentColor = typeAccent[bean.type];

  const handleFavToggle = async () => {
    const next = !isFavorite;
    setIsFavorite(next);
    await onUpdate?.(bean.id, { isFavorite: next });
  };

  const handleTitleSave = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim() || undefined;
    if (trimmed !== bean.title) {
      await onUpdate?.(bean.id, { title: trimmed });
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={[StyleSheet.absoluteFill, inspectStyles.backdrop]}
      pointerEvents="box-none"
    >
      {/* Tap outside card to dismiss */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        activeOpacity={1}
      />

      {/* Card — rendered after backdrop touchable so its area wins hit-testing */}
      <Animated.View
        entering={ZoomIn.duration(220).easing(Easing.out(Easing.cubic))}
        exiting={ZoomOut.duration(160).easing(Easing.in(Easing.cubic))}
        style={[
          inspectStyles.card,
          { backgroundColor: c.nodeSurface, borderTopColor: accentColor },
        ]}
      >
        {/* Header row */}
        <View style={[inspectStyles.header, { borderBottomColor: `${c.textSecondary}28` }]}>
          <View style={[inspectStyles.typeBadge, { borderColor: accentColor }]}>
            <Text style={[inspectStyles.typeLabel, { color: accentColor }]}>
              {TYPE_DISPLAY[bean.type]}
            </Text>
          </View>

          {/* Title area — tap to edit inline */}
          {editingTitle ? (
            <TextInput
              style={[
                inspectStyles.titleInput,
                { color: c.textPrimary, borderColor: `${accentColor}55` },
              ]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              maxLength={25}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleTitleSave}
              onBlur={handleTitleSave}
              autoCapitalize="words"
            />
          ) : (
            <TouchableOpacity
              style={{ flex: 1, minHeight: 20, justifyContent: 'center' }}
              onPress={() => { setEditingTitle(true); setTitleDraft(bean.title ?? ''); }}
              activeOpacity={0.7}
            >
              <Text
                style={[inspectStyles.dateText, { color: c.textSecondary }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {fmtDate(bean.createdAt)}
                {bean.title
                  ? <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{` · ${bean.title}`}</Text>
                  : <Text style={{ color: `${c.textSecondary}55`, fontStyle: 'italic' }}> · tap to name…</Text>
                }
              </Text>
            </TouchableOpacity>
          )}

          <LadybugToggle
            active={isFavorite}
            onToggle={handleFavToggle}
            outlineColor={c.textSecondary}
          />

          <TouchableOpacity onPress={onClose} hitSlop={14}>
            <Text style={[inspectStyles.closeIcon, { color: c.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={inspectStyles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <BeanInspectBody bean={bean} c={c} />
          <SemanticAnalytics bean={bean} c={c} />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const inspectStyles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.60)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: SCREEN_HEIGHT * 0.13,
    maxHeight: SCREEN_HEIGHT * 0.72,
    borderRadius: 18,
    borderTopWidth: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 12,
    includeFontPadding: false,
  },
  dateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 17,
    includeFontPadding: false,
  },
  titleInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 17,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  closeIcon: {
    fontSize: 17,
    fontWeight: '300',
    lineHeight: 20,
    includeFontPadding: false,
  },
  bodyContent: {
    padding: 20,
    paddingBottom: 32,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 27,
    fontWeight: '300',
    letterSpacing: 0.1,
  },
  fullImage: {
    width: '100%',
    height: 300,
    borderRadius: 10,
  },
  scanThumb: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 16,
  },
  voiceCenter: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  voiceDuration: {
    fontSize: 38,
    fontWeight: '200',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  voiceHint: {
    fontSize: 13,
    letterSpacing: 0.5,
  },
  emptyHint: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24,
  },
});

// ─── Seed Placeholder Styles ─────────────────────────────────────────────────

const seedStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    gap: 20,
  },
  seedWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  seedOval: {
    position: 'absolute',
    bottom: 0,
    width: 28,
    height: 36,
    borderRadius: 14,
  },
  stemLine: {
    position: 'absolute',
    bottom: 34,
    width: 2,
    height: 28,
    left: 39,
  },
  leafRowLeft: {
    position: 'absolute',
    bottom: 50,
    left: 25,
    width: 16,
    height: 10,
    borderRadius: 8,
    transform: [{ rotate: '-30deg' }],
  },
  leafRowRight: {
    position: 'absolute',
    bottom: 56,
    left: 41,
    width: 16,
    height: 10,
    borderRadius: 8,
    transform: [{ rotate: '30deg' }],
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
