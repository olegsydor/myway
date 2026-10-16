# Stage 12 — Frontend default layout, save, dirty state, discard

Base backend checkpoint: e30cc60. Migration remains c12a01e4b901.
This is the frontend save/discard checkpoint, not the end of Stage 12.

## Files to copy individually

Replace:

- poc/graph-visualization/package.json (only the test command changes)
- poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx

Add:

- poc/graph-visualization/src/react-flow/usePersistentLayout.ts
- poc/graph-visualization/src/shared/layoutApi.ts
- poc/graph-visualization/src/shared/persistentLayouts.ts
- poc/graph-visualization/tests/persistentLayouts.test.ts
- docs/stage-12-frontend-save.md

No new dependencies or migrations are required. package-lock.json is unchanged.

## Behavior

The Saved layout group appears at the top of the existing sidebar.
Startup lists layouts and loads the default. If metadata has no default but layouts
exist, the oldest ID is opened with an explanatory notice. A load error blocks
coordinate editing and persistence until Retry succeeds, preventing accidental
writes over a layout that failed to load.

With no layouts, existing automatic startup positioning remains unsaved.
Save layout creates Main; the backend marks the first layout default.
Later saves PUT the complete working coordinate snapshot, including hidden nodes.
No movement/selection/filter operation automatically saves coordinates.

Dirty state compares current coordinates with the accepted server snapshot,
using an absolute 1e-6 coordinate tolerance. Returning to a saved coordinate
clears dirty. Hidden-node movement is included. Deleted nodes do not require
resaving; missing positions for newly created nodes remain dirty.

Discard restores saved positions and applies a complete-graph Dagre fallback
only to nodes lacking saved positions. It keeps node visibility, selection and
manual group membership; new nodes still require a save. After restoring,
fitView fits visible nodes without changing graph coordinates.

During save, synchronous guards plus disabled controls block coordinate changes
and graph CRUD. Save is disabled during graph CRUD and node dragging, or while
frontend IDs are not reconciled with the loaded graph. Failures retain working
coordinates and the previous saved baseline. Refresh graph is available after
save errors; Stage 11 reconciliation keeps existing positions and adds/removes
nodes to reflect current graph data before retrying a stale snapshot.

Grid/Circle/Dagre remain local edits and ask before replacing dirty coordinates.
A standard beforeunload listener exists while a ready/saving layout is dirty.
It is removed after save/discard to a complete baseline. Browser prompt behavior
is platform-dependent; no browser-local persistence is introduced.

## Verification

```bash
cd ~/Projects/myway/poc/graph-visualization
npm test
npm run build
```

Expected: 37 tests (20 existing + 17 new).

Completed locally:

- 37 node tests, including 502-node restore, hidden coordinates, new/deleted
  nodes, finite coordinates, snapshot readiness and dirty comparison.
- TypeScript and production build.
- React hook smoke checks with mocked API: default bootstrap; dirty/beforeunload
  lifecycle; failed save retention; discard; duplicate-save/in-flight guard;
  hidden full snapshot; successful save; graph-busy guard; missing-node discard;
  load failure/retry; first-save POST Main.

Hook smoke checks used temporary local test tooling; no test dependencies are
added to the project. Browser behavior on the real graph still needs checking.
The lint command reports React advisory warnings, including the effect that
synchronizes externally loaded positions with the controlled canvas; no lint
errors block the build.

## Manual acceptance on the real graph

1. Run the frontend as usual. With no layouts, expect Unsaved initial layout.
2. Save layout: expect Main and Saved. Reload: positions must match.
3. Drag one node: expect Unsaved changes. Discard: original position and Saved.
4. Move a branch/manual group, including hidden members; save and reload.
5. Filter out nodes, save a movement, remove the filter, and check coordinates.
6. Apply an automatic layout: expect dirty; Discard restores the saved arrangement.
7. Create a node: dirty. Discard must retain the node and remain dirty until Save.
8. Delete a saved node: remaining positions stay unchanged; deletion alone is clean.
9. Trigger a save failure: positions and dirty remain; retry works after recovery.
10. While dirty, test reload/leave warning in Safari and Chrome where supported.

## Next checkpoint

Active-layout selector, Save as new layout, rename, set default, delete, and
Save/Discard/Cancel switching protection. Then full Stage 10/11 regression and
real-graph evaluation. Stage 12 is not complete until those steps pass.
