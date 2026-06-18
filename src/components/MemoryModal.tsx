import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import type { Bean } from '@src/types';

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

// ─── Memory Body (type-aware) ─────────────────────────────────────────────────

function MemoryBody({ bean }: { bean: Bean }) {
  switch (bean.type) {
    case 'type':
      return (
        <Text style={styles.bodyText}>
          {bean.textContent || '(empty note)'}
        </Text>
      );

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
          <View style={styles.voicePlayButton}>
            <Text style={styles.voicePlayGlyph}>▶</Text>
          </View>
          <Text style={styles.voiceDuration}>{fmtDuration(bean.audioDurationSeconds)}</Text>
          {!!bean.transcription && (
            <Text style={styles.bodyText}>{bean.transcription}</Text>
          )}
        </View>
      );

    case 'scan':
      return (
        <Text style={styles.bodyText}>
          {bean.scannedText || bean.caption || '(scanned page)'}
        </Text>
      );
  }
}

// ─── Memory Modal ─────────────────────────────────────────────────────────────

interface MemoryModalProps {
  /** The memory to display. Null hides (and exit-animates) the modal. */
  bean: Bean | null;
  onClose: () => void;
}

/**
 * Animated overlay that scales up smoothly from the centre of the screen.
 * Renders nothing when `bean` is null; Reanimated runs the exit animation on
 * the conditional unmount.
 */
export default function MemoryModal({ bean, onClose }: MemoryModalProps) {
  if (!bean) return null;

  const meta = TYPE_META[bean.type];

  return (
    <Animated.View
      style={styles.backdrop}
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
    >
      {/* Tap outside the card to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <Animated.View
        style={styles.card}
        entering={ZoomIn.springify().damping(16).stiffness(180)}
        exiting={ZoomOut.duration(160)}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerGlyph}>{meta.glyph}</Text>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerLabel}>A {meta.label} from your past</Text>
            <Text style={styles.headerDate}>{fmtFullDate(bean.createdAt)}</Text>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <MemoryBody bean={bean} />
        </View>

        {/* Footer */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.closeLabel}>Let it fall</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4,10,5,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 100,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0e1f12',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.35)',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 18,
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
    fontSize: 30,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerLabel: {
    color: '#c8e6c9',
    fontSize: 15,
    fontWeight: '700',
  },
  headerDate: {
    color: '#5a8a5e',
    fontSize: 12,
  },

  // ── Body ────────────────────────────────────────────────────────────────────
  body: {
    minHeight: 60,
  },
  bodyText: {
    color: '#dcefdc',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '300',
  },
  bodyImage: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: '#0a1a0d',
  },
  bodyImagePlaceholder: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: '#0a1a0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderGlyph: {
    fontSize: 48,
    color: '#4caf50',
  },

  // ── Voice ───────────────────────────────────────────────────────────────────
  voiceWrap: {
    gap: 14,
    alignItems: 'flex-start',
  },
  voicePlayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayGlyph: {
    color: '#fff',
    fontSize: 18,
    marginLeft: 3,
  },
  voiceDuration: {
    color: '#a5d6a7',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },

  // ── Footer ──────────────────────────────────────────────────────────────────
  closeButton: {
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(76,175,80,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  closeLabel: {
    color: '#a5d6a7',
    fontSize: 14,
    fontWeight: '600',
  },
});
