# Stage 10 — DAG and Branch Movement Prototype

## Goal

Evaluate whether moving a selected node together with all its directed
descendants improves the readability of the real My Way graph.

The stage adds DAG validation, explicit branch preview, and temporary
branch movement using both mouse dragging and keyboard arrows.

## Starting point

- Commit: `7b249f2 Rework graph workspace layout`
- React Flow is the only renderer mounted by the product application.
- Backend remains the source of truth for graph data.
- Initial `GET /graph` and refresh after CRUD remain unchanged.
- The Stage 9 sidebar and graph workspace layout is preserved.

## Existing-data audit

A read-only cycle audit was performed before DAG validation was enabled.

Initial data:

- User 1: 488 nodes, 524 edges.
- User 3: 1 node, 0 edges.

One directed cycle was found for user 1:

`11 → 20 → 19 → 150 → 48 → 154 → 36 → 181 → 182 → 11`

Cycle edge IDs:

`18, 19, 163, 164, 169, 170, 199, 200, 201`

No self-loops were reported.

The user manually deleted edge 201, representing `182 → 11`.
No automatic data repair was performed.

The repeated audit returned no cycles.

## Backend DAG validation

Ordinary edges must form a DAG within each user's graph.

Before edge creation:

- Both endpoints must belong to the current user.
- Self-loops are rejected.
- The validator checks whether the target can already reach the source.

Before an endpoint update:

- Endpoint ownership is checked.
- The current edge is excluded from reachability validation.
- The proposed relationship is rejected if it would create a cycle.

Updates that do not change endpoints do not run topology validation.

Validation loads source/target pairs for the current user and performs
an iterative traversal with a visited set.

API responses:

- Self-loop: `409`, `Self-loop edges are not allowed`
- Cycle: `409`, `This edge would create a cycle`

Existing duplicate-edge and ownership checks remain in place.

No database trigger was added. Concurrent writes can still race with
application-level cycle validation; database or transaction-level
enforcement remains outside this prototype.

## Branch calculation

`findBranchNodeIds` returns:

- The selected anchor.
- Every node reachable through outgoing edges.
- Each node at most once.

The calculation uses the complete loaded graph, independently of
visual Node and Edge type filters.

A shared descendant is included, but its external parent is not.

Traversal ignores edges with missing endpoints and terminates even
if defensive cyclic input is supplied.

## Branch preview

Normal single-node selection remains available.

`Select branch` explicitly activates branch preview:

- Anchor: red border.
- Descendants: yellow borders.
- Unrelated nodes: reduced opacity.
- Counts: total selected, visible selected, and hidden selected nodes.

Selection itself does not move nodes or change zoom.

`Cancel branch selection` removes the preview and restores the underlying
highlighting.

Other selection, search, navigation, filter, and layout actions clear
branch mode. Refreshing the canonical graph invalidates the old branch.

Hidden nodes retain their frontend coordinates and remain branch members.

## Mouse movement

Dragging the anchor moves the complete branch by the same coordinate delta.

While branch mode is active, only the anchor is draggable.

Movement preserves:

- Relative positions within the group.
- Stationary external parents.
- Edge connectivity.
- Current zoom after drop.

External edges redraw to the moved endpoints.

The viewport is not a movement boundary. Members may move off screen.
React Flow auto-pan during node dragging is enabled.

Movement does not trigger automatic fitView, layout, scaling, or
collision avoidance.

## Keyboard movement

Keyboard movement was added during the prototype because hitting a small
anchor on a limited screen required repeated zoom changes.

With an active branch:

- Arrow keys move the group by 10 graph-coordinate units.
- Shift + Arrow moves the group by 50 units.
- Holding an arrow repeats movement.
- Hidden descendants receive the same delta.
- Mouse and keyboard movement can be alternated.

Text inputs, textareas, selects, editable content, and the listed
interactive ARIA controls retain their keyboard behavior.

Ctrl, Cmd, and Alt combinations are not intercepted.

The handler intercepts branch arrow events before React Flow's native
keyboard movement to avoid moving the anchor twice.

## Coordinate lifetime

Positions exist only in frontend memory.

They are not saved to PostgreSQL or sent to a new API endpoint.

Positions may be replaced by:

- Page reload.
- Canonical graph refresh, including refresh after CRUD.
- Automatic layout.
- Closing the application.

No coordinate persistence or saved-layout model was introduced.

## Validation

Backend:

- Full suite: 43 passed.
- Includes 10 new DAG test cases.
- Existing self-loop acceptance test changed to rejection.

Frontend:

- Branch traversal suite: 9 passed.
- Includes linear, branching, diamond, shared descendant, isolated node,
  missing anchor, large synthetic DAG, defensive cycle, and missing
  endpoint cases.
- The large synthetic DAG contains 2,000 nodes.
- Production build passes.
- Lint: 0 errors and 1 pre-existing set-state-in-effect warning.
- `git diff --check` passes.

Manual verification confirmed:

- Branch preview, counts, and cancellation.
- Normal single-node dragging.
- Rigid branch dragging.
- Stationary external parents and redrawn edges.
- Off-screen movement and unchanged zoom after drop.
- Hidden descendant movement.
- Repeated selection and movement.
- Automatic layouts after manual movement.
- Keyboard movement and interaction with editable fields.
- Mouse and keyboard movement can be combined.

## Real-graph evaluation

Evaluation was performed on the user's real graph with 488 nodes.

The user confirmed:

- Manual branch movement produces the expected result.
- The graph can become more readable within the available screen area.
- Movement remains smooth.
- Arranging branches encourages recalling chronology and relationships,
  making the process useful beyond visual organization.

A real graph with 500 or more nodes was not tested.
The user does not expect a material difference from a small increase,
but this expectation is not a measured result.

The largest moved branch size and numerical frame-time measurements
were not recorded.

## Decision

The branch-movement hypothesis is supported by the user's evaluation
on the current 488-node graph.

Continue this direction.

Coordinate persistence requires a separate specification and is not
implemented in this stage.

## Planned follow-up: manual node groups

Add explicit selection of arbitrary nodes without automatically
including descendants.

Proposed interactions:

- Ctrl/Cmd + click toggles membership.
- Rectangle selection selects multiple nodes.
- Dragging any selected member moves the entire group.
- Arrow keys and Shift + Arrow use the same 10/50-unit steps.
- All selected nodes receive the same delta.
- Unselected nodes remain stationary.
- Show a selected-node count and an explicit cancel action.

Manual groups and branch selection should be mutually exclusive modes.

Adding nodes to a group through search should be considered for small
screens, where direct canvas selection is difficult.

These features are planned, not implemented.

## Other deferred work

- Persistent coordinates and named layouts.
- Database-level DAG enforcement.
- Automatic collision avoidance or branch packing.
- Branch depth limits and manual exclusions.
- Fit selected branch.
- Timeline layouts.
- Identity grouping and repeated appearances of an entity.
- Cleanup of unused legacy renderer implementations.

## Main files

- `app/repositories/edge.py`
- `app/routers/edges.py`
- `tests/test_edges_crud.py`
- `tests/test_edges_dag.py`
- `poc/graph-visualization/package.json`
- `poc/graph-visualization/src/shared/graphAlgorithms.ts`
- `poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx`
- `poc/graph-visualization/tests/graphBranch.test.ts`
- `docs/stage-10.md`
