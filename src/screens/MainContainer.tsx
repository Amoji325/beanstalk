import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { CaptureProvider, useCaptureMode } from '@src/context/CaptureContext';
import { useStalk } from '@src/context/StalkContext';
import DialSlider from '@src/components/DialSlider';
import HistoryVine, { EntryInspectSheet, type HistoryVineHandle } from '@src/components/HistoryVine';
import MemoryModal from '@src/components/MemoryModal';
import FlashbackModal from '@src/components/FlashbackModal';
import StalkSwitcher from '@src/components/StalkSwitcher';
import ScanBeanCapture from '@src/components/capture/ScanBeanCapture';
import TypeBeanCapture from '@src/components/capture/TypeBeanCapture';
import VoiceBeanCapture from '@src/components/capture/VoiceBeanCapture';
import PhotoBeanCapture from '@src/components/capture/PhotoBeanCapture';
import { useAuth } from '@clerk/expo';
import { insertBean, updateBean, syncLocalBeanToCloud, fetchRandomPastBean } from '@src/database';
import { LocalAiEngine } from '@src/ai/pipeline';
import { useBeans } from '@src/hooks/useBeans';
import { useDeviceShake } from '@src/hooks/useDeviceShake';
import { useShakeMemory } from '@src/hooks/useShakeMemory';
import type { BiomeConfig } from '@src/constants';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 220,
  mass: 0.85,
  overshootClamping: false,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 0.4,
};

const COMMIT_THRESHOLD = SCREEN_HEIGHT * 0.25;
const COMMIT_VELOCITY  = 600;

// ─── AI background worker ─────────────────────────────────────────────────────
// Runs after insertBean resolves. Never awaited by the caller — the UI is
// already updated before this starts. On any failure the local row simply
// retains null ai_* fields; no user-visible side-effect occurs.

async function runAiClassification(saved: Bean, text: string, userId: string): Promise<void> {
  const result = await LocalAiEngine.classifyJournalText(text);
  await updateBean(saved.id, {
    aiSentiment:  result.sentiment,
    aiIntensity:  result.emotionalIndex,
    aiConfidence: result.confidence,
    aiTags:       result.tags,
  });
  // Re-sync the enriched record so Supabase receives the ai_* columns.
  syncLocalBeanToCloud(
    {
      ...saved,
      aiSentiment:  result.sentiment,
      aiIntensity:  result.emotionalIndex,
      aiConfidence: result.confidence,
      aiTags:       result.tags,
    },
    userId,
  );
}

// ─── Active Capture Panel ─────────────────────────────────────────────────────

interface ActiveCapturePanelProps {
  stalkId: string;
  biome: BiomeConfig;
  onCapture: (bean: Omit<Bean, 'id'>) => void;
}

function ActiveCapturePanel({ stalkId, biome, onCapture }: ActiveCapturePanelProps) {
  const { activeMode } = useCaptureMode();
  switch (activeMode) {
    case 'scan':  return <ScanBeanCapture  stalkId={stalkId} biome={biome} onCapture={onCapture} />;
    case 'type':  return <TypeBeanCapture  stalkId={stalkId} biome={biome} onCapture={onCapture} />;
    case 'voice': return <VoiceBeanCapture stalkId={stalkId} biome={biome} onCapture={onCapture} />;
    case 'photo': return <PhotoBeanCapture stalkId={stalkId} biome={biome} onCapture={onCapture} />;
  }
}

// ─── Soil Content ─────────────────────────────────────────────────────────────

interface SoilContentProps {
  stalkId: string;
  biome: BiomeConfig;
  chevronAnimStyle: ReturnType<typeof useAnimatedStyle>;
  onCapture: (bean: Omit<Bean, 'id'>) => void;
}

function SoilContent({ stalkId, biome, chevronAnimStyle, onCapture }: SoilContentProps) {
  return (
    <CaptureProvider>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.soilRoot, { backgroundColor: biome.palette.backgroundEnd }]}>
          <View style={styles.captureArea}>
            <ActiveCapturePanel stalkId={stalkId} biome={biome} onCapture={onCapture} />
          </View>

          <View style={styles.dialArea}>
            <DialSlider biome={biome} />
          </View>

          <Animated.View style={[styles.chevronContainer, chevronAnimStyle]} pointerEvents="none">
            <Text style={styles.chevronSymbol}>⌄</Text>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </CaptureProvider>
  );
}

// ─── Garden Layer ─────────────────────────────────────────────────────────────

interface GardenLayerProps {
  displayBeans: Bean[];
  loading: boolean;
  biome: BiomeConfig;
  onFabPress: () => void;
  onPressBean: (bean: Bean) => void;
  isSearchActive: boolean;
  isInspecting: boolean;
  searchQuery: string;
  onSearchToggle: () => void;
  onSearchChange: (q: string) => void;
  onFlashback: () => void;
  vineRef: React.Ref<HistoryVineHandle>;
}

function GardenLayer({
  displayBeans,
  loading,
  biome,
  onFabPress,
  onPressBean,
  isSearchActive,
  isInspecting,
  searchQuery,
  onSearchToggle,
  onSearchChange,
  onFlashback,
  vineRef,
}: GardenLayerProps) {
  const { palette, nodeSurface } = biome;
  const showEmpty = isSearchActive && searchQuery.trim().length > 0 && displayBeans.length === 0;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.backgroundEnd }]}>
      {/* Vine or empty-search state */}
      {showEmpty ? (
        <View style={styles.searchEmpty}>
          <Text style={styles.searchEmptyEmoji}>🌱</Text>
          <Text style={[styles.searchEmptyText, { color: palette.textSecondary }]}>
            No beans match that name!{'\n'}Keep planting!
          </Text>
        </View>
      ) : (
        <HistoryVine
          ref={vineRef}
          beans={displayBeans}
          loading={loading}
          biome={biome}
          onPressBean={onPressBean}
        />
      )}

      {/* Stalk selector — floats over the top of the vine */}
      <StalkSwitcher />

      {/* Search toggle button — top-right, beside the StalkSwitcher pill */}
      <TouchableOpacity
        style={[
          styles.searchBtn,
          {
            backgroundColor: isSearchActive ? palette.accentColor : nodeSurface,
            borderColor: palette.accentColor,
            shadowColor: palette.accentColor,
          },
        ]}
        onPress={onSearchToggle}
        activeOpacity={0.82}
      >
        <Text style={[styles.searchBtnIcon, { color: isSearchActive ? nodeSurface : palette.textPrimary }]}>
          🔍
        </Text>
      </TouchableOpacity>

      {/* Flashback (Shake) button — sits just left of the search button */}
      <TouchableOpacity
        style={[
          styles.flashbackBtn,
          {
            backgroundColor: nodeSurface,
            borderColor: palette.accentColor,
            shadowColor: palette.accentColor,
          },
        ]}
        onPress={onFlashback}
        activeOpacity={0.82}
      >
        <Text style={[styles.searchBtnIcon, { color: palette.textPrimary }]}>✨</Text>
      </TouchableOpacity>

      {/* Search bar — hidden while the inspection sheet is open so it doesn't
          compete for top-of-screen space; query and active state are preserved. */}
      {isSearchActive && !isInspecting && (
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: nodeSurface,
              borderColor: palette.accentColor,
            },
          ]}
        >
          <TextInput
            style={[styles.searchInput, { color: palette.textPrimary }]}
            placeholder="Search beans by title..."
            placeholderTextColor={`${palette.textSecondary}88`}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoFocus
            returnKeyType="search"
            selectionColor={palette.accentColor}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => onSearchChange('')}
              hitSlop={10}
              activeOpacity={0.7}
            >
              <Text style={[styles.searchClearIcon, { color: palette.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* FAB — dark biome surface + neon accent outline (cartoon style) */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: nodeSurface,
            borderColor: palette.accentColor,
            shadowColor: palette.accentColor,
          },
        ]}
        onPress={onFabPress}
        activeOpacity={0.88}
      >
        <Text style={[styles.fabLabel, { color: palette.accentColor }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Container ───────────────────────────────────────────────────────────

/**
 * Root layout.
 *
 * soilTranslateY == 0              → Soil fully visible (capture mode)
 * soilTranslateY == -SCREEN_HEIGHT → Soil hidden (Garden visible)
 *
 * Gesture conflict resolution:
 *   Soil/Garden pan → failOffsetX([-20, 20])  (won't activate on horizontal drags)
 *   Dial pan        → failOffsetY([-10, 10])  (won't activate on vertical drags)
 *
 * Vertical navigation (inverted planting gesture):
 *   Swipe UP   → reveal Soil  (capture / plant a bean)
 *   Swipe DOWN → reveal Garden (timeline)
 */
export default function MainContainer() {
  // Clerk-verified user ID — guaranteed non-null here because RootGate only
  // renders MainContainer when isSignedIn === true.
  const { userId } = useAuth();

  // Active stalk + its biome theme drive data loading and the entire canvas.
  const { activeStalkId, biome } = useStalk();

  const { beans, loading, refresh } = useBeans(activeStalkId);

  // Tracks whether the Garden is the active layer — gates the shake listener
  // so a shake only recalls a memory while the user is viewing the garden.
  const [gardenVisible, setGardenVisible] = useState(true);
  const [inspectedBean, setInspectedBean] = useState<Bean | null>(null);

  // ── Search state ─────────────────────────────────────────────────────────
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery]       = useState('');

  const filteredBeans = useMemo(() => {
    if (!isSearchActive || !searchQuery.trim()) return beans;
    const q = searchQuery.toLowerCase();
    return beans.filter(b => b.title?.toLowerCase().includes(q));
  }, [beans, isSearchActive, searchQuery]);

  const handleSearchToggle = useCallback(() => {
    setIsSearchActive(prev => {
      if (prev) setSearchQuery(''); // clear query when closing
      return !prev;
    });
  }, []);

  // Safe-Shake memory selection scoped to the active stalk.
  const { memory, reveal, dismiss } = useShakeMemory(activeStalkId);

  // ── Spontaneous Flashback (header-button) ──────────────────────────────────
  // A random *past* memory pulled on demand and dropped in with a falling
  // animation. Independent of the accelerometer shake path above.
  const vineRef = useRef<HistoryVineHandle>(null);
  const [flashbackBean, setFlashbackBean] = useState<Bean | null>(null);
  const flashbackBusyRef = useRef(false);

  const revealFlashback = useCallback(async () => {
    if (flashbackBusyRef.current) return;
    flashbackBusyRef.current = true;
    try {
      const past = await fetchRandomPastBean(activeStalkId);
      if (past) setFlashbackBean(past);
    } catch (e) {
      console.warn('[Beanstalk] flashback fetch failed:', e);
    } finally {
      flashbackBusyRef.current = false;
    }
  }, [activeStalkId]);

  // Accelerometer shake → reveal a safe random memory. Disabled while the Soil
  // is up or a memory is already on screen (avoids stacking modals).
  useDeviceShake({
    onShake: reveal,
    enabled: gardenVisible && memory === null,
  });

  // Warm the ONNX session once on mount. initializeEngine() is idempotent and
  // silently degrades to the rule-based fallback if the model is absent.
  useEffect(() => { LocalAiEngine.initializeEngine(); }, []);

  const soilTranslateY = useSharedValue(-SCREEN_HEIGHT);
  const dragStartY     = useSharedValue(0);

  // ── Snap helpers ─────────────────────────────────────────────────────────
  // Each updates both the spring animation (UI thread) and the gardenVisible
  // JS state (via runOnJS). Safe to invoke from worklet or JS contexts.

  const openGarden = () => {
    'worklet';
    soilTranslateY.value = withSpring(-SCREEN_HEIGHT, SPRING_CONFIG);
    runOnJS(setGardenVisible)(true);
  };

  const openSoil = () => {
    'worklet';
    soilTranslateY.value = withSpring(0, SPRING_CONFIG);
    runOnJS(setGardenVisible)(false);
  };

  // ── Capture handler — inserts into DB then refreshes vine ────────────────

  const handleCapture = useCallback(async (bean: Omit<Bean, 'id'>) => {
    try {
      // 1. Persist locally — ai_* fields are null until the background pass fills them in.
      const saved = await insertBean(bean);

      // 2. Refresh the vine immediately so the user sees their new entry at once.
      await refresh();

      // 3. Push the initial record to Supabase (fire-and-forget; retries on reconnect).
      if (userId) syncLocalBeanToCloud(saved, userId);

      // 4. Background AI classification — never blocks the UI thread.
      //    Classifiable text: prefer typed/scanned content, fall back to transcription.
      const text = bean.textContent ?? bean.scannedText ?? bean.transcription ?? '';
      if (text.trim() && userId) {
        runAiClassification(saved, text, userId).catch((err) => {
          console.warn('[AI] Background classification failed:', err);
        });
      }
    } catch (e) {
      console.warn('[Beanstalk] insertBean failed:', e);
    }
  }, [refresh, userId]);

  // ── Bean update handler — patches DB then refreshes vine ─────────────────
  // Also handles post-transcription AI classification: when a completed
  // transcription lands on a bean that was never classified (aiSentiment == null),
  // the same background inference pipeline used at capture time fires automatically.

  const handleBeanUpdate = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Bean, 'title' | 'isFavorite' | 'transcription' | 'transcriptionStatus'>>,
    ) => {
      // Snapshot the bean BEFORE any awaits so we read synchronous state,
      // not potentially-stale state after React re-renders from refresh().
      const existing = beans.find(b => b.id === id);

      try {
        await updateBean(id, patch);
        await refresh();

        if (patch.transcription && userId && existing && existing.aiSentiment == null) {
          // Merge patch into the pre-update snapshot so runAiClassification
          // receives a fully unified bean (fresh transcription + all existing fields).
          const updatedBean: Bean = { ...existing, ...patch };
          runAiClassification(updatedBean, patch.transcription, userId).catch((err) => {
            console.warn('[AI] Post-transcription classification failed:', err);
          });
        }
      } catch (e) {
        console.warn('[Beanstalk] updateBean failed:', e);
      }
    },
    [refresh, userId, beans],
  );

  // ── Flashback favourite — local write + background Supabase sync ──────────

  const handleFlashbackFavorite = useCallback(
    (bean: Bean, next: boolean) => {
      const updated: Bean = { ...bean, isFavorite: next };
      // Keep the open card in sync if it's still the same memory.
      setFlashbackBean((cur) => (cur && cur.id === bean.id ? updated : cur));
      (async () => {
        try {
          await updateBean(bean.id, { isFavorite: next });
          await refresh();
          if (userId) syncLocalBeanToCloud(updated, userId);
        } catch (e) {
          console.warn('[Beanstalk] flashback favourite failed:', e);
        }
      })();
    },
    [refresh, userId]
  );

  // ── Flashback "jump to timeline" — clear overlay, then scroll the vine ─────

  const handleJumpToBean = useCallback((beanId: string) => {
    setFlashbackBean(null);
    // Drop any active search so the full timeline is present, then scroll on
    // the next frame once the list has rebuilt with all beans.
    setIsSearchActive(false);
    setSearchQuery('');
    requestAnimationFrame(() => vineRef.current?.scrollToBean(beanId));
  }, []);

  // ── Soil ↔ Garden pan gesture ────────────────────────────────────────────
  // Swipe UP pulls Soil into view (plant); swipe DOWN dismisses to Garden.
  // Gesture wraps both layers so upward planting works from the timeline too.

  const soilPanGesture = Gesture.Pan()
    .failOffsetX([-20, 20])
    .onBegin(() => {
      'worklet';
      dragStartY.value = soilTranslateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = dragStartY.value - e.translationY;
      soilTranslateY.value = Math.min(0, Math.max(-SCREEN_HEIGHT, next));
    })
    .onEnd((e) => {
      'worklet';
      const flickedUp = e.velocityY < -COMMIT_VELOCITY;
      const flickedDown = e.velocityY > COMMIT_VELOCITY;
      const draggedTowardSoil = soilTranslateY.value > dragStartY.value + COMMIT_THRESHOLD;
      const draggedTowardGarden = soilTranslateY.value < dragStartY.value - COMMIT_THRESHOLD;

      if (flickedUp || draggedTowardSoil) {
        openSoil();
      } else if (flickedDown || draggedTowardGarden) {
        openGarden();
      } else if (dragStartY.value < -SCREEN_HEIGHT / 2) {
        openGarden();
      } else {
        openSoil();
      }
    });

  // ── Animated styles ──────────────────────────────────────────────────────

  const soilAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: soilTranslateY.value }],
  }));

  const chevronAnimStyle = useAnimatedStyle(() => {
    const progress = Math.abs(soilTranslateY.value) / SCREEN_HEIGHT;
    return { opacity: Math.max(0, 1 - progress * 2.5) };
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <GestureDetector gesture={soilPanGesture}>
      <View style={[styles.root, { backgroundColor: biome.palette.backgroundEnd }]}>
        <GardenLayer
          displayBeans={filteredBeans}
          loading={loading}
          biome={biome}
          onFabPress={openSoil}
          onPressBean={setInspectedBean}
          isSearchActive={isSearchActive}
          isInspecting={inspectedBean !== null}
          searchQuery={searchQuery}
          onSearchToggle={handleSearchToggle}
          onSearchChange={setSearchQuery}
          onFlashback={revealFlashback}
          vineRef={vineRef}
        />

        {/*
         * pointerEvents guard: when Garden is the active layer the Soil
         * Animated.View is visually off-screen but its absoluteFill hit-rect
         * would otherwise swallow all Garden touches. Setting "none" collapses
         * the Soil branch out of hit-testing until it slides back into view.
         * The parent GestureDetector still receives vertical pans on Garden.
         */}
        <Animated.View
          style={[StyleSheet.absoluteFill, soilAnimStyle]}
          pointerEvents={gardenVisible ? 'none' : 'auto'}
        >
          <SoilContent
            stalkId={activeStalkId}
            biome={biome}
            chevronAnimStyle={chevronAnimStyle}
            onCapture={handleCapture}
          />
        </Animated.View>

        {/* Entry inspection sheet — above Garden + Soil, below shake modal */}
        <EntryInspectSheet
          bean={inspectedBean}
          biome={biome}
          onClose={() => setInspectedBean(null)}
          onUpdate={handleBeanUpdate}
        />

        {/* Shake-recalled memory — overlays everything, scales up from centre */}
        <MemoryModal bean={memory} onClose={dismiss} />

        {/* Spontaneous Flashback — falls in from above with three actions */}
        <FlashbackModal
          bean={flashbackBean}
          biome={biome}
          onClose={() => setFlashbackBean(null)}
          onToggleFavorite={handleFlashbackFavorite}
          onJumpToBean={handleJumpToBean}
        />
      </View>
    </GestureDetector>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Background colour is applied inline from the active biome.
  },

  // ── Soil ─────────────────────────────────────────────────────────────────
  soilRoot: {
    flex: 1,
  },
  captureArea: {
    flex: 1,
  },
  dialArea: {
    paddingVertical: 10,
  },

  // ── Chevron ───────────────────────────────────────────────────────────────
  chevronContainer: {
    alignItems: 'center',
    paddingBottom: 14,
    paddingTop: 4,
  },
  chevronSymbol: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 26,
    lineHeight: 26,
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 44,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    // Flat offset shadow — cartoon depth cue
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 0,
    elevation: 6,
  },
  fabLabel: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },

  // ── Search button ─────────────────────────────────────────────────────────
  searchBtn: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 51,
    // Flat cartoon shadow
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 6,
  },
  searchBtnIcon: {
    fontSize: 15,
    lineHeight: 18,
  },

  // ── Flashback button ──────────────────────────────────────────────────────
  // Mirrors the search button, offset one slot to its left (right: 16+38+10).
  flashbackBtn: {
    position: 'absolute',
    top: 52,
    right: 64,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 51,
    // Flat cartoon shadow
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 6,
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  searchBar: {
    position: 'absolute',
    top: 104,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 3,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    zIndex: 51,
    // Flat cartoon shadow
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    paddingVertical: 0,
  },
  searchClearIcon: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },

  // ── Empty search state ────────────────────────────────────────────────────
  searchEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  searchEmptyEmoji: {
    fontSize: 72,
  },
  searchEmptyText: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
  },
});
