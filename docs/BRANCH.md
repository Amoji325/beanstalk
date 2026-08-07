# Branch — the tree-of-branches pivot

**Branch** reframes the app around a single **tree** per user, with named
**branches** growing from it (Morning Journal, Going Out, Difficult Times,
Hobbies…). Opening a branch reveals its chronological timeline of memories
(leaves). It's the same journaling engine as the original **Beanstalk**,
re-navigated so memories are easy to sort and find as they grow.

---

## Phase status

- **Phase 1 — shipped:** Tree home, tap-to-open a branch, back-to-tree, branch
  create/delete, tree naming, and the Beanstalk → Branch rebrand.
- **Visual overhaul — shipped:**
  - A **night-sky Tree home** — deterministic starfield, occasional **shooting
    stars**, a moon, a soft **horizon glow** (stacked low-alpha bands, no hard
    edge), a textured trunk, root flare, and a leafy crown (all drawn with
    Views; no native deps). The layout reserves fixed top headroom
    (`topPadding`) so tall trees never tuck their top branch under the header.
  - A **horizontal branch timeline** — opening a branch reveals a wood stem with
    memories hanging as leaves that alternate above/below, oldest → newest, and
    it lands on the newest memory.
- **Phase 2 — shipped:** an animated **zoom** — tapping a branch flies the tree
  *into* it (pivoting on the exact tap point) while the timeline grows in and the
  tree fades out; **back** reverses it. The transition math is the tested
  `zoomTransition.ts`; `RootShell` drives it and mounts both layers only during
  the animation.
- **Later:** branch growth animations and a bean → leaf terminology pass.

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

- **`src/screens/RootShell.tsx`** — owns the tree ⇄ branch **zoom** and the
  shared account menu. `openBranch(id, x, y)` sets the active stalk, mounts the
  branch, and animates the zoom (pivoting on the tap point); `backToTree()`
  reverses it. Only the settled layer is mounted at rest.
- **`src/screens/tree/TreeHome.tsx`** — draws the trunk + branches, each branch a
  tappable node tinted by its biome, showing its memory count. Long-press a
  branch to delete it. Header: account avatar (left), tree name (center, tap to
  rename), and **+** to grow a new branch.
- **`src/components/BranchTimeline.tsx`** — the **horizontal** branch timeline
  that renders inside a branch (a drop-in for the old vertical `HistoryVine`,
  same props + `scrollToBean` handle). Reuses `HistoryVine`'s exported colour +
  format helpers for consistent theming.
- **Pure, deterministic, unit-tested engines** in `src/screens/tree/`:
  - `branchLayout.ts` — the Tree home geometry (trunk + branches, grounded base).
  - `branchTimelineLayout.ts` — the horizontal timeline (stem baseline, leaves
    alternating up/down at a fixed spacing).
  - `starfield.ts` — a seeded-PRNG starfield for the night sky.
  - `zoomTransition.ts` — the tree ⇄ branch zoom interpolation (scale + opacity).
  - `treeIdentity.ts` — deriving/resolving/sanitizing the tree name.
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

**39 tests across 5 pure engines:**

- `branchLayout.test.ts` — tree geometry: count, alternating sides, upward
  growth, symmetry, height/trunk math, grounded base, constant top headroom,
  determinism.
- `branchTimelineLayout.test.ts` — horizontal layout: count, up/down alternation,
  spacing, node offsets, centred stem, content width, determinism.
- `starfield.test.ts` — seeded determinism, count, in-bounds placement.
- `zoomTransition.test.ts` — endpoints, clamping, monotonic crossover.
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
