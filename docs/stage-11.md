# Stage 11 — Manual Node Groups

## Goal

Complement Stage 10 branch movement with arbitrary manual node groups.

Allow users to form, refine, and move groups independently of graph
topology, including members hidden by filters.

## Starting point

- Commit: `1ec7d2d Add DAG validation and branch movement prototype`.
- React Flow is the production graph renderer.
- Backend remains the source of truth for nodes and edges.
- Group membership and coordinates remain frontend-only.
- No backend endpoints or database migrations were added.

## Manual selection

Ctrl/Cmd + click toggles node membership.

- The first member creates a valid one-node group.
- Removing the final member ends manual-group mode.
- Duplicate membership is prevented.
- Ordinary node clicks retain editing behavior without changing membership.
- Clicking empty canvas preserves the manual group.
- Clear group removes membership without reverting coordinates.

Visible members have green borders. The counter displays total,
visible, and hidden membership.

## Rectangle selection

- Shift + drag on empty canvas replaces the manual group.
- Ctrl/Cmd + Shift + drag adds captured nodes.
- Ordinary empty-canvas drag continues to pan.
- Partial intersection with a rendered node rectangle is sufficient.
- Only rendered, filter-visible nodes can be captured.
- A 5-pixel drag threshold distinguishes a rectangle from a click.
- Empty replacement clears the group.
- Empty additive selection preserves membership.
- Replacement removes previous hidden members.
- Additive selection preserves previous hidden members.

Pointer capture supports completing the gesture beyond its starting area.
Rendered DOM bounds and pointer coordinates use the same screen space,
accounting for viewport pan and zoom.

React Flow's native rectangle and modifier-based multiselection are
disabled to avoid competing with manual-group interactions.

## Branch conversion and mode exclusion

Branch selection and manual-group mode are mutually exclusive.

- Manual membership gestures are unavailable during branch selection.
- Convert to manual group copies the full branch membership.
- Hidden branch members are included.
- Conversion preserves coordinates and viewport.
- The former anchor loses its special role.
- Converted membership is static and independent of later edge changes.
- Select branch is disabled while a manual group is active.
- Clear group permits branch selection again.

No reverse conversion is provided.

## Mouse movement

Dragging any visible member moves the complete manual group.

Every member receives the same dx/dy, including hidden members.
Relative geometry is preserved and non-members remain stationary.

Dragging a non-member moves only that node and preserves the group.

Movement retains membership, redraws connected edges, and does not
trigger layout or fitView. Members may move outside the viewport.
Existing node-drag auto-pan remains enabled.

## Keyboard movement

Manual-group movement requires canvas context and a focused or selected
graph node belonging to the group.

- Arrow: 10 graph-coordinate units.
- Shift + Arrow: 50 units.
- Hidden members receive the same delta.
- Repeated keyboard movement preserves membership.
- Text editing and interactive form controls retain their arrow behavior.
- Ctrl/Cmd/Alt combinations are not intercepted.

After clicking empty canvas, membership remains active but group keyboard
movement requires selecting or focusing a member again.

The user evaluated and accepted this focus behavior.

Stage 10 branch keyboard behavior remains available.

## Filtering and lifecycle

Changing filters preserves manual membership and temporary coordinates.

The counter reports hidden membership, including an all-hidden group.
Hidden members move with the group and appear at their updated positions
when revealed.

After successful CRUD refresh:

- Existing node coordinates are retained by node ID.
- Node and edge data are refreshed from the backend.
- Deleted members are removed from the group.
- Deleting the final member ends manual-group mode.
- New nodes are not automatically added.
- Edge changes do not recalculate manual membership.
- New nodes are placed to the right of the existing graph.
- Filters reset to All types, retaining the existing refresh behavior.
- Editor selection is reset.

A backend-rejected operation does not intentionally change membership.

Branch selection retains its Stage 10 invalidation rule on graph refresh.

## Coordinate lifetime

Coordinates and group membership exist only in frontend memory.

CRUD refresh now preserves coordinates of existing nodes instead of
automatically laying out the graph again.

Explicit automatic layouts may replace coordinates.
Page reload, application close, or component remount discards temporary
state.

No positions or group definitions are saved to PostgreSQL or localStorage.

Clearing or replacing membership does not undo completed movement.

## Shared logic and automated tests

`src/shared/manualGroups.ts` provides functions used by the component:

- Membership toggling.
- Replacement and additive selection.
- Reconciliation with existing node IDs.
- Rectangle intersection.
- Rigid member translation.

Frontend tests:

- 9 existing branch traversal tests.
- 11 new manual-group tests.
- Total: 20 passed.

New coverage includes:

- One-node groups and final-member removal.
- Membership immutability and duplicate prevention.
- Replacement and additive selection.
- Empty rectangle membership results.
- Partial intersection and boundary contact.
- Hidden-member translation.
- Stationary non-members and preserved relative geometry.
- Repeated coordinate increments.
- Deleted-member reconciliation.
- Exclusion of newly created nodes from membership.
- Translation of a synthetic 502-node group.

These are logic tests. Browser gestures, focus, mode transitions,
rendering, and CRUD integration were verified manually.

## Validation

- Production build passes.
- Frontend tests: 20 passed, 0 failed.
- Lint: 0 errors, 1 set-state-in-effect warning.
- git diff --check passes.
- Manual regression after extracting shared functions found no behavior
  changes.

Manual verification covered selection, rectangles, conversion,
mode exclusion, mouse and keyboard movement, hidden members,
filters, ordinary node movement, editing, and CRUD lifecycle.

## Real-graph evaluation

The user evaluated the feature on the real graph containing 502 nodes.

Reported results:

- A manual group containing 295 nodes moves smoothly.
- The complete 502-node graph also moves smoothly as one manual group.
- Manual grouping and membership refinement behave as expected.
- Creating a node leaves it outside the active group until explicitly added.
- No urgent need for search-based membership management was identified.

Smoothness is the user's qualitative assessment.
No frame-time measurements or performance benchmark were recorded.

## Decision

The manual-group hypothesis is supported by evaluation on the real graph.

Canvas interactions are sufficient for current use.
Search-based membership management remains deferred and is not committed
as the next feature.

Persistent coordinates require a separate specification.

## Deferred work

- Search-based group membership management.
- Persistent coordinates and saved layouts.
- Named or reusable groups.
- Undo/redo.
- Automatic collision avoidance or packing.
- Timeline layouts.

## Main files

- `poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx`
- `poc/graph-visualization/src/shared/manualGroups.ts`
- `poc/graph-visualization/tests/manualGroups.test.ts`
- `poc/graph-visualization/package.json`
- `docs/stage-11.md`