# Stage 12 — Multiple-layout management

Base: c70bf25. Backend: e30cc60. Alembic: c12a01e4b901.
This checkpoint adds the multiple-layout workflow. Real-graph acceptance remains
required before the stage is complete.

## Install files individually

Replace these existing files:

- poc/graph-visualization/package.json
- poc/graph-visualization/src/App.css
- poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx
- poc/graph-visualization/src/react-flow/usePersistentLayout.ts
- poc/graph-visualization/src/shared/layoutApi.ts

Add these new files:

- poc/graph-visualization/src/react-flow/LayoutControls.tsx
- poc/graph-visualization/tests/layoutApi.test.ts
- docs/stage-12-layout-management.md

No new dependencies, lockfile changes, backend changes, or migrations.

```bash
cd ~/Projects/myway
git status --short
git diff --check
cd poc/graph-visualization
npm test
npm run build
```

Expected: 45 frontend tests. Existing backend suite remains 83 tests.

## Controls and workflow

- Active-layout selector marks the default and changes active identity only after
  successful target loading.
- Save as new layout opens a name dialog, POSTs the full current working snapshot,
  activates the accepted new identity, and leaves the old server snapshot unchanged.
- Manage layout contains Rename, Set as default, and Delete layout.
- Rename and default updates preserve the separate saved coordinate baseline and
  the current dirty coordinates. Only accepted metadata is displayed.
- Set as default applies to the active layout; startup opens that default on reload.
- Default/only layout deletion is disabled and remains rejected by the backend.
- Deletion asks for confirmation. If dirty, the explicit confirmation is Delete
  and discard changes; the user can cancel and use Save as new first to retain work.

Dirty switching offers Save and switch / Discard and switch / Cancel.
A failed save prevents the target GET. A failed target GET leaves the old layout
and working coordinates in place. If saving succeeded before the target GET
failed, the old layout remains active and clean: its coordinates were saved.
The dialog then offers Open layout to retry without an unnecessary resave.

Deleting an active non-default layout first fetches the default destination.
If that fetch fails, DELETE is not sent. DELETE must then succeed before the
canvas or active layout changes. The default layout opens after success.

Changing layout clears branch and manual-group membership, preserving filters
and ordinary node editing selection. Saved/fallback positions apply to the full
node state, including hidden nodes. fitView fits visible nodes after a switch;
viewport is not persisted. Graph data is never changed by layout operations.

The native dialog prevents pointer/focus interaction with the graph behind it.
The branch arrow-key listener also ignores events originating inside a dialog.
While an API request runs, coordinate editing/graph CRUD and duplicate submissions
are blocked. Dirty beforeunload protection remains active through management
and switching requests until the working coordinates are saved or replaced.

## Local validation

- 45 node tests passed, including eight additional layout API-client tests.
- TypeScript and production build passed using the unchanged locked dependencies.
- Lint exited successfully with React advisory warnings; these include the
  existing effect that applies external saved coordinates to the controlled canvas.
- React-hook smoke checks with mocked API passed for the previous Save/Discard
  workflow and for Save as new isolation, metadata dirty preservation, name
  conflicts, cancellation, all switch outcomes, selection-reset callback, deletion
  prefetch/failure/success, and default-deletion protection.
- LayoutControls component smoke checks passed for clean/dirty selection,
  cancellation without requests, trimmed naming, failed form submission retention,
  and explicit dirty deletion. Native dialog methods were mocked in that check;
  real-browser behavior must still be verified.

Temporary local React test tooling was not added as a project dependency.
The reusable node tests are included in the normal npm test command.

## Real-graph acceptance checklist

1. From Main, Save as new layout named Alternative. It becomes active and clean;
   Main remains the default.
2. Apply Grid/Circle/Dagre to Alternative and save. Switch between layouts and
   confirm their arrangements are independent, including filtered/hidden nodes.
3. Move a node, attempt a switch, and Cancel: current layout/coordinates stay.
4. Repeat with Discard and switch: old saved arrangement remains unchanged.
5. Repeat with Save and switch: returning to the old layout restores the movement.
6. Rename the active layout while dirty: identity and positions remain; dirty stays.
   Try a duplicate name and verify that the old name/coordinates remain.
7. Set Alternative as default and reload: Alternative opens. Select Main to return.
8. From a non-default layout, Delete layout and cancel once; then confirm deletion.
   The default opens, graph nodes/edges remain, and the deleted entry disappears.
9. Test movement/save/reload of a large manual group and the entire 500+ node graph.
10. With filters active, move hidden branch/manual-group members and save/reload;
    removing the filter shows their updated saved coordinates.
11. Add a node, visit every layout, and verify missing-position fallback + dirty.
    Discard retains the node and dirty state; save includes the new position.
12. Delete a disposable node and check safe cleanup across layouts. Editing node
    metadata/edges should preserve the remaining coordinates and dirty state.
13. Test failure/retry and browser-leave protection where practical; record Safari
    and Chrome reload behavior and perceived save/switch responsiveness.

Record actual real-graph observations and any remaining limitations before the
final Stage 12 checkpoint. Autosave, annotations, viewport persistence, history,
and multi-client coordination remain excluded.
