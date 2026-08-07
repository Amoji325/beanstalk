// ─── Tree identity ────────────────────────────────────────────────────────────
//
// A "tree" is the user's whole collection of branches. Its name lives in Clerk
// `unsafeMetadata.treeName` (client-writable, syncs across devices). These pure
// helpers derive/validate the name without importing React or Clerk, so they are
// unit-testable and reusable from both the UI and tests.

export const TREE_NAME_MAX = 32;

export interface TreeUserLike {
  firstName?: string | null;
  fullName?: string | null;
  username?: string | null;
  unsafeMetadata?: Record<string, unknown> | null;
}

/** A sensible default tree name derived from the user's name. */
export function defaultTreeName(user: TreeUserLike | null | undefined): string {
  const first = user?.firstName?.trim() || user?.fullName?.trim()?.split(' ')[0] || user?.username?.trim();
  return first ? `${first}'s Tree` : 'My Tree';
}

/** The user's chosen tree name, falling back to a derived default. */
export function resolveTreeName(user: TreeUserLike | null | undefined): string {
  const stored = user?.unsafeMetadata?.treeName;
  if (typeof stored === 'string' && stored.trim().length > 0) {
    return stored.trim();
  }
  return defaultTreeName(user);
}

/** Normalises a user-entered tree name (trim + clamp length). Empty → null. */
export function sanitizeTreeName(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, TREE_NAME_MAX);
}
