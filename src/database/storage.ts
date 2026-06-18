import { supabase } from '@src/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaFolder = 'photos' | 'audio';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts the file extension from a URI, lower-cased, without the dot. */
function extractExtension(uri: string): string {
  // Strip query-string / fragment before matching, e.g. "...jpg?token=…"
  const path = uri.split('?')[0].split('#')[0];
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Maps a file extension + folder to an explicit MIME type.
 * expo-image-picker returns JPEG at quality 0.92; expo-audio HIGH_QUALITY
 * records .m4a (AAC inside an MPEG-4 container) on iOS.
 */
function contentTypeFor(ext: string, folder: MediaFolder): string {
  if (folder === 'photos') {
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
    };
    return map[ext] ?? 'image/jpeg';
  }
  // audio
  const map: Record<string, string> = {
    m4a: 'audio/m4a',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    caf: 'audio/x-caf',
  };
  return map[ext] ?? 'audio/m4a';
}

/** Generates a collision-safe storage path inside the given folder. */
function buildStoragePath(folder: MediaFolder, ext: string): string {
  // UUID v4 without external deps — mirrors the pattern already in db.ts
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  const fallbackExt = folder === 'photos' ? 'jpg' : 'm4a';
  return `${folder}/${uuid}.${ext || fallbackExt}`;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Uploads a local device file to Supabase Storage and returns its public URL.
 *
 * Uses `fetch()` to read the file as a Blob — the only portable approach in
 * React Native (no Node.js `fs` module, no Buffer polyfill needed).
 *
 * The bucket 'bean-assets' must already exist in Supabase and be set to
 * "Public" so `getPublicUrl` returns a directly accessible URL.
 *
 * @param localUri - A `file://` URI from expo-image-picker or expo-audio.
 * @param folder   - Determines the bucket sub-path and default MIME type.
 * @returns        The permanent public HTTPS URL of the uploaded asset.
 * @throws         If the local file cannot be read or the upload is rejected.
 */
export async function uploadMediaFile(
  localUri: string,
  folder: MediaFolder
): Promise<string> {
  // ── 1. Read local file → Blob ──────────────────────────────────────────────
  // fetch() in React Native / Expo handles file:// URIs natively.
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error(`[Storage] Could not read local file (${response.status}): ${localUri}`);
  }
  const blob = await response.blob();

  // ── 2. Determine content type and storage path ─────────────────────────────
  const ext = extractExtension(localUri);
  const contentType = contentTypeFor(ext, folder);
  const storagePath = buildStoragePath(folder, ext);

  // ── 3. Upload to Supabase Storage ─────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from('bean-assets')
    .upload(storagePath, blob, {
      contentType,
      upsert: false, // collision-safe UUIDs; never silently overwrite
    });

  if (uploadError) {
    throw new Error(`[Storage] Upload failed: ${uploadError.message}`);
  }

  // ── 4. Resolve and return the permanent public URL ─────────────────────────
  const { data } = supabase.storage
    .from('bean-assets')
    .getPublicUrl(storagePath);

  return data.publicUrl;
}
