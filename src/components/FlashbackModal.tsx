import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LadybugToggle } from '@src/components/HistoryVine';
import type { Bean } from '@src/types';
import type { BiomeConfig } from '@src/constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// The card begins fully above the viewport, then springs down into the centre.
const START_Y = -(SCREEN_HEIGHT / 2 + 320);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<Bean['type'], { label: string; glyph: string }> = {
  type:  { label: 'Leaf',   glyph: '🌿' },
  photo: { label: 'Flower', glyph: '🌸' },
  voice: { label: 'Fruit',  glyph: '🎧' },
  scan:  { label: 'Root',   glyph: '📜' },
};

function fmtDuration(seconds: number | undefined): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Type-aware body ──────────────────────────────────────────────────────────

function FlashbackBody({ bean, textColor }: { bean: Bean; textColor: string }) {
  switch (bean.type) {
    case 'type':
      return <Text style={[styles.bodyText, { color: textColor }]}>{bean.textContent || '(empty note)'}</Text>;

    case 'photo': {
      const uri = bean.imageUri ?? bean.thumbnailUri;
      return uri ? (
        <Image source={{ uri }} style={styles.bodyImage} resizeMode="cover" />
      ) : (
        <View style={styles.bodyImagePlaceholder}>
          <Text style={styles.placeholderGlyph}>⚘</Text>
        </View>
      );
    }

    case 'voice':
      return (
        <View style={styles.voiceWrap}>
          <Text style={[styles.voiceDuration, { color: textColor }]}>
            🎧 {fmtDuration(bean.audioDurationSeconds)}
          </Text>
          {!!bean.transcription && (
            <Text style={[styles.bodyText, { color: textColor }]}>{bean.transcription}</Text>
          )}
        </View>
      );

    case 'scan':
      return (
        <Text style={[styles.bodyText, { color: textColor }]}>
          {bean.scannedText || bean.caption || '(scanned page)'}
        </Text>
      );
  }
}

// ─── Flashback Modal ──────────────────────────────────────────────────────────

interface FlashbackModalProps {
  /** The recalled memory to display. Null hides the overlay. */
  bean: Bean | null;
  biome: BiomeConfig;
  /** Clears the overlay state in the parent. */
  onClose: () => void;
  /** Persists a favourite toggle (local SQLite + background Supabase sync). */
  onToggleFavorite: (bean: Bean, next: boolean) => void;
  /** Dismisses the overlay and scrolls the timeline to this bean. */
  onJumpToBean: (beanId: string) => void;
}

export default function FlashbackModal({
  bean,
  biome,
  onClose,
  onToggleFavorite,
  onJumpToBean,
}: FlashbackModalProps) {
  const { palette, nodeSurface } = biome;

  // Local favourite state so the ladybug reacts instantly; seeded per memory.
  const [isFavorite, setIsFavorite] = useState(false);

  const translateY = useSharedValue(START_Y);
  const opacity    = useSharedValue(0);

  // Drop the card in whenever a new memory arrives.
  useEffect(() => {
    if (bean) {
      setIsFavorite(bean.isFavorite ?? false);
      translateY.value = START_Y;
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, { damping: 12, stiffness: 150, mass: 0.9 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bean?.id]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!bean) return null;

  const meta = TYPE_META[bean.type];

  // Animate the card down and out, then clear parent state on completion.
  const animateOut = (after: () => void) => {
    opacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 260 }, (finished) => {
      if (finished) runOnJS(after)();
    });
  };

  const handleDismiss = () => animateOut(onClose);

  const handleFavToggle = () => {
    const next = !isFavorite;
    setIsFavorite(next);
    onToggleFavorite(bean, next);
  };

  const handleJump = () => animateOut(() => onJumpToBean(bean.id));

  return (
    <Animated.View style={[styles.backdrop, backdropStyle]}>
      {/* Tap the dim background to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

      <Animated.View
        style={[
          styles.card,
          { backgroundColor: nodeSurface, borderColor: `${palette.accentColor}59` },
          cardStyle,
        ]}
      >
        {/* Header: glyph + date, with an X dismiss */}
        <View style={styles.header}>
          <Text style={styles.headerGlyph}>{meta.glyph}</Text>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerLabel, { color: palette.textPrimary }]}>
              A {meta.label} from your past
            </Text>
            <Text style={[styles.headerDate, { color: palette.textSecondary }]}>
              {fmtFullDate(bean.createdAt)}
            </Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} hitSlop={12} activeOpacity={0.7}>
            <Text style={[styles.closeIcon, { color: palette.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <FlashbackBody bean={bean} textColor={palette.textPrimary} />
        </View>

        {/* Actions: ladybug favourite + jump to timeline */}
        <View style={styles.actions}>
          <LadybugToggle
            active={isFavorite}
            onToggle={handleFavToggle}
            outlineColor={palette.textSecondary}
          />
          <TouchableOpacity
            style={[styles.jumpButton, { borderColor: `${palette.accentColor}55`, backgroundColor: `${palette.accentColor}14` }]}
            onPress={handleJump}
            activeOpacity={0.85}
          >
            <Text style={[styles.jumpLabel, { color: palette.accentColor }]}>Jump to timeline →</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,10,5,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 120,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerGlyph: {
    fontSize: 28,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerDate: {
    fontSize: 12,
  },
  closeIcon: {
    fontSize: 17,
    fontWeight: '300',
    lineHeight: 20,
  },

  // ── Body ────────────────────────────────────────────────────────────────────
  body: {
    minHeight: 56,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '300',
  },
  bodyImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#0a1a0d',
  },
  bodyImagePlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#0a1a0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderGlyph: {
    fontSize: 48,
    color: '#4caf50',
  },
  voiceWrap: {
    gap: 12,
    alignItems: 'flex-start',
  },
  voiceDuration: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },

  // ── Actions ─────────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  jumpButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  jumpLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
