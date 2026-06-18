import type { BiomePalette, BiomeTheme } from '@src/types';

// ─── Biome Visual Treatment ───────────────────────────────────────────────────

/**
 * Render-time treatment flags that sit alongside the colour palette.
 * These describe *how* strokes/surfaces are drawn, not the colours themselves.
 */
export interface BiomeVisuals {
  /** Border width applied to bean node cards. */
  nodeBorderWidth: number;
  /** When true, anatomy strokes get a coloured glow (neon / cosmic). */
  glow: boolean;
  /** When true, a subtle animated stardust layer renders behind the vine. */
  particles: boolean;
  /**
   * Optional border tint used for node card edges where the design calls for a
   * material (e.g. raw wood in Bonsai) rather than the anatomy colour.
   */
  nodeBorderTint?: string;
  /**
   * When set, overrides the auto-computed cardOutline colour in HistoryVine
   * (which normally derives from the surface brightness). Use this when a biome
   * needs a specific brand outline colour that the luminance heuristic can't infer.
   */
  cardOutline?: string;
  /**
   * When set, overrides the auto-computed flat drop-shadow colour behind cards.
   */
  cardShadow?: string;
}

/**
 * A complete biome configuration: the typed colour palette plus the surface
 * colours and treatment flags the renderer needs.
 */
export interface BiomeConfig {
  theme: BiomeTheme;
  displayName: string;
  palette: BiomePalette;
  /** Background colour for bean node cards. */
  nodeSurface: string;
  visuals: BiomeVisuals;
}

// ─── STANDARD — Deep immersive forest, rich organic greens ───────────────────

const STANDARD: BiomeConfig = {
  theme: 'standard',
  displayName: 'Daily Garden',
  palette: {
    backgroundStart: '#0b1e0d', // deep canopy
    backgroundEnd:   '#060e07', // near-black soil floor
    vineColor:       '#1e6b2e', // rich saturated vine
    leafColor:       '#43a047', // vivid living leaf
    flowerColor:     '#5cb860', // bright blossom
    fruitColor:      '#2a7a32', // deep fruit green
    rootColor:       '#2d5a1b', // dark root wood
    mistOverlayColor:'rgba(200,230,210,0.52)',
    textPrimary:     '#d4edda', // softer warm-white
    textSecondary:   '#4a7a52', // muted mid-green
    accentColor:     '#56c464', // bright accent
  },
  nodeSurface: '#091a0c', // deeply saturated card bg
  visuals: { nodeBorderWidth: 2, glow: false, particles: false },
};

// ─── NEON NIGHT — Jet black, electric purple vine, neon pink glowing strokes ──

const NEON_NIGHT: BiomeConfig = {
  theme: 'neon_night',
  displayName: 'Neon Night',
  palette: {
    backgroundStart: '#0a0612',
    backgroundEnd:   '#000000', // jet black canvas
    vineColor:       '#b14cff', // electric purple
    leafColor:       '#ff2bd6', // neon pink
    flowerColor:     '#ff5bd1',
    fruitColor:      '#9d4edd',
    rootColor:       '#7b2cbf',
    mistOverlayColor:'rgba(40,10,60,0.6)',
    textPrimary:     '#f5e6ff',
    textSecondary:   '#9a73c2',
    accentColor:     '#ff2bd6',
  },
  nodeSurface: '#0d0618',
  visuals: { nodeBorderWidth: 2, glow: true, particles: false },
};

// ─── BONSAI OASIS — Warm cream canvas, refined sage, gold-wood borders ────────

const BONSAI_OASIS: BiomeConfig = {
  theme: 'bonsai_oasis',
  displayName: 'Cloud Village',
  palette: {
    backgroundStart: '#faf6ec', // clean warm cream
    backgroundEnd:   '#f2ebe0', // parchment floor
    vineColor:       '#7a9e68', // lush sage
    leafColor:       '#6b8c55', // deep sage leaf
    flowerColor:     '#95b07a', // soft sage blossom
    fruitColor:      '#8e6540', // warm amber-wood
    rootColor:       '#6a4928', // dark walnut
    mistOverlayColor:'rgba(255,251,242,0.72)',
    textPrimary:     '#2c2a1f', // rich charcoal — reads on cream
    textSecondary:   '#6e6b52', // warm stone
    accentColor:     '#7a9e68', // sage accent
  },
  nodeSurface: '#fefbf4', // lightest cream card bg
  visuals: { nodeBorderWidth: 2, glow: false, particles: false, nodeBorderTint: '#c09a62' },
};

// ─── COSMIC VINEYARD — Dark indigo, stardust hints, deep violet accents ───────

const COSMIC_VINEYARD: BiomeConfig = {
  theme: 'cosmic_vineyard',
  displayName: 'Cosmic Vineyard',
  palette: {
    backgroundStart: '#1a1340',
    backgroundEnd:   '#0d0925', // dark indigo canvas
    vineColor:       '#5b4b8a', // deep violet
    leafColor:       '#8a7bd8',
    flowerColor:     '#b39ddb',
    fruitColor:      '#7e57c2',
    rootColor:       '#4a3b6b',
    mistOverlayColor:'rgba(30,20,70,0.6)',
    textPrimary:     '#e6e0ff',
    textSecondary:   '#9a8fc4',
    accentColor:     '#b39ddb',
  },
  nodeSurface: '#161033',
  visuals: { nodeBorderWidth: 1.5, glow: true, particles: true },
};

// ─── MUSIC JOURNEY — Deep charcoal, lavender-purple vine, neon magenta accents ─

const MUSIC_JOURNEY: BiomeConfig = {
  theme: 'music_journey',
  displayName: 'Music Journey',
  palette: {
    backgroundStart: '#1a0f2e', // deep midnight purple
    backgroundEnd:   '#121212', // near-black charcoal canvas
    vineColor:       '#C8A2C8', // lavender purple spine
    leafColor:       '#D8B4E2', // soft lavender leaf
    flowerColor:     '#FF00FF', // neon magenta blossom
    fruitColor:      '#9B59B6', // deep violet fruit
    rootColor:       '#6C3483', // dark indigo root
    mistOverlayColor:'rgba(200,162,200,0.18)',
    textPrimary:     '#E6E6FA', // pastel lilac — reads on charcoal
    textSecondary:   '#C8A2C8', // lavender mid-tone
    accentColor:     '#FF00FF', // neon magenta accent
  },
  nodeSurface: '#1e1040', // dark violet card background
  visuals: {
    nodeBorderWidth: 3,
    glow: true,
    particles: false,
    // Lavender outline stays visible on the dark card surface without relying
    // on the luminance heuristic (which would otherwise pick white at low opacity).
    cardOutline: '#C8A2C8',
    cardShadow: 'rgba(200,162,200,0.50)',
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const BIOMES: Record<BiomeTheme, BiomeConfig> = {
  standard:        STANDARD,
  neon_night:      NEON_NIGHT,
  bonsai_oasis:    BONSAI_OASIS,
  cosmic_vineyard: COSMIC_VINEYARD,
  music_journey:   MUSIC_JOURNEY,
};

/** Stable display order — also used to rotate themes for newly created stalks. */
export const BIOME_ORDER: BiomeTheme[] = [
  'standard',
  'neon_night',
  'bonsai_oasis',
  'cosmic_vineyard',
  'music_journey',
];

/** Safe lookup with a Standard fallback for unknown / legacy theme values. */
export function getBiome(theme: BiomeTheme | string | undefined): BiomeConfig {
  return BIOMES[theme as BiomeTheme] ?? STANDARD;
}
