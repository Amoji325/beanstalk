# Branch — the tree-of-branches pivot

**Branch** reframes the app around a single **tree** per user, with named
**branches** growing from it (Morning Journal, Going Out, Difficult Times,
Hobbies…). Opening a branch reveals its chronological timeline of memories
(leaves). It's the same journaling engine as the original **Beanstalk**,
re-navigated so memories are easy to sort and find as they grow.

---

## Phase status

- **Phase 1 (this branch) — shipped:** the Tree home screen, tap-to-open a
  branch, back-to-tree, branch create/delete, tree naming, and the Beanstalk →
  Branch rebrand. Backed by a tested layout engine.
- **Phase 2 — next:** an animated *zoom* transition from the tapped branch into
  its timeline (currently a clean cross-fade).
- **Phase 3 — later:** horizontal timeline reorientation, branch growth
  animations, and broader UI/UX polish.

## The key mapping: branches ARE stalks

The original app already supported multiple named, themed collections called
**stalks**. Phase 1 reuses that data model verbatim — no migration, no schema
change:

| Branch concept        | Backed by                                             |
| --------------------- | ----------------------------------------------------- |
| A **branch**          | a `StalkRecord` (`id`, `name`, `themeType`)           |
| A branch's **memories** (leaves) | `beans` rows with that `stalkId`           |
| The **tree** (all branches) | the user's set of stalks (`StalkContext`)       |
| The **tree name**     | Clerk `unsafeMetadata.treeName` (syncs across devices)|

Existing users' stalks simply appear as branches on their tree.

## Architecture

```
App → RootGate (Clerk) → StalkProvider → RootShell
                                          ├─ view = 'tree'   → TreeHome
                                          ├─ view = 'branch' → MainContainer (timeline + capture)
                                          └─ AccountMenu (shared overlay)
```

- **`src/screens/RootShell.tsx`** — owns `view` ('tree' | 'branch') and the
  shared account menu. `openBranch(id)` sets the active stalk and switches to the
  branch view; `backToTree()` returns.
- **`src/screens/tree/TreeHome.tsx`** — draws the trunk + branches, each branch a
  tappable node tinted by its biome, showing its memory count. Long-press a
  branch to delete it. Header: account avatar (left), tree name (center, tap to
  rename), and **+** to grow a new branch.
- **`src/screens/tree/branchLayout.ts`** — the **pure, deterministic** layout
  engine. `computeTreeLayout({ width, count, … })` returns trunk bounds and each
  branch's attach/tip/mid points + rotation. Fully unit-tested; no React.
- **`src/screens/tree/treeIdentity.ts`** — pure helpers for deriving,
  resolving, and sanitizing the tree name. Unit-tested.
- **`src/components/BranchHeader.tsx`** — the top pill inside a branch that
  returns to the tree (replaces the old stalk dropdown).
- **`src/components/CreateBranchForm.tsx`** — the "grow a branch" modal
  (name + theme), reusable from the tree.
- **`src/database/db.ts` → `fetchBeanCountsByStalk()`** — per-branch memory
  counts for the tree.

### Data flow for counts

`TreeHome` calls `fetchBeanCountsByStalk()` on mount (i.e. every time you return
to the tree), so counts stay fresh after adding/removing memories in a branch.

## Tests

```
npm test          # run once
npm run test:watch
```

- `branchLayout.test.ts` — 12 cases: branch count, alternating sides, upward
  growth, left/right symmetry, height/trunk math, the grounded base, and
  determinism.
- `treeIdentity.test.ts` — default/resolve/sanitize name behavior.

Test files are excluded from the app's `tsc` build and run under `jest-expo`.

## Returning to the original "Beanstalk" version

The pre-pivot app is preserved and pushed to GitHub. From the repo root:

```bash
# Look at it without changing anything:
git checkout beanstalk-version      # branch snapshot of the Beanstalk app
#   …or the tag:
git checkout beanstalk-v1

# Go back to the pivot work:
git checkout branch-pivot

# Run either version's app the usual way:
npx expo start --dev-client
```

`beanstalk-version` (branch) and `beanstalk-v1` (tag) both point at the exact
commit of the app before the pivot. Nothing about the pivot overwrites them.

## What Phase 1 intentionally keeps for later

- Memories are still called **"beans"** in the UI/code (e.g. "Plant Bean"). A
  bean→leaf terminology sweep is a low-risk follow-up.
- The branch timeline is still **vertical**; the horizontal reorientation is a
  Phase 3 visual, not a functional requirement.
- The tree → branch transition is a cross-fade; the *zoom* is Phase 2.
