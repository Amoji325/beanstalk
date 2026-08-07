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
import { EntryInspectSheet, LadybugToggle, LadybugIcon } from '@src/components/HistoryVine';
import BranchTimeline, { type BranchTimelineHandle } from '@src/components/BranchTimeline';
import MemoryModal from '@src/components/MemoryModal';
import FlashbackModal from '@src/components/FlashbackModal';
import BranchHeader from '@src/components/BranchHeader';
import ScanBeanCapture from '@src/components/capture/ScanBeanCapture';
import TypeBeanCapture from '@src/components/capture/TypeBeanCapture';
import VoiceBeanCapture from '@src/components/capture/VoiceBeanCapture';
import PhotoBeanCapture from '@src/components/capture/PhotoBeanCapture';
import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useAuth, useUser } from '@clerk/expo';
import { accountInitial, avatarKind, AccountAvatarGlyph, type AvatarKind } from '@src/components/AccountMenu';
import { insertBean, updateBean, deleteBean, syncLocalBeanToCloud, deleteBeanFromCloud, fetchRandomPastBean } from '@src/database';
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

// A "no ladybugs" mark for the empty favourites state — the drawn ladybug icon
// (outline only) with a diagonal slash, so it reads as "none favourited" without
// an emoji.
function SlashedLadybug({ color }: { color: string }) {
  const SIZE = 52;
  const BOX = Math.round(SIZE * 1.5);
  const SLASH = Math.round(SIZE * 1.4);
  return (
    <View style={{ width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' }}>
      <LadybugIcon active={false} outlineColor={color} bodySize={SIZE} />
      <View
        style={{
          position: 'absolute',
          top: BOX / 2 - 1.5,
          left: (BOX - SLASH) / 2,
          width: SLASH,
          height: 3,
          borderRadius: 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

// Drawn magnifying-glass icon (no emoji): a ring lens (upper-left) + a diagonal
// handle (lower-right), sized so the whole glyph is centred in its box.
function SearchIcon({ color, size = 18 }: { color: string; size?: number }) {
  const lens = Math.round(size * 0.62);
  const bw = Math.max(2, Math.round(size * 0.11));
  const pos = Math.round(size * 0.08);   // lens top/left inset
  const handle = Math.round(size * 0.34);
  const hCenter = Math.round(size * 0.74); // handle centre along both axes
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          top: pos,
          left: pos,
          width: lens,
          height: lens,
          borderRadius: lens / 2,
          borderWidth: bw,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: hCenter - Math.round(bw / 2),
          left: hCenter - Math.round(handle / 2),
          width: handle,
          height: bw,
          borderRadius: bw / 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

interface GardenLayerProps {
  displayBeans: Bean[];
  loading: boolean;
  biome: BiomeConfig;
  gardenVisible: boolean;
  accountInitial: string;
  accountKind: AvatarKind;
  branchName: string;
  onOpenAccount: () => void;
  onBackToTree: () => void;
  onFabPress: () => void;
  onPressBean: (bean: Bean) => void;
  isSearchActive: boolean;
  isInspecting: boolean;
  searchQuery: string;
  favoritesOnly: boolean;
  onSearchToggle: () => void;
  onSearchChange: (q: string) => void;
  onToggleFavorites: () => void;
  onFlashback: () => void;
  vineRef: React.Ref<BranchTimelineHandle>;
}

function GardenLayer({
  displayBeans,
  loading,
  biome,
  gardenVisible,
  accountInitial,
  accountKind,
  branchName,
  onOpenAccount,
  onBackToTree,
  onFabPress,
  onPressBean,
  isSearchActive,
  isInspecting,
  searchQuery,
  favoritesOnly,
  onSearchToggle,
  onSearchChange,
  onToggleFavorites,
  onFlashback,
  vineRef,
}: GardenLayerProps) {
  const { palette, nodeSurface } = biome;
  const showEmpty =
    isSearchActive &&
    (searchQuery.trim().length > 0 || favoritesOnly) &&
    displayBeans.length === 0;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.backgroundEnd }]}>
      {/* Vine or empty-search state */}
      {showEmpty ? (
        <View style={styles.searchEmpty}>
          {favoritesOnly ? (
            <SlashedLadybug color={palette.textSecondary} />
          ) : (
            <Text style={styles.searchEmptyEmoji}>🌱</Text>
          )}
          <Text style={[styles.searchEmptyText, { color: palette.textSecondary }]}>
            {favoritesOnly
              ? 'No Ladybugged beans here yet!\nTap a bean’s ladybug to favourite it.'
              : 'No beans match that name!\nKeep planting!'}
          </Text>
        </View>
      ) : (
        <BranchTimeline
          ref={vineRef}
          beans={displayBeans}
          loading={loading}
          biome={biome}
          onPressBean={onPressBean}
        />
      )}

      {/* Account button — top-left; shows the user's initial. Hidden during
          capture so it doesn't overlap the Soil controls. */}
      {gardenVisible && (
        <TouchableOpacity
          style={[
            styles.accountBtn,
            {
              backgroundColor: nodeSurface,
              borderColor: palette.accentColor,
              shadowColor: palette.accentColor,
            },
          ]}
          onPress={onOpenAccount}
          activeOpacity={0.82}
        >
          <AccountAvatarGlyph kind={accountKind} initial={accountInitial} color={palette.accentColor} bg={nodeSurface} size={22} />
        </TouchableOpacity>
      )}

      {/* Branch header — tap to return to the tree */}
      {gardenVisible && <BranchHeader name={branchName} biome={biome} onBack={onBackToTree} />}

      {/* Search toggle button — top-right, beside the StalkSwitcher pill.
          Hidden during capture so it can't overlap the Soil controls. */}
      {gardenVisible && (
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
          <SearchIcon color={isSearchActive ? nodeSurface : palette.textPrimary} size={18} />
        </TouchableOpacity>
      )}

      {/* Shake button — bottom-left; resurfaces a random past memory. Hidden
          while the capture screen is up so it can't block the Soil controls. */}
      {gardenVisible && (
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
          <Text style={[styles.flashbackLabel, { color: palette.accentColor }]}>Shake</Text>
        </TouchableOpacity>
      )}

      {/* Search bar — hidden while the inspection sheet or capture screen is
          open; query and active state are preserved. */}
      {isSearchActive && !isInspecting && gardenVisible && (
        <>
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
            {/* Ladybug filter — same button as favouriting an entry, for
                consistency. Shows only favourited ("Ladybugged") beans. */}
            <LadybugToggle
              active={favoritesOnly}
              onToggle={onToggleFavorites}
              outlineColor={palette.textSecondary}
            />
          </View>

          {/* Close search — plain ✕ outside the box; drops the keyboard and
              exits search (which also clears the query). */}
          <TouchableOpacity
            style={styles.searchClose}
            onPress={() => { Keyboard.dismiss(); onSearchToggle(); }}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <Text style={[styles.searchCloseIcon, { color: palette.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </>
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
 * soilTranslateY ==  0             → Soil fully visible (capture mode)
 * soilTranslateY == +SCREEN_HEIGHT → Soil resting below the viewport (Garden visible)
 * soilTranslateY == -SCREEN_HEIGHT → Soil dismissed above the viewport (Garden visible)
 *
 * Gesture conflict resolution:
 *   Soil/Garden pan → failOffsetX([-20, 20])  (won't activate on horizontal drags)
 *   Dial pan        → failOffsetY([-10, 10])  (won't activate on vertical drags)
 *
 * Vertical navigation (the Soil panel tracks the finger 1:1):
 *   From Garden → swipe UP rises the Soil into view (plant a bean)
 *   From Soil   → swipe UP slides it up & away; swipe DOWN sinks it back down
 *   Both dismiss directions reveal the Garden.
 */
interface MainContainerProps {
  /** Return to the Tree home (this branch is one limb of the tree). */
  onBackToTree: () => void;
  /** Open the shared account menu (owned by RootShell). */
  onOpenAccount: () => void;
}

export default function MainContainer({ onBackToTree, onOpenAccount }: MainContainerProps) {
  // Clerk-verified user ID — guaranteed non-null here because RootGate only
  // renders MainContainer when isSignedIn === true.
  const { userId } = useAuth();
  const { user } = useUser();

  // Active stalk (branch) + its biome theme drive data loading and the canvas.
  const { activeStalkId, activeStalk, biome } = useStalk();

  const { beans, loading, refresh } = useBeans(activeStalkId);

  // Tracks whether the Garden is the active layer — gates the shake listener
  // so a shake only recalls a memory while the user is viewing the garden.
  const [gardenVisible, setGardenVisible] = useState(true);
  const [inspectedBean, setInspectedBean] = useState<Bean | null>(null);

  // ── Search state ─────────────────────────────────────────────────────────
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery]       = useState('');
  const [favoritesOnly, setFavoritesOnly]   = useState(false);

  const filteredBeans = useMemo(() => {
    if (!isSearchActive) return beans;
    let result = beans;
    if (favoritesOnly) result = result.filter(b => b.isFavorite);
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter(b => b.title?.toLowerCase().includes(q));
    return result;
  }, [beans, isSearchActive, searchQuery, favoritesOnly]);

  const handleSearchToggle = useCallback(() => {
    setIsSearchActive(prev => {
      if (prev) {           // reset filters when closing
        setSearchQuery('');
        setFavoritesOnly(false);
      }
      return !prev;
    });
  }, []);

  // Fully exit search (used when another menu opens, e.g. the stalk switcher,
  // so the two never overlap). Resets filters and drops the keyboard.
  const closeSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    setFavoritesOnly(false);
    Keyboard.dismiss();
  }, []);

  // Safe-Shake memory selection scoped to the active stalk.
  const { memory, reveal, dismiss } = useShakeMemory(activeStalkId);

  // ── Spontaneous Flashback (header-button) ──────────────────────────────────
  // A random *past* memory pulled on demand and dropped in with a falling
  // animation. Independent of the accelerometer shake path above.
  const vineRef = useRef<BranchTimelineHandle>(null);
  const [flashbackBean, setFlashbackBean] = useState<Bean | null>(null);
  const flashbackBusyRef = useRef(false);

  const revealFlashback = useCallback(async () => {
    // A little "shake" — two quick light taps for tactile feedback on press.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 90);

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

  // Configure the global audio session once so voice playback (timeline +
  // shake-recalled memories) is audible even when the iOS silent switch is on.
  // Fire-and-forget: a failure here only means playback falls back to the OS
  // default, never a crash.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch((e) =>
      console.warn('[Beanstalk] setAudioModeAsync failed:', e),
    );
  }, []);

  // Rests +SCREEN_HEIGHT (below the viewport) so a swipe-up rises it into view.
  const soilTranslateY = useSharedValue(SCREEN_HEIGHT);
  const dragStartY     = useSharedValue(0);

  // ── Snap helpers ─────────────────────────────────────────────────────────
  // Each updates both the spring animation (UI thread) and the gardenVisible
  // JS state (via runOnJS). Safe to invoke from worklet or JS contexts.

  const openSoil = () => {
    'worklet';
    soilTranslateY.value = withSpring(0, SPRING_CONFIG);
    runOnJS(setGardenVisible)(false);
  };

  // Sink the Soil back down below the viewport (the resting Garden state).
  const openGarden = () => {
    'worklet';
    soilTranslateY.value = withSpring(SCREEN_HEIGHT, SPRING_CONFIG);
    runOnJS(setGardenVisible)(true);
  };

  // Dismiss an *open* Soil by sliding it up and off the top, matching an upward
  // swipe. Once it settles off-screen we snap it back below the viewport — an
  // invisible jump, since the Garden fills the screen at both extremes — so the
  // next swipe-up rises it in from the bottom again.
  const dismissSoilUpward = () => {
    'worklet';
    soilTranslateY.value = withSpring(-SCREEN_HEIGHT, SPRING_CONFIG, (finished) => {
      if (finished) soilTranslateY.value = SCREEN_HEIGHT;
    });
    runOnJS(setGardenVisible)(true);
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

  // ── Bean delete handler — removes locally, refreshes, mirrors to cloud ─────

  const handleBeanDelete = useCallback(
    async (id: string) => {
      try {
        await deleteBean(id);
        await refresh();
        if (userId) deleteBeanFromCloud(id, userId); // fire-and-forget
      } catch (e) {
        console.warn('[Beanstalk] deleteBean failed:', e);
      }
    },
    [refresh, userId],
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
  // The Soil panel tracks the finger 1:1. From the Garden, swiping up rises it
  // into view. While it's open, swiping up sends it up & off the top, swiping
  // down sinks it back below — both reveal the Garden. Gesture wraps both layers
  // so upward planting works from the timeline too.

  const soilPanGesture = Gesture.Pan()
    .failOffsetX([-20, 20])
    .onBegin(() => {
      'worklet';
      dragStartY.value = soilTranslateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Panel follows the finger: swipe up → moves up, swipe down → moves down.
      const next = dragStartY.value + e.translationY;
      soilTranslateY.value = Math.min(SCREEN_HEIGHT, Math.max(-SCREEN_HEIGHT, next));
    })
    .onEnd((e) => {
      'worklet';
      const p  = soilTranslateY.value;
      const vy = e.velocityY;
      // Was the Soil open (near centre) when the drag began?
      const startedOpen = Math.abs(dragStartY.value) < SCREEN_HEIGHT / 2;

      if (startedOpen) {
        if (vy < -COMMIT_VELOCITY || p < -COMMIT_THRESHOLD) {
          dismissSoilUpward();           // swiped up → slide up and away
        } else if (vy > COMMIT_VELOCITY || p > COMMIT_THRESHOLD) {
          openGarden();                  // swiped down → sink back below
        } else {
          openSoil();                    // not far enough → snap back open
        }
      } else {
        // Rising from the Garden: far enough up (or a flick) commits to open.
        if (vy < -COMMIT_VELOCITY || p < SCREEN_HEIGHT - COMMIT_THRESHOLD) {
          openSoil();
        } else {
          openGarden();
        }
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
          gardenVisible={gardenVisible}
          accountInitial={accountInitial(user)}
          accountKind={avatarKind(user)}
          branchName={activeStalk?.name ?? 'Branch'}
          onOpenAccount={() => { closeSearch(); onOpenAccount(); }}
          onBackToTree={onBackToTree}
          onFabPress={openSoil}
          onPressBean={setInspectedBean}
          isSearchActive={isSearchActive}
          isInspecting={inspectedBean !== null}
          searchQuery={searchQuery}
          favoritesOnly={favoritesOnly}
          onSearchToggle={handleSearchToggle}
          onSearchChange={setSearchQuery}
          onToggleFavorites={() => setFavoritesOnly(v => !v)}
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
          onDelete={handleBeanDelete}
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

  // ── Account button ────────────────────────────────────────────────────────
  accountBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
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

  // ── Shake button ────────────────────────────────────────────────────────────
  // Bottom-left pill, mirroring the FAB's cartoon styling on the opposite corner.
  flashbackBtn: {
    position: 'absolute',
    bottom: 50,
    left: 24,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 51,
    // Flat offset shadow — cartoon depth cue (matches FAB)
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 0,
    elevation: 6,
  },
  flashbackLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  searchBar: {
    position: 'absolute',
    top: 104,
    left: 16,
    right: 54, // leaves room for the close ✕ that sits outside the box
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
  // Plain ✕ to the right of the search box, vertically centred with it.
  searchClose: {
    position: 'absolute',
    top: 104,
    right: 10,
    width: 34,
    height: 59,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 52,
  },
  searchCloseIcon: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
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
