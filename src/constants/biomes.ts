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

// ─── OCEAN DEPTHS — Deep dark navy, ocean-blue vine, muted azure accent ───────

const OCEAN_DEPTHS: BiomeConfig = {
  theme: 'ocean_depths',
  displayName: 'Ocean Depths',
  palette: {
    backgroundStart: '#08192b', // dark twilight water
    backgroundEnd:   '#030b16', // near-black navy floor
    vineColor:       '#1c4f7c', // deep ocean blue
    leafColor:       '#2f6fa0', // muted sea blue
    flowerColor:     '#4a90c2', // medium blue bloom
    fruitColor:      '#1a4368', // deep navy fruit
    rootColor:       '#12304d', // dark reef
    mistOverlayColor:'rgba(80,140,200,0.14)',
    textPrimary:     '#cfe2f2', // pale foam
    textSecondary:   '#5a7a9a', // muted slate blue
    accentColor:     '#2f80c4', // darker azure accent
  },
  nodeSurface: '#06182a',
  visuals: { nodeBorderWidth: 2, glow: true, particles: false },
};

// ─── CHERRY BLOSSOM — Soft light: mauve vine, sakura pinks, rose accent ───────

const CHERRY_BLOSSOM: BiomeConfig = {
  theme: 'cherry_blossom',
  displayName: 'Cherry Blossom',
  palette: {
    backgroundStart: '#fdeef2', // pale petal
    backgroundEnd:   '#f8e0e8', // soft blush floor
    vineColor:       '#c97b95', // mauve branch
    leafColor:       '#e39aab', // dusty rose leaf
    flowerColor:     '#ff9ec4', // bright sakura bloom
    fruitColor:      '#b5638a', // plum berry
    rootColor:       '#8a5a4a', // warm bark
    mistOverlayColor:'rgba(255,240,245,0.7)',
    textPrimary:     '#4a2a38', // deep plum — reads on pink
    textSecondary:   '#9a6a7a', // muted mauve
    accentColor:     '#e85d92', // rose accent
  },
  nodeSurface: '#fff6f9', // lightest petal card
  visuals: { nodeBorderWidth: 2, glow: false, particles: false, nodeBorderTint: '#e39aab' },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const BIOMES: Record<BiomeTheme, BiomeConfig> = {
  standard:        STANDARD,
  neon_night:      NEON_NIGHT,
  bonsai_oasis:    BONSAI_OASIS,
  cosmic_vineyard: COSMIC_VINEYARD,
  ocean_depths:    OCEAN_DEPTHS,
  cherry_blossom:  CHERRY_BLOSSOM,
};

/** Stable display order — also used to rotate themes for newly created stalks. */
export const BIOME_ORDER: BiomeTheme[] = [
  'standard',
  'neon_night',
  'bonsai_oasis',
  'cosmic_vineyard',
  'ocean_depths',
  'cherry_blossom',
];

/** Safe lookup with a Standard fallback for unknown / legacy theme values. */
export function getBiome(theme: BiomeTheme | string | undefined): BiomeConfig {
  return BIOMES[theme as BiomeTheme] ?? STANDARD;
}
