// ─── Bean Entry Types ────────────────────────────────────────────────────────

/** The four capture modes selectable via the thumb-slider dial. */
export type BeanType = 'type' | 'voice' | 'photo' | 'scan';

/**
 * The anatomical role a bean plays in the stalk's visual rendering.
 * Determined by BeanType but stored so the renderer doesn't re-derive it.
 *   type  → leaf   (green foliage node)
 *   photo → flower (bloom node)
 *   voice → fruit  (hanging pod node)
 *   scan  → root   (thick base node)
 */
export type BeanAnatomyRole = 'leaf' | 'flower' | 'fruit' | 'root';

/** Transcription status for voice beans. */
export type TranscriptionStatus = 'pending' | 'processing' | 'complete' | 'failed';

/** Nutrient split: allows a single bean to belong to two stalks simultaneously. */
export interface NutrientSplit {
  primaryStalkId: string;
  secondaryStalkId: string;
  /** 0–100 split weight toward the primary stalk (visual sizing, not data duplication). */
  primaryWeight: number;
}

/** Safe-Shake Filter settings controlling which past entries surface via shake. */
export interface SafeShakeFilter {
  enabled: boolean;
  /** High-stress keywords to screen out before surfacing a shake-recalled entry. */
  blockedKeywords: string[];
}

/**
 * A single journal entry — the core data unit of Beanstalk.
 * All fields after `id` through `createdAt` are required for every bean;
 * type-specific payloads are optional and typed narrowly.
 */
export interface Bean {
  id: string;
  stalkId: string;
  type: BeanType;
  anatomyRole: BeanAnatomyRole;
  createdAt: number; // Unix ms timestamp

  // ── Type bean ──────────────────────────────────────────────────────────────
  textContent?: string;

  // ── Voice bean ─────────────────────────────────────────────────────────────
  /** Local file URI for the recorded audio clip (5 s – 2 min). */
  audioUri?: string;
  /** Duration of the audio clip in seconds. */
  audioDurationSeconds?: number;
  transcription?: string;
  transcriptionStatus?: TranscriptionStatus;

  // ── Photo bean ─────────────────────────────────────────────────────────────
  /** Local file URI for the full-resolution image. */
  imageUri?: string;
  /** Low-res thumbnail URI used in the vine timeline. */
  thumbnailUri?: string;

  // ── Scan bean ──────────────────────────────────────────────────────────────
  /** OCR-extracted text from the scanned handwritten page. */
  scannedText?: string;
  /** Thumbnail URI clipped from the physical journal page scan. */
  scanThumbnailUri?: string;

  // ── Cross-cutting metadata ─────────────────────────────────────────────────
  /** Short title / name for the entry (max 25 chars), set at capture time. */
  title?: string;
  /** Whether this bean has been starred as a favourite (Ladybug system). */
  isFavorite?: boolean;
  /** Optional short caption / title the user can add to any bean type. */
  caption?: string;
  /** ISO-639-1 language code detected or set for text content. */
  languageCode?: string;
  /** User-assigned tags for search and filtering. */
  tags?: string[];
  /** True if this bean was shared to a second stalk via nutrient splitting. */
  isNutrientSplit?: boolean;
  nutrientSplit?: NutrientSplit;
  /** Vine Y-position offset assigned at render time; stored to keep layout stable. */
  vinePositionOffset?: number;
  /** Whether this bean has been flagged and hidden from the Safe-Shake Filter. */
  safeShakeHidden?: boolean;
  updatedAt?: number;

  // ── AI classification ──────────────────────────────────────────────────────
  /** Sentiment score from on-device AI classification [0.0 = negative, 1.0 = positive]. */
  aiSentiment?:  number;
  /** Emotional intensity index from on-device AI classification [0.0 = calm, 1.0 = intense]. */
  aiIntensity?:  number;
  /** Model prediction confidence [0.0, 1.0]. Lower values indicate the rule-based fallback ran. */
  aiConfidence?: number;
  /** Semantic tags assigned by on-device AI classification (e.g. ['gratitude', 'health']). */
  aiTags?:       string[];
}

// ─── Stalk / Biome Types ─────────────────────────────────────────────────────

/** Visual theme applied to a stalk's garden layer. */
export type BiomeTheme =
  | 'standard'        // Default lush green
  | 'neon_night'      // Dark bg, luminous accents
  | 'bonsai_oasis'    // Zen, minimal, earthy
  | 'cosmic_vineyard' // Deep space, star-field backdrop
  | 'music_journey';  // Cartoon-illustrative: charcoal + lavender + neon magenta

/** Premium unlock status for a biome theme. */
export type BiomeUnlockStatus = 'free' | 'premium_unlocked' | 'premium_locked';

/** Color palette tokens used by the garden renderer for a given biome. */
export interface BiomePalette {
  backgroundStart: string; // Gradient top (hex)
  backgroundEnd: string;   // Gradient bottom (hex)
  vineColor: string;
  leafColor: string;
  flowerColor: string;
  fruitColor: string;
  rootColor: string;
  mistOverlayColor: string;
  textPrimary: string;
  textSecondary: string;
  accentColor: string;
}

/** Particle effect configuration for the shake mechanic's falling leaves. */
export interface ShakeParticleConfig {
  leafCount: number;
  fallDurationMs: number;
  rotationRange: number; // degrees
  opacityDecay: number;  // 0–1, how quickly leaves fade out
}

/** Mist state tracking for the 72-hour inactivity mechanic. */
export interface MistState {
  isActive: boolean;
  /** Unix ms timestamp of the last bean logged to this stalk. */
  lastEntryAt: number | null;
  /** Hours of inactivity before mist activates. Default 72. */
  activationThresholdHours: number;
}

/** Growth statistics for a stalk, used for gamification display. */
export interface StalkGrowthStats {
  totalBeans: number;
  totalTypeBeans: number;
  totalVoiceBeans: number;
  totalPhotoBeans: number;
  totalScanBeans: number;
  /** Cumulative estimated height in virtual "segments". */
  currentHeightSegments: number;
  /** Longest streak of daily entries (calendar days). */
  longestStreakDays: number;
  /** Current streak of daily entries. */
  currentStreakDays: number;
}

/**
 * A Beanstalk — one vertical garden timeline with its own biome, history,
 * and growth state. Users can cultivate multiple stalks side-by-side.
 */
export interface StalkBiome {
  id: string;
  name: string; // e.g. "Daily Garden", "Music Journey"
  theme: BiomeTheme;
  unlockStatus: BiomeUnlockStatus;
  palette: BiomePalette;
  createdAt: number; // Unix ms timestamp
  updatedAt: number;

  /** Ordered list of bean IDs from oldest (index 0) to newest. */
  beanIds: string[];

  mist: MistState;
  growthStats: StalkGrowthStats;

  shakeParticleConfig: ShakeParticleConfig;
  safeShakeFilter: SafeShakeFilter;

  /** Whether this stalk is the currently active / focused one. */
  isActive: boolean;
  /** Custom emoji or single-character icon shown in the stalk switcher. */
  icon?: string;
  /** Short user-written description of this stalk's purpose. */
  description?: string;
}

// ─── App-level Config ─────────────────────────────────────────────────────────

/** The active capture mode on the dial — mirrors BeanType. */
export type CaptureMode = BeanType;

/** App-wide settings stored alongside the stalk data. */
export interface AppSettings {
  activeStalkId: string;
  captureMode: CaptureMode;
  hapticFeedbackEnabled: boolean;
  safeShakeFilterDefaults: SafeShakeFilter;
  /** Whether the onboarding flow has been completed. */
  onboardingComplete: boolean;
}
