import { supabase } from '@src/lib/supabase';
import { fetchUnsyncedBeans, markBeanSynced } from './db';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

// Placeholder until Clerk auth lands in Phase 3. At that point replace with
// the authenticated user's ID and add a WHERE user_id = auth.uid() RLS policy.
const PLACEHOLDER_USER_ID = 'local-dev-user';

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

    // Voice bean
    audio_uri:              bean.audioUri ?? null,
    audio_duration_seconds: bean.audioDurationSeconds ?? null,
    transcription:          bean.transcription ?? null,
    transcription_status:   bean.transcriptionStatus ?? null,

    // Photo bean
    image_uri:     bean.imageUri ?? null,
    thumbnail_uri: bean.thumbnailUri ?? null,

    // Scan bean
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
    is_nutrient_split:                    bean.isNutrientSplit ?? false,
    nutrient_split_primary_stalk_id:   bean.nutrientSplit?.primaryStalkId ?? null,
    nutrient_split_secondary_stalk_id: bean.nutrientSplit?.secondaryStalkId ?? null,
    nutrient_split_primary_weight:     bean.nutrientSplit?.primaryWeight ?? null,
  };
}

// ─── Single-bean sync ─────────────────────────────────────────────────────────

/**
 * Upserts one bean to Supabase using last-write-wins on `updated_at`.
 * On success, flips `is_synced = 1` in local SQLite immediately.
 * On any network/API failure, swallows the error and leaves `is_synced = 0`
 * so the pending-sweep can retry when connectivity returns.
 */
export async function syncLocalBeanToCloud(bean: Bean): Promise<void> {
  try {
    const { error } = await supabase
      .from('beans')
      .upsert(beanToCloudRecord(bean), { onConflict: 'id' });

    if (error) throw error;

    await markBeanSynced(bean.id);
  } catch (err) {
    // Offline or transient failure — local commit already succeeded.
    // The pending sweep will retry once connectivity is restored.
    console.warn('[Sync] bean upload deferred:', err);
  }
}

// ─── Retry sweep ──────────────────────────────────────────────────────────────

/**
 * Sweeps all unsynced beans (optionally filtered to one stalk) and pushes
 * each to Supabase. Returns a tally of how many succeeded vs. failed.
 *
 * Call this on app foreground or NetInfo reconnect events.
 */
export async function syncPendingBeans(
  stalkId?: string
): Promise<{ synced: number; failed: number }> {
  const pending = await fetchUnsyncedBeans(stalkId);
  let synced = 0;
  let failed = 0;

  for (const bean of pending) {
    try {
      const { error } = await supabase
        .from('beans')
        .upsert(beanToCloudRecord(bean), { onConflict: 'id' });

      if (error) throw error;

      await markBeanSynced(bean.id);
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
