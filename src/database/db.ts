import * as SQLite from 'expo-sqlite';
import { documentDirectory } from 'expo-file-system/legacy';
import type {
  Bean,
  BeanAnatomyRole,
  BeanType,
  BiomeTheme,
  NutrientSplit,
  TranscriptionStatus,
} from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'beanstalk.db';

const DEFAULT_STALK_ID = 'default-garden';

// ─── Internal Row Types ───────────────────────────────────────────────────────
// These mirror the raw column layout SQLite returns. Never leak outside this
// module — callers always receive the mapped public types below.

interface StalkRow {
  id: string;
  name: string;
  themeType: string;
  isPremium: number; // 0 | 1
}

interface BeanRow {
  id: string;
  stalkId: string;
  type: string;
  contentText: string | null;
  mediaUri: string | null;
  transcriptionText: string | null;
  timestamp: number;
  sentimentScore: number | null;
  /** JSON-encoded BeanExtendedData for fields that don't fit the core columns. */
  extendedData: string | null;
  /** Short user-supplied entry title (max 25 chars). Nullable. */
  title: string | null;
  /** 1 = favourited (ladybug), 0 = normal. */
  is_favorite: number;
  // AI classification columns
  ai_sentiment:  number | null;
  ai_intensity:  number | null;
  ai_confidence: number | null;
  ai_tags:       string | null; // JSON-serialised string[]
}

/**
 * Extended fields serialised into the extendedData JSON column.
 * All entries are optional so old rows without a field degrade gracefully.
 */
interface BeanExtendedData {
  anatomyRole?: BeanAnatomyRole;
  thumbnailUri?: string;
  scanThumbnailUri?: string;
  audioDurationSeconds?: number;
  transcriptionStatus?: TranscriptionStatus;
  caption?: string;
  languageCode?: string;
  tags?: string[];
  isNutrientSplit?: boolean;
  nutrientSplit?: NutrientSplit;
  vinePositionOffset?: number;
  safeShakeHidden?: boolean;
  updatedAt?: number;
}

// ─── Public Record Types ──────────────────────────────────────────────────────

/**
 * The DB-backed projection of a stalk. The app layer (context / selectors)
 * hydrates this into a full StalkBiome by merging in theme palette defaults.
 */
export interface StalkRecord {
  id: string;
  name: string;
  themeType: BiomeTheme;
  /** Mapped from INTEGER 0/1 — true means premium has been unlocked. */
  isPremium: boolean;
}

// ─── Database Singleton ───────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  return _db;
}

// ─── URI Sanitization ─────────────────────────────────────────────────────────
// On iOS each app install gets a new sandbox UUID embedded in all file paths:
//   file:///var/mobile/Containers/Data/Application/{UUID}/Library/Caches/…
// After a reinstall or build change the UUID rotates, making stored absolute
// paths point nowhere. We detect the current UUID from FileSystem.documentDirectory
// at runtime and rewrite any stale UUID found in a stored path.

/** Matches the 36-char UUID segment in an iOS app sandbox path. */
const IOS_UUID_RE = /\/Containers\/Data\/Application\/([A-Fa-f0-9-]{36})\//;

// Lazily resolved once per JS process lifetime — undefined means "not yet read".
let _cachedContainerUUID: string | null | undefined;

function currentContainerUUID(): string | null {
  if (_cachedContainerUUID !== undefined) return _cachedContainerUUID;
  const doc = documentDirectory ?? '';
  const m = doc.match(IOS_UUID_RE);
  const uuid = m?.[1] ?? null;
  _cachedContainerUUID = uuid;
  return uuid;
}

/**
 * Rewrites a stale iOS sandbox UUID in a local file URI to the current
 * runtime UUID. Non-local URIs (http/https, ph://, asset://) pass through
 * unchanged. Returns `undefined` for null/empty input.
 */
function sanitizeLocalUri(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  // Not an iOS sandbox path — leave untouched.
  if (!IOS_UUID_RE.test(uri)) return uri;
  const uuid = currentContainerUUID();
  if (!uuid) return uri;
  return uri.replace(IOS_UUID_RE, `/Containers/Data/Application/${uuid}/`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function beanTypeToAnatomyRole(type: BeanType): BeanAnatomyRole {
  const map: Record<BeanType, BeanAnatomyRole> = {
    type: 'leaf',
    photo: 'flower',
    voice: 'fruit',
    scan: 'root',
  };
  return map[type];
}

function rowToStalk(row: StalkRow): StalkRecord {
  return {
    id: row.id,
    name: row.name,
    themeType: row.themeType as BiomeTheme,
    isPremium: row.isPremium === 1,
  };
}

function rowToBean(row: BeanRow): Bean {
  const type = row.type as BeanType;
  const extended: BeanExtendedData = row.extendedData
    ? (JSON.parse(row.extendedData) as BeanExtendedData)
    : {};

  // Resolve the primary text content field by bean type.
  const textContent = type === 'type' ? (row.contentText ?? undefined) : undefined;
  const scannedText = type === 'scan' ? (row.contentText ?? undefined) : undefined;

  // Resolve the media URI field by bean type, rewriting any stale iOS sandbox UUID.
  const audioUri = type === 'voice' ? sanitizeLocalUri(row.mediaUri) : undefined;
  const imageUri = type === 'photo' ? sanitizeLocalUri(row.mediaUri) : undefined;

  return {
    id: row.id,
    stalkId: row.stalkId,
    type,
    anatomyRole: extended.anatomyRole ?? beanTypeToAnatomyRole(type),
    createdAt: row.timestamp,

    // Text
    textContent,
    scannedText,

    // Voice
    audioUri,
    audioDurationSeconds: extended.audioDurationSeconds,
    transcription: row.transcriptionText ?? undefined,
    transcriptionStatus: extended.transcriptionStatus,

    // Photo
    imageUri,
    thumbnailUri: sanitizeLocalUri(extended.thumbnailUri),

    // Scan
    scanThumbnailUri: sanitizeLocalUri(extended.scanThumbnailUri),

    // Cross-cutting
    title: row.title ?? undefined,
    isFavorite: row.is_favorite === 1,
    caption: extended.caption,
    languageCode: extended.languageCode,
    tags: extended.tags,
    isNutrientSplit: extended.isNutrientSplit,
    nutrientSplit: extended.nutrientSplit,
    vinePositionOffset: extended.vinePositionOffset,
    safeShakeHidden: extended.safeShakeHidden,
    updatedAt: extended.updatedAt,

    aiSentiment:  row.ai_sentiment  ?? undefined,
    aiIntensity:  row.ai_intensity  ?? undefined,
    aiConfidence: row.ai_confidence ?? undefined,
    aiTags: (() => {
      if (!row.ai_tags) return undefined;
      try { return JSON.parse(row.ai_tags) as string[]; }
      catch { return []; }
    })(),
  };
}

function beanToRow(
  id: string,
  bean: Omit<Bean, 'id'>
): {
  id: string;
  stalkId: string;
  type: string;
  contentText: string | null;
  mediaUri: string | null;
  transcriptionText: string | null;
  timestamp: number;
  sentimentScore: number | null;
  extendedData: string;
  title: string | null;
  is_favorite: number;
  ai_sentiment:  number | null;
  ai_intensity:  number | null;
  ai_confidence: number | null;
  ai_tags:       string | null;
} {
  // Map the primary text content column by type.
  let contentText: string | null = null;
  if (bean.type === 'type') contentText = bean.textContent ?? null;
  if (bean.type === 'scan') contentText = bean.scannedText ?? null;

  // Map the single media URI column by type.
  let mediaUri: string | null = null;
  if (bean.type === 'voice') mediaUri = bean.audioUri ?? null;
  if (bean.type === 'photo') mediaUri = bean.imageUri ?? null;
  if (bean.type === 'scan') mediaUri = bean.scanThumbnailUri ?? null;

  const extended: BeanExtendedData = {
    anatomyRole: bean.anatomyRole,
    thumbnailUri: bean.thumbnailUri,
    scanThumbnailUri: bean.scanThumbnailUri,
    audioDurationSeconds: bean.audioDurationSeconds,
    transcriptionStatus: bean.transcriptionStatus,
    caption: bean.caption,
    languageCode: bean.languageCode,
    tags: bean.tags,
    isNutrientSplit: bean.isNutrientSplit,
    nutrientSplit: bean.nutrientSplit,
    vinePositionOffset: bean.vinePositionOffset,
    safeShakeHidden: bean.safeShakeHidden,
    updatedAt: bean.updatedAt,
  };

  // Drop undefined keys to keep storage lean.
  const cleanExtended = Object.fromEntries(
    Object.entries(extended).filter(([, v]) => v !== undefined)
  ) as BeanExtendedData;

  return {
    id,
    stalkId: bean.stalkId,
    type: bean.type,
    contentText,
    mediaUri,
    transcriptionText: bean.transcription ?? null,
    timestamp: bean.createdAt,
    sentimentScore: null,
    extendedData: JSON.stringify(cleanExtended),
    title: bean.title ?? null,
    is_favorite: bean.isFavorite ? 1 : 0,
    ai_sentiment:  bean.aiSentiment  ?? null,
    ai_intensity:  bean.aiIntensity  ?? null,
    ai_confidence: bean.aiConfidence ?? null,
    ai_tags:       bean.aiTags ? JSON.stringify(bean.aiTags) : null,
  };
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Opens the database, creates tables (if absent), and seeds the default stalk
 * on first launch. Call once at app startup — safe to call multiple times.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS stalks (
      id        TEXT PRIMARY KEY NOT NULL,
      name      TEXT NOT NULL,
      themeType TEXT NOT NULL DEFAULT 'standard',
      isPremium INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS beans (
      id                TEXT PRIMARY KEY NOT NULL,
      stalkId           TEXT NOT NULL,
      type              TEXT NOT NULL,
      contentText       TEXT,
      mediaUri          TEXT,
      transcriptionText TEXT,
      timestamp         INTEGER NOT NULL,
      sentimentScore    REAL,
      extendedData      TEXT,
      title             TEXT,
      is_favorite       INTEGER NOT NULL DEFAULT 0,
      is_synced         INTEGER NOT NULL DEFAULT 0,
      sync_pending_at   INTEGER,
      FOREIGN KEY (stalkId) REFERENCES stalks(id) ON DELETE CASCADE
    );
  `);

  // Additive migrations: each ALTER TABLE is idempotent — SQLite throws on
  // duplicate column additions, which the catch silently absorbs.
  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN title TEXT');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN sync_pending_at INTEGER');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN ai_sentiment REAL');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN ai_intensity REAL');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN ai_confidence REAL');
  } catch { /* already present */ }

  try {
    await db.execAsync('ALTER TABLE beans ADD COLUMN ai_tags TEXT');
  } catch { /* already present */ }

  // Seed the default stalk only if it doesn't already exist.
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM stalks WHERE id = ?',
    [DEFAULT_STALK_ID]
  );

  if (!existing) {
    await db.runAsync(
      'INSERT INTO stalks (id, name, themeType, isPremium) VALUES (?, ?, ?, ?)',
      [DEFAULT_STALK_ID, 'Daily Garden', 'standard', 0]
    );
  }
}

// ─── Shared one-time init guard ───────────────────────────────────────────────
// initializeDatabase is idempotent, but multiple consumers (useBeans,
// StalkContext) mount simultaneously. This promise ensures the schema-creation
// + seed runs exactly once and every caller awaits the same result.

let _initPromise: Promise<void> | null = null;

export function ensureDatabaseInitialized(): Promise<void> {
  if (!_initPromise) _initPromise = initializeDatabase();
  return _initPromise;
}

// ─── Shared column list ───────────────────────────────────────────────────────
// All bean SELECT queries project the same columns so BeanRow is always fully
// populated. Update here when new columns are added to the beans table.

const BEAN_COLS = `
  id, stalkId, type, contentText, mediaUri, transcriptionText,
  timestamp, sentimentScore, extendedData, title, is_favorite,
  ai_sentiment, ai_intensity, ai_confidence, ai_tags
`;

// ─── Stalk CRUD ───────────────────────────────────────────────────────────────

/** Returns all stalks ordered by rowid (creation order). */
export async function fetchAllStalks(): Promise<StalkRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<StalkRow>(
    'SELECT id, name, themeType, isPremium FROM stalks ORDER BY rowid ASC'
  );
  return rows.map(rowToStalk);
}

/** Inserts a new stalk row. Throws if the id already exists. */
export async function insertStalk(stalk: StalkRecord): Promise<StalkRecord> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO stalks (id, name, themeType, isPremium) VALUES (?, ?, ?, ?)',
    [stalk.id, stalk.name, stalk.themeType, stalk.isPremium ? 1 : 0]
  );
  return stalk;
}

/** Updates the name, theme, or premium flag of an existing stalk. */
export async function updateStalk(
  id: string,
  patch: Partial<Pick<StalkRecord, 'name' | 'themeType' | 'isPremium'>>
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (patch.name !== undefined) { sets.push('name = ?'); values.push(patch.name); }
  if (patch.themeType !== undefined) { sets.push('themeType = ?'); values.push(patch.themeType); }
  if (patch.isPremium !== undefined) { sets.push('isPremium = ?'); values.push(patch.isPremium ? 1 : 0); }

  if (sets.length === 0) return;

  values.push(id);
  await db.runAsync(`UPDATE stalks SET ${sets.join(', ')} WHERE id = ?`, values);
}

/** Deletes a stalk and all its beans (CASCADE). */
export async function deleteStalk(id: string): Promise<void> {
  if (id === DEFAULT_STALK_ID) {
    throw new Error('Cannot delete the default stalk.');
  }
  const db = await getDb();
  await db.runAsync('DELETE FROM stalks WHERE id = ?', [id]);
}

// ─── Bean CRUD ────────────────────────────────────────────────────────────────

/**
 * Returns all beans for a given stalk, ordered oldest → newest.
 * Maps raw SQLite rows to the full typed Bean interface.
 */
export async function fetchBeansForStalk(stalkId: string): Promise<Bean[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BeanRow>(
    `SELECT ${BEAN_COLS} FROM beans WHERE stalkId = ? ORDER BY timestamp ASC`,
    [stalkId]
  );
  return rows.map(rowToBean);
}

/**
 * Inserts a new bean, auto-generates its id, and returns the persisted Bean.
 * Throws if the referenced stalkId does not exist.
 */
export async function insertBean(bean: Omit<Bean, 'id'>): Promise<Bean> {
  const db = await getDb();
  const id = generateId();
  const row = beanToRow(id, bean);

  await db.runAsync(
    `INSERT INTO beans
       (id, stalkId, type, contentText, mediaUri, transcriptionText,
        timestamp, sentimentScore, extendedData, title, is_favorite,
        is_synced, sync_pending_at,
        ai_sentiment, ai_intensity, ai_confidence, ai_tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.stalkId,
      row.type,
      row.contentText,
      row.mediaUri,
      row.transcriptionText,
      row.timestamp,
      row.sentimentScore,
      row.extendedData,
      row.title,
      row.is_favorite,
      Date.now(),
      row.ai_sentiment,
      row.ai_intensity,
      row.ai_confidence,
      row.ai_tags,
    ]
  );

  return { ...bean, id };
}

/**
 * Partially updates mutable fields on an existing bean (e.g. transcription
 * completing after a voice bean was already inserted).
 */
export async function updateBean(
  id: string,
  patch: Partial<
    Pick<
      Bean,
      | 'transcription'
      | 'transcriptionStatus'
      | 'caption'
      | 'title'
      | 'tags'
      | 'safeShakeHidden'
      | 'vinePositionOffset'
      | 'isFavorite'
      | 'aiSentiment'
      | 'aiIntensity'
      | 'aiConfidence'
      | 'aiTags'
    >
  >
): Promise<void> {
  const db = await getDb();

  // Merge patch into the existing extendedData blob.
  const existing = await db.getFirstAsync<Pick<BeanRow, 'extendedData' | 'transcriptionText'>>(
    'SELECT extendedData, transcriptionText FROM beans WHERE id = ?',
    [id]
  );
  if (!existing) throw new Error(`Bean not found: ${id}`);

  const extended: BeanExtendedData = existing.extendedData
    ? (JSON.parse(existing.extendedData) as BeanExtendedData)
    : {};

  if (patch.transcriptionStatus !== undefined) extended.transcriptionStatus = patch.transcriptionStatus;
  if (patch.caption !== undefined) extended.caption = patch.caption;
  if (patch.tags !== undefined) extended.tags = patch.tags;
  if (patch.safeShakeHidden !== undefined) extended.safeShakeHidden = patch.safeShakeHidden;
  if (patch.vinePositionOffset !== undefined) extended.vinePositionOffset = patch.vinePositionOffset;
  extended.updatedAt = Date.now();

  const newTranscription =
    patch.transcription !== undefined ? patch.transcription : (existing.transcriptionText ?? null);

  // Build UPDATE dynamically so we only touch columns when values are provided.
  const values: (string | number | null)[] = [newTranscription, JSON.stringify(extended)];
  let sql = 'UPDATE beans SET transcriptionText = ?, extendedData = ?';
  if (patch.title !== undefined) {
    sql += ', title = ?';
    values.push(patch.title ?? null);
  }
  if (patch.isFavorite !== undefined) {
    sql += ', is_favorite = ?';
    values.push(patch.isFavorite ? 1 : 0);
  }
  if (patch.aiSentiment !== undefined) {
    sql += ', ai_sentiment = ?';
    values.push(patch.aiSentiment ?? null);
  }
  if (patch.aiIntensity !== undefined) {
    sql += ', ai_intensity = ?';
    values.push(patch.aiIntensity ?? null);
  }
  if (patch.aiConfidence !== undefined) {
    sql += ', ai_confidence = ?';
    values.push(patch.aiConfidence ?? null);
  }
  if (patch.aiTags !== undefined) {
    sql += ', ai_tags = ?';
    values.push(patch.aiTags ? JSON.stringify(patch.aiTags) : null);
  }
  sql += ' WHERE id = ?';
  values.push(id);

  await db.runAsync(sql, values);
}

/**
 * Marks a bean as successfully synced to the cloud.
 * Called by the sync engine after a successful Supabase upsert.
 */
export async function markBeanSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE beans SET is_synced = 1, sync_pending_at = NULL WHERE id = ?',
    [id]
  );
}

/**
 * Returns all beans that have not yet been pushed to the cloud.
 * Optionally scoped to a single stalk for targeted retry sweeps.
 */
export async function fetchUnsyncedBeans(stalkId?: string): Promise<Bean[]> {
  const db = await getDb();
  const rows = stalkId
    ? await db.getAllAsync<BeanRow>(
        `SELECT ${BEAN_COLS} FROM beans WHERE is_synced = 0 AND stalkId = ? ORDER BY timestamp ASC`,
        [stalkId]
      )
    : await db.getAllAsync<BeanRow>(
        `SELECT ${BEAN_COLS} FROM beans WHERE is_synced = 0 ORDER BY timestamp ASC`
      );
  return rows.map(rowToBean);
}

/** Hard-deletes a bean by id. */
export async function deleteBean(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM beans WHERE id = ?', [id]);
}

/** Returns all favourited beans for a stalk, ordered oldest → newest. */
export async function fetchFavoriteBeans(stalkId: string): Promise<Bean[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BeanRow>(
    `SELECT ${BEAN_COLS} FROM beans WHERE stalkId = ? AND is_favorite = 1 ORDER BY timestamp ASC`,
    [stalkId]
  );
  return rows.map(rowToBean);
}

/**
 * Returns a single random bean from a stalk, excluding any marked
 * safeShakeHidden. Used by the Shake mechanic.
 */
export async function fetchRandomBean(
  stalkId: string,
  excludeId?: string
): Promise<Bean | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BeanRow>(
    `SELECT ${BEAN_COLS} FROM beans
     WHERE stalkId = ?
       AND (extendedData IS NULL OR extendedData NOT LIKE '%"safeShakeHidden":true%')
       ${excludeId ? 'AND id != ?' : ''}
     ORDER BY RANDOM()
     LIMIT 1`,
    excludeId ? [stalkId, excludeId] : [stalkId]
  );
  return row ? rowToBean(row) : null;
}
