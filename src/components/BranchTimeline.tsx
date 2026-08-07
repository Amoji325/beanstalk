import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  fmtDate,
  fmtDuration,
  LadybugIcon,
  makeColors,
  truncate,
  type VineColors,
} from '@src/components/HistoryVine';
import { computeBranchTimeline } from '@src/screens/tree/branchTimelineLayout';
import type { BiomeConfig } from '@src/constants';
import type { Bean, BeanType } from '@src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const WOOD = '#6b4a2e';
const WOOD_DARK = '#553a24';
const STEM_H = 16;
const TWIG_W = 9;
const CARD_W = 152;
const CARD_H = 78;

const TYPE_LABEL: Record<BeanType, string> = { type: 'LEAF', photo: 'FLOWER', voice: 'FRUIT', scan: 'ROOT' };

function typeBorder(bean: Bean, c: VineColors): string {
  switch (bean.type) {
    case 'type': return c.leafBorder;
    case 'photo': return c.flowerBorder;
    case 'voice': return c.fruitBorder;
    case 'scan': return c.rootBorder;
  }
}

function previewText(bean: Bean): string {
  switch (bean.type) {
    case 'type': return truncate(bean.textContent, 46) || '(empty note)';
    case 'voice': return `Voice · ${fmtDuration(bean.audioDurationSeconds)}`;
    case 'scan': return truncate(bean.scannedText || bean.caption, 46) || 'Scanned page';
    case 'photo': return bean.caption ? truncate(bean.caption, 46) : 'Photo';
  }
}

// ─── A single memory leaf card ────────────────────────────────────────────────

function LeafCard({ bean, c, onPress }: { bean: Bean; c: VineColors; onPress: () => void }) {
  const border = typeBorder(bean, c);
  const thumb = bean.type === 'photo' ? (bean.imageUri ?? bean.thumbnailUri) : bean.type === 'scan' ? bean.scanThumbnailUri : undefined;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.nodeSurface, borderColor: border, shadowColor: c.cardShadow }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {bean.isFavorite && (
        <View style={styles.favBadge}>
          <LadybugIcon active outlineColor="#1a0000" bodySize={13} />
        </View>
      )}

      <View style={styles.cardHead}>
        <Text style={[styles.cardType, { color: border }]}>{TYPE_LABEL[bean.type]}</Text>
        <Text style={[styles.cardDate, { color: c.textSecondary }]}>{fmtDate(bean.createdAt)}</Text>
      </View>

      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.cardThumb} resizeMode="cover" />
      ) : (
        <Text style={[styles.cardBody, { color: c.textPrimary }]} numberOfLines={2}>
          {bean.title ? bean.title : previewText(bean)}
        </Text>
      )}

      {!!bean.title && thumb && (
        <Text style={[styles.cardTitleOnThumb, { color: c.textPrimary }]} numberOfLines={1}>{bean.title}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Branch Timeline ──────────────────────────────────────────────────────────

interface BranchTimelineProps {
  beans: Bean[];
  loading: boolean;
  biome: BiomeConfig;
  onPressBean?: (bean: Bean) => void;
}

export interface BranchTimelineHandle {
  scrollToBean: (beanId: string) => void;
}

const BranchTimeline = forwardRef<BranchTimelineHandle, BranchTimelineProps>(function BranchTimeline(
  { beans, loading, biome, onPressBean },
  ref,
) {
  const c = useMemo(() => makeColors(biome), [biome]);
  const scrollRef = useRef<ScrollView>(null);

  const layout = useMemo(
    () => computeBranchTimeline({ count: beans.length, height: SCREEN_HEIGHT }),
    [beans.length],
  );

  useImperativeHandle(ref, () => ({
    scrollToBean: (beanId: string) => {
      const idx = beans.findIndex((b) => b.id === beanId);
      if (idx < 0) return;
      const leaf = layout.leaves[idx];
      if (!leaf) return;
      const x = Math.max(0, Math.min(leaf.stemX - SCREEN_WIDTH / 2, layout.contentWidth - SCREEN_WIDTH));
      scrollRef.current?.scrollTo({ x, animated: true });
    },
  }), [beans, layout]);

  // Land on the newest memory (the branch tip) when the branch opens.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(t);
  }, [beans.length]);

  if (!loading && beans.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: c.canvas }]}>
        <View style={[styles.emptyLeafWrap, { backgroundColor: `${c.accent}1f` }]}>
          <View
            style={{
              width: 42,
              height: 42,
              backgroundColor: c.accent,
              borderTopLeftRadius: 42,
              borderBottomRightRadius: 42,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
            }}
          />
        </View>
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>
          This branch is bare.{'\n'}Swipe up to plant your first memory.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ backgroundColor: c.canvas }}
      contentContainerStyle={{ width: layout.contentWidth, height: SCREEN_HEIGHT }}
    >
      {/* Stem — a tapered wood branch along the baseline */}
      <View style={[styles.stemShadow, { left: layout.stemStartX, top: layout.baseY - STEM_H / 2 + 4, width: layout.stemEndX - layout.stemStartX }]} />
      <View style={[styles.stem, { left: layout.stemStartX, top: layout.baseY - STEM_H / 2, width: layout.stemEndX - layout.stemStartX }]} />
      {/* Thick base knuckle where the branch leaves the trunk */}
      <View style={[styles.stemBase, { left: layout.stemStartX - 6, top: layout.baseY - 15 }]} />

      {/* Twigs + memory leaves */}
      {layout.leaves.map((leaf, i) => {
        const bean = beans[i];
        if (!bean) return null;
        const up = leaf.side === 'up';
        const cardTop = leaf.y - CARD_H / 2;
        const twigTop = up ? cardTop + CARD_H - 6 : layout.baseY;
        const twigHeight = up ? layout.baseY - (cardTop + CARD_H - 6) : cardTop + 6 - layout.baseY;

        return (
          <React.Fragment key={bean.id}>
            <View
              style={[
                styles.twig,
                { left: leaf.stemX - TWIG_W / 2, top: Math.min(twigTop, twigTop + twigHeight), height: Math.abs(twigHeight) },
              ]}
            />
            <Animated.View
              entering={FadeIn.delay(Math.min(i, 12) * 30)}
              style={{ position: 'absolute', left: leaf.x - CARD_W / 2, top: cardTop }}
            >
              <LeafCard bean={bean} c={c} onPress={() => onPressBean?.(bean)} />
            </Animated.View>
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
});

export default BranchTimeline;

const styles = StyleSheet.create({
  stem: {
    position: 'absolute',
    height: STEM_H,
    borderRadius: STEM_H / 2,
    backgroundColor: WOOD,
  },
  stemShadow: {
    position: 'absolute',
    height: STEM_H,
    borderRadius: STEM_H / 2,
    backgroundColor: WOOD_DARK,
  },
  stemBase: {
    position: 'absolute',
    width: 34,
    height: 30,
    borderRadius: 16,
    backgroundColor: WOOD_DARK,
  },
  twig: {
    position: 'absolute',
    width: TWIG_W,
    borderRadius: TWIG_W / 2,
    backgroundColor: WOOD,
  },

  card: {
    width: CARD_W,
    minHeight: CARD_H,
    borderRadius: 16,
    borderWidth: 2.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 6,
  },
  favBadge: { position: 'absolute', top: -8, right: -6, zIndex: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardType: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  cardDate: { fontSize: 11, fontWeight: '500' },
  cardBody: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  cardThumb: { width: '100%', height: 40, borderRadius: 8, backgroundColor: '#0003' },
  cardTitleOnThumb: { fontSize: 12, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 40 },
  emptyLeafWrap: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
});
