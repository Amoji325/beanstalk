import React from 'react';
import { Dimensions, Keyboard, StyleSheet, Text } from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CAPTURE_MODES,
  MODE_LABELS,
  useCaptureMode,
} from '@src/context/CaptureContext';
import type { BiomeConfig } from '@src/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DIAL_HORIZONTAL_MARGIN = 24;
const TRACK_WIDTH = SCREEN_WIDTH - DIAL_HORIZONTAL_MARGIN * 2;
const CELL_WIDTH = TRACK_WIDTH / 4;
const THUMB_INSET = 3;
const THUMB_WIDTH = CELL_WIDTH - THUMB_INSET * 2;
const MAX_THUMB_X = CELL_WIDTH * 3; // mode index 3 is the rightmost

const SPRING = {
  damping: 22,
  stiffness: 260,
  mass: 0.7,
  overshootClamping: false,
  restDisplacementThreshold: 0.3,
  restSpeedThreshold: 0.3,
};

// ─── Mode Label ───────────────────────────────────────────────────────────────
// Defined as a sub-component so each instance has exactly one useAnimatedStyle call.

interface ModeLabelProps {
  label: string;
  index: number;
  thumbX: SharedValue<number>;
  labelColor: string;
}

function ModeLabel({ label, index, thumbX, labelColor }: ModeLabelProps) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(thumbX.value - index * CELL_WIDTH);
    // Full opacity when thumb is on this cell; dims to 0.35 at max distance
    const opacity = 1 - (distance / CELL_WIDTH) * 0.65;
    const scale = 1 - (distance / CELL_WIDTH) * 0.08;
    return {
      opacity: Math.max(0.35, Math.min(1, opacity)),
      transform: [{ scale: Math.max(0.9, Math.min(1, scale)) }],
    };
  });

  return (
    <Animated.Text style={[styles.modeLabel, { color: labelColor }, style]}>
      {label}
    </Animated.Text>
  );
}

// ─── Dial Slider ──────────────────────────────────────────────────────────────

interface DialSliderProps {
  biome: BiomeConfig;
}

export default function DialSlider({ biome }: DialSliderProps) {
  const { activeModeIndex, setActiveModeIndex } = useCaptureMode();

  // thumbX drives the sliding thumb pill.
  // Value = activeModeIndex * CELL_WIDTH at rest; live during drag.
  const thumbX = useSharedValue(activeModeIndex * CELL_WIDTH);
  const dragStartThumbX = useSharedValue(0);
  // Tracks the last index that fired haptic during a drag sweep.
  const lastHapticIndex = useSharedValue(activeModeIndex);

  const triggerHaptic = () => {
    Haptics.selectionAsync();
  };

  // Plain JS wrapper: runOnJS(Keyboard.dismiss) would force the worklet to
  // capture the native Keyboard object (not serializable to the UI runtime).
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const panGesture = Gesture.Pan()
    .minDistance(4)
    // Fail if the gesture goes vertical — keeps Soil dismiss gesture intact.
    .failOffsetY([-10, 10])
    .onBegin(() => {
      'worklet';
      dragStartThumbX.value = thumbX.value;
      // Switching entry modes should never fight the keyboard — hide it the
      // moment the user starts sweeping the dial.
      runOnJS(dismissKeyboard)();
    })
    .onUpdate((e) => {
      'worklet';
      const raw = dragStartThumbX.value + e.translationX;
      const clamped = Math.min(MAX_THUMB_X, Math.max(0, raw));
      thumbX.value = clamped;

      // Fire a light haptic each time the thumb crosses into a new cell.
      const nearestIdx = Math.round(clamped / CELL_WIDTH);
      if (nearestIdx !== lastHapticIndex.value) {
        lastHapticIndex.value = nearestIdx;
        runOnJS(triggerHaptic)();
      }
    })
    .onEnd(() => {
      'worklet';
      const snapIndex = Math.min(3, Math.max(0, Math.round(thumbX.value / CELL_WIDTH)));
      thumbX.value = withSpring(snapIndex * CELL_WIDTH, SPRING);
      runOnJS(setActiveModeIndex)(snapIndex);
    });

  // Tap any mode label to jump directly to that cell.
  const tapGesture = Gesture.Tap()
    .maxDuration(350)
    .onEnd((e) => {
      'worklet';
      const tappedIdx = Math.min(3, Math.max(0, Math.floor(e.x / CELL_WIDTH)));
      thumbX.value = withSpring(tappedIdx * CELL_WIDTH, SPRING);
      lastHapticIndex.value = tappedIdx;
      runOnJS(setActiveModeIndex)(tappedIdx);
      runOnJS(triggerHaptic)();
      // Tapping a mode tab dismisses the keyboard so it can't obscure the tabs.
      runOnJS(dismissKeyboard)();
    });

  // Race: a quick tap resolves before pan can activate; a drag cancels the tap.
  const composedGesture = Gesture.Race(tapGesture, panGesture);

  const thumbAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  // Derive thumb color from the active biome accent at 75% opacity.
  const thumbColor = `${biome.palette.accentColor}BF`;
  // textPrimary is designed to be readable on the biome's background, so use it
  // for label text — avoids white-on-cream illegibility on light biomes like Cloud Village.
  const labelColor = biome.palette.textPrimary;
  // Track pill background: textPrimary at ~7% opacity creates a visible trough on any biome.
  const trackBg = `${biome.palette.textPrimary}12`;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.track, { backgroundColor: trackBg }]}>
        {/* Sliding thumb pill — tinted with the active biome accent */}
        <Animated.View style={[styles.thumb, thumbAnimStyle, { backgroundColor: thumbColor }]} />

        {/* Mode labels, one per cell */}
        {CAPTURE_MODES.map((mode, i) => (
          <ModeLabel
            key={mode}
            label={MODE_LABELS[mode]}
            index={i}
            thumbX={thumbX}
            labelColor={labelColor}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  track: {
    height: 44,
    marginHorizontal: DIAL_HORIZONTAL_MARGIN,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    left: THUMB_INSET,
    top: THUMB_INSET,
    bottom: THUMB_INSET,
    width: THUMB_WIDTH,
    borderRadius: 18,
    // backgroundColor applied inline from biome.palette.accentColor
  },
  modeLabel: {
    width: CELL_WIDTH,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    // color applied inline from biome.palette.textPrimary
  },
});
