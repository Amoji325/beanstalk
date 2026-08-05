import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { BiomeConfig } from '@src/constants';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DURATION_S = 300;
const MIN_DURATION_S = 0; // no minimum — any recording length can be planted
const PLANT_H = 52;
const SHADOW_OFF = 4;
const KNOB_R = 7;
const TITLE_MAX = 25;

const BAR_CONFIGS: [number, number, number][] = [
  [0.25, 0.80, 420],
  [0.30, 0.95, 340],
  [0.20, 1.00, 510],
  [0.30, 0.85, 370],
  [0.25, 0.75, 450],
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceBeanCaptureProps {
  stalkId: string;
  biome: BiomeConfig;
  onCapture?: (bean: Omit<Bean, 'id'>) => void;
}

type StagedVoice = { uri: string; durationSeconds: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Waveform Bar ─────────────────────────────────────────────────────────────

interface WaveBarProps {
  scaleY: SharedValue<number>;
  color: string;
}

function WaveBar({ scaleY, color }: WaveBarProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));
  return <Animated.View style={[styles.waveBar, style, { backgroundColor: color }]} />;
}

// ─── Audio Player Preview ─────────────────────────────────────────────────────

interface AudioPreviewProps {
  uri: string;
  durationSeconds: number;
  biome: BiomeConfig;
}

function AudioPreview({ uri, durationSeconds, biome }: AudioPreviewProps) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const [barWidth, setBarWidth] = useState(0);
  const { palette } = biome;

  const currentTime = status.currentTime ?? 0;
  const duration = status.duration > 0 ? status.duration : durationSeconds;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <View style={previewStyles.container}>
      <Text style={[previewStyles.hint, { color: palette.textSecondary }]}>
        Voice Note · {fmtTime(durationSeconds)}
      </Text>

      {/* Play / Pause */}
      <TouchableOpacity
        style={[previewStyles.playBtn, { borderColor: `${palette.accentColor}66` }]}
        onPress={() => (status.playing ? player.pause() : player.play())}
        activeOpacity={0.8}
      >
        {status.playing ? (
          <View style={previewStyles.pauseWrap}>
            <View style={[previewStyles.pauseBar, { backgroundColor: palette.accentColor }]} />
            <View style={[previewStyles.pauseBar, { backgroundColor: palette.accentColor }]} />
          </View>
        ) : (
          <View style={[previewStyles.playTriangle, { borderLeftColor: palette.accentColor }]} />
        )}
      </TouchableOpacity>

      {/* Scrub track */}
      <TouchableOpacity
        style={[previewStyles.track, { backgroundColor: `${palette.accentColor}22` }]}
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        onPress={e => {
          if (!barWidth || !duration) return;
          const ratio = e.nativeEvent.locationX / barWidth;
          void player.seekTo(Math.max(0, Math.min(duration, ratio * duration)));
        }}
        activeOpacity={1}
      >
        <View
          style={[
            previewStyles.fill,
            { width: `${progress * 100}%`, backgroundColor: palette.accentColor },
          ]}
        />
        {barWidth > 0 && (
          <View
            style={[
              previewStyles.knob,
              {
                left: progress * barWidth - KNOB_R,
                backgroundColor: palette.accentColor,
              },
            ]}
          />
        )}
      </TouchableOpacity>

      {/* Time labels */}
      <View style={previewStyles.timeRow}>
        <Text style={[previewStyles.timeText, { color: palette.textSecondary }]}>
          {fmtTime(Math.floor(currentTime))}
        </Text>
        <Text style={[previewStyles.timeText, { color: palette.textSecondary }]}>
          {fmtTime(Math.floor(duration))}
        </Text>
      </View>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 32,
    paddingHorizontal: 32,
  },
  hint: {
    fontSize: 13,
    letterSpacing: 0.8,
    fontWeight: '500',
  },
  playBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 14,
    borderBottomWidth: 14,
    borderLeftWidth: 24,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 5,
  },
  pauseWrap: {
    flexDirection: 'row',
    gap: 7,
  },
  pauseBar: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
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
    width: KNOB_R * 2,
    height: KNOB_R * 2,
    borderRadius: KNOB_R,
    top: -(KNOB_R - 2),
  },
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceBeanCapture({ stalkId, biome, onCapture }: VoiceBeanCaptureProps) {
  const { palette } = biome;
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [staged, setStaged] = useState<StagedVoice | null>(null);
  const [title, setTitle] = useState('');

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

  const elapsedSeconds = Math.floor(recorderState.durationMillis / 1000);

  const capturedUrlRef = useRef<string | null>(null);
  const capturedDurationRef = useRef<number>(0);

  useEffect(() => {
    if (recorderState.url) capturedUrlRef.current = recorderState.url;
    if (recorderState.durationMillis > 0) {
      capturedDurationRef.current = recorderState.durationMillis;
    }
  }, [recorderState.url, recorderState.durationMillis]);

  const bar0 = useSharedValue(BAR_CONFIGS[0][0]);
  const bar1 = useSharedValue(BAR_CONFIGS[1][0]);
  const bar2 = useSharedValue(BAR_CONFIGS[2][0]);
  const bar3 = useSharedValue(BAR_CONFIGS[3][0]);
  const bar4 = useSharedValue(BAR_CONFIGS[4][0]);
  const bars = [bar0, bar1, bar2, bar3, bar4];

  // ── Permissions ─────────────────────────────────────────────────────────────

  useEffect(() => {
    requestRecordingPermissionsAsync().then(({ granted }) => {
      setHasPermission(granted);
    });
  }, []);

  // ── Max-duration enforcement ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isRecording) return;
    const timeout = setTimeout(() => { stopRecording(); }, MAX_DURATION_S * 1000);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // ── Waveform animation ───────────────────────────────────────────────────────

  const startWaveform = () => {
    bars.forEach((bar, i) => {
      const [idle, peak, duration] = BAR_CONFIGS[i];
      bar.value = withRepeat(
        withSequence(
          withTiming(peak, { duration: duration / 2 }),
          withTiming(idle, { duration: duration / 2 })
        ),
        -1,
        true
      );
    });
  };

  const stopWaveform = () => {
    bars.forEach((bar, i) => {
      cancelAnimation(bar);
      bar.value = withTiming(BAR_CONFIGS[i][0], { duration: 250 });
    });
  };

  // ── Recording ────────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      capturedUrlRef.current = null;
      capturedDurationRef.current = 0;

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      startWaveform();
    } catch {
      // Permission revoked or hardware unavailable.
    }
  };

  const stopRecording = async () => {
    const snapshotDuration = capturedDurationRef.current || recorderState.durationMillis;

    try {
      await recorder.stop();
      // Leave recording mode but keep silent-switch playback on, so the staged
      // preview (and later timeline / shake) is audible without re-arming it.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      const postStatus = recorder.getStatus();
      const uri = postStatus.url ?? capturedUrlRef.current;
      const durationMs = postStatus.durationMillis > 0
        ? postStatus.durationMillis
        : snapshotDuration;

      setIsRecording(false);
      stopWaveform();

      const durationSeconds = Math.round(durationMs / 1000);
      if (uri && durationSeconds >= MIN_DURATION_S) {
        // Stage for review instead of saving immediately.
        setStaged({ uri, durationSeconds });
      }
    } catch {
      setIsRecording(false);
      stopWaveform();
    }
  };

  const handleToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ── Plant / Discard ──────────────────────────────────────────────────────────

  const handlePlant = () => {
    if (!staged) return;
    onCapture?.({
      stalkId,
      type: 'voice',
      anatomyRole: 'fruit',
      createdAt: Date.now(),
      audioUri: staged.uri,
      audioDurationSeconds: staged.durationSeconds,
      transcriptionStatus: 'pending',
      title: title.trim() || undefined,
    });
    setStaged(null);
    setTitle('');
  };

  // ── Render: preview mode ─────────────────────────────────────────────────────

  if (staged) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, styles.center, { backgroundColor: palette.backgroundEnd }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <AudioPreview
          uri={staged.uri}
          durationSeconds={staged.durationSeconds}
          biome={biome}
        />

        <View style={styles.actionBar}>
          {/* Title input */}
          <TextInput
            style={[
              styles.titleInput,
              {
                color: palette.textPrimary,
                borderColor: `${palette.textSecondary}44`,
                backgroundColor: `${palette.textPrimary}08`,
              },
            ]}
            placeholder="Name your bean..."
            placeholderTextColor={`${palette.accentColor}B3`}
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            returnKeyType="done"
            autoFocus={false}
            autoCapitalize="words"
          />

          {/* Plant Bean — cartoon outline + flat shadow */}
          <View style={styles.plantOuter}>
            <View
              style={[
                styles.plantShadow,
                { backgroundColor: `${palette.textPrimary}28` },
              ]}
            />
            <TouchableOpacity
              style={[
                styles.plantBtn,
                {
                  backgroundColor: palette.accentColor,
                  borderColor: `${palette.textPrimary}BB`,
                },
              ]}
              onPress={handlePlant}
              activeOpacity={0.85}
            >
              <Text style={styles.plantLabel}>Plant Bean</Text>
            </TouchableOpacity>
          </View>

          {/* Re-record */}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: `${palette.textSecondary}66` }]}
            onPress={() => { setStaged(null); setTitle(''); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>
              Re-record
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: permission denied ────────────────────────────────────────────────

  if (hasPermission === false) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: palette.backgroundEnd }]}>
        <Text style={[styles.permissionText, { color: palette.textSecondary }]}>
          Microphone access is required for voice notes.
        </Text>
      </View>
    );
  }

  // ── Render: recording UI ─────────────────────────────────────────────────────

  return (
    <View style={[styles.root, styles.center, { backgroundColor: palette.backgroundEnd }]}>
      <View style={styles.waveContainer}>
        {bars.map((bar, i) => (
          <WaveBar key={i} scaleY={bar} color={palette.accentColor} />
        ))}
      </View>

      <Text
        style={[
          styles.timer,
          { color: palette.textSecondary },
          isRecording && { color: palette.textPrimary },
        ]}
      >
        {fmtTime(elapsedSeconds)}
      </Text>

      <TouchableOpacity
        style={[
          styles.recordButton,
          { borderColor: `${palette.textSecondary}44` },
          isRecording && styles.recordButtonActive,
        ]}
        onPress={handleToggle}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.recordInner,
            { backgroundColor: palette.accentColor },
            isRecording && styles.recordInnerStop,
          ]}
        />
      </TouchableOpacity>

      <Text style={[styles.hint, { color: palette.textSecondary }]}>
        {isRecording ? 'Tap to finish' : 'Tap to record'}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const WAVE_BAR_HEIGHT = 60;
const WAVE_BAR_WIDTH = 5;
const WAVE_BAR_GAP = 6;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  permissionText: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // ── Waveform ──────────────────────────────────────────────────────────────
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: WAVE_BAR_HEIGHT,
    gap: WAVE_BAR_GAP,
  },
  waveBar: {
    width: WAVE_BAR_WIDTH,
    height: WAVE_BAR_HEIGHT,
    borderRadius: WAVE_BAR_WIDTH / 2,
  },

  // ── Timer ─────────────────────────────────────────────────────────────────
  timer: {
    fontSize: 32,
    fontWeight: '200',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },

  // ── Record Button ─────────────────────────────────────────────────────────
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonActive: {
    borderColor: '#ef5350',
  },
  recordInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  recordInnerStop: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ef5350',
  },

  // ── Hint ──────────────────────────────────────────────────────────────────
  hint: {
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // ── Action bar (shared preview footer) ────────────────────────────────────
  actionBar: {
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 8,
    gap: 12,
    alignItems: 'center',
  },
  titleInput: {
    width: '100%',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  plantOuter: {
    width: '100%',
    height: PLANT_H + SHADOW_OFF,
  },
  plantShadow: {
    position: 'absolute',
    top: SHADOW_OFF,
    left: SHADOW_OFF,
    right: 0,
    bottom: 0,
    borderRadius: PLANT_H / 2,
  },
  plantBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: SHADOW_OFF,
    height: PLANT_H,
    borderRadius: PLANT_H / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});
