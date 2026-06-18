import { supabase } from '@src/lib/supabase';
import { fetchUnsyncedBeans, markBeanSynced } from './db';
import { uploadMediaFile } from './storage';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

// Placeholder until Clerk auth lands in Phase 3. At that point replace with
// the authenticated user's ID and add a WHERE user_id = auth.uid() RLS policy.
const PLACEHOLDER_USER_ID = 'local-dev-user';

// ─── Local URI detection ──────────────────────────────────────────────────────

/**
 * Returns true for URIs that point to a local device file and must be uploaded
 * before the bean record can be written to the cloud database.
 * - file://  — standard local filesystem path (expo-audio, expo-image-picker)
 * - ph://    — iOS Photos library reference (expo-image-picker picker mode)
 */
function isLocalUri(uri: string | undefined): uri is string {
  if (!uri) return false;
  return uri.startsWith('file://') || uri.startsWith('ph://');
}

// ─── Media resolution ─────────────────────────────────────────────────────────

/**
 * For every media field on a bean that holds a local device URI, upload the
 * file to Supabase Storage and swap the local path for the permanent CDN URL.
 * Fields already holding https:// URLs (previously synced) are left untouched.
 * Throws if any upload fails — the caller's try/catch keeps is_synced = 0.
 */
async function resolveMediaUris(bean: Bean): Promise<Bean> {
  const resolved = { ...bean };

  if (isLocalUri(bean.audioUri)) {
    resolved.audioUri = await uploadMediaFile(bean.audioUri, 'audio');
  }
  if (isLocalUri(bean.imageUri)) {
    resolved.imageUri = await uploadMediaFile(bean.imageUri, 'photos');
  }
  if (isLocalUri(bean.thumbnailUri)) {
    resolved.thumbnailUri = await uploadMediaFile(bean.thumbnailUri, 'photos');
  }
  if (isLocalUri(bean.scanThumbnailUri)) {
    resolved.scanThumbnailUri = await uploadMediaFile(bean.scanThumbnailUri, 'photos');
  }

  return resolved;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function beanToCloudRecord(bean: Bean) {
  return {
    id:           bean.id,
    stalk_id:     bean.stalkId,
    type:         bean.type,
    anatomy_role: bean.anatomyRole,
    // Supabase expects ISO-8601; local stores Unix ms.
    created_at:   new Date(bean.createdAt).toISOString(),
    // Last-write-wins anchor — always set so future bidirectional sync can compare.
    updated_at:   new Date(bean.updatedAt ?? bean.createdAt).toISOString(),
    user_id:      PLACEHOLDER_USER_ID,

    // Type bean
    text_content: bean.textContent ?? null,

    // Voice bean — URI is a CDN URL at this point (resolveMediaUris ran first)
    audio_uri:              bean.audioUri ?? null,
    audio_duration_seconds: bean.audioDurationSeconds ?? null,
    transcription:          bean.transcription ?? null,
    transcription_status:   bean.transcriptionStatus ?? null,

    // Photo bean — same guarantee
    image_uri:     bean.imageUri ?? null,
    thumbnail_uri: bean.thumbnailUri ?? null,

    // Scan bean — same guarantee
    scanned_text:       bean.scannedText ?? null,
    scan_thumbnail_uri: bean.scanThumbnailUri ?? null,

    // Cross-cutting metadata
    title:               bean.title ?? null,
    is_favorite:         bean.isFavorite ?? false,
    caption:             bean.caption ?? null,
    language_code:       bean.languageCode ?? null,
    tags:                bean.tags ?? [],
    safe_shake_hidden:   bean.safeShakeHidden ?? false,
    vine_position_offset: bean.vinePositionOffset ?? null,

    // Nutrient split (flattened)
    is_nutrient_split:                 bean.isNutrientSplit ?? false,
    nutrient_split_primary_stalk_id:   bean.nutrientSplit?.primaryStalkId ?? null,
    nutrient_split_secondary_stalk_id: bean.nutrientSplit?.secondaryStalkId ?? null,
    nutrient_split_primary_weight:     bean.nutrientSplit?.primaryWeight ?? null,
  };
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * The unified sync pipeline for a single bean:
 *   1. Upload any local media files → swap in CDN URLs
 *   2. Upsert the record (with permanent URLs) to Supabase
 *   3. Flip is_synced = 1 in local SQLite
 *
 * Throws on any failure so callers can leave is_synced = 0 for retry.
 */
async function pushBeanToCloud(bean: Bean): Promise<void> {
  const resolved = await resolveMediaUris(bean);

  const { error } = await supabase
    .from('beans')
    .upsert(beanToCloudRecord(resolved), { onConflict: 'id' });

  if (error) throw error;

  await markBeanSynced(bean.id);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Syncs one bean to the cloud. Intended as a fire-and-forget call immediately
 * after a successful local insert — keeps the UI instant.
 * On any failure (offline, storage error, DB error) leaves is_synced = 0
 * so the pending sweep retries the full pipeline when connectivity returns.
 */
export async function syncLocalBeanToCloud(bean: Bean): Promise<void> {
  try {
    await pushBeanToCloud(bean);
  } catch (err) {
    console.warn('[Sync] bean deferred (will retry):', err);
  }
}

/**
 * Sweeps all unsynced beans (optionally scoped to one stalk) through the full
 * upload + upsert pipeline. Returns a tally of synced vs. deferred.
 *
 * Call this on app foreground or network reconnect events.
 */
export async function syncPendingBeans(
  stalkId?: string
): Promise<{ synced: number; failed: number }> {
  const pending = await fetchUnsyncedBeans(stalkId);
  let synced = 0;
  let failed = 0;

  for (const bean of pending) {
    try {
      await pushBeanToCloud(bean);
      synced++;
    } catch {
      failed++;
    }
  }

  if (pending.length > 0) {
    console.log(`[Sync] sweep complete — ${synced} synced, ${failed} deferred`);
  }

  return { synced, failed };
}
