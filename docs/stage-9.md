# Stage 9 — UI / Layout

## Goal

Rework the main application layout so graph work has a dedicated tool
sidebar and the graph uses the maximum available browser workspace.

Stage 9 changes the structure and placement of existing UI only.
No new graph functionality is introduced.

## Starting point

Stage 9 starts from the Stage 8 checkpoint:

- commit: `27c6f6f Expand graph search and navigation`
- Alembic: `b4edbb2ba0b8 (head)`
- working tree: clean

The existing product architecture remains unchanged:

- React Flow is the product graph renderer
- backend is the source of truth
- canonical graph data is loaded through `GET /graph`
- graph mutations are persisted through the existing backend CRUD APIs
- no optimistic graph state was introduced
- no cascade delete behavior was introduced

## Product shell cleanup

The Stage 5 visualization evaluation shell was removed from the active
application UI.

`App.tsx` no longer exposes:

- renderer selection
- Cytoscape
- Sigma
- vis-network
- benchmark graph generation
- benchmark presets
- topology benchmark summaries
- raw graph data preview
- PoC-specific controls

React Flow is now the only renderer mounted by the product application.

The old renderer implementation files were not physically deleted in this
stage. Their removal can be handled separately from the layout work.

Automatic graph loading on application mount remains in place.

After graph mutations, `ReactFlowGraph` continues to refresh the canonical
graph through the existing `onGraphChanged` callback.

## Main application layout

The application now uses a two-column workspace:

- left: graph tools and data editing
- right: graph workspace

The left sidebar has a stable width of 360 px.

The graph workspace uses all remaining horizontal space.

The sidebar and graph are part of the same viewport-sized application shell.

## Left sidebar

Existing controls were moved into the left sidebar without changing their
behavior.

The sidebar contains the existing:

- graph search
- Node type filter
- Edge type filter
- directed path controls
- Paths to start navigation
- Show free Nodes navigation
- layout controls
- Create Node form
- Create Edge form
- Edit Node form
- Edit Edge form

The sidebar has its own vertical scrolling.

Scrolling the tools does not scroll the graph workspace or the entire page.

No accordion, collapsible sections, resizable sidebar, or other new UI
behavior was introduced.

## Graph workspace

The React Flow canvas occupies the remaining application area.

The previous hardcoded graph height:

`height: 650px`

was removed.

The graph height is now derived from the browser viewport through the layout
chain:

`viewport -> app -> content -> React Flow panel -> workspace -> graph container`

The relevant flex containers use `min-height: 0` and `min-width: 0` where
needed so the graph can correctly consume and resize within the available
space.

The application page itself does not vertically scroll. The sidebar handles
tool overflow independently.

The previous `app__content` maximum width restriction was also removed, so
the graph is no longer constrained by the old 1200 px content container.

## Search results

Graph search remains functionally unchanged.

The search result popup was adjusted to use the sidebar width rather than
the previous viewport-oriented width calculation.

## Existing graph behavior

The layout change preserves the existing React Flow behavior, including:

- zoom
- pan
- fit view controls
- Node dragging
- Node selection
- Edge selection
- search navigation
- Node and Edge type filtering
- directed path navigation
- Paths to start
- Show free Nodes
- Grid layout
- Circle layout
- Dagre layout
- Node CRUD
- Edge CRUD

No React Flow interaction handlers or graph algorithms were intentionally
changed as part of Stage 9.

## Legacy visualization code

Cytoscape, Sigma, and vis-network are no longer mounted by `App.tsx`.

Their implementation files were intentionally not deleted during Stage 9.

Renderer-specific legacy CSS was also retained where it belongs to those
implementation files. Physical cleanup of the old visualization evaluation
implementations is separate from this layout stage.

CSS that belonged only to the removed benchmark/product shell was removed.

## Validation

Manual browser validation confirmed:

- graph loads automatically
- left sidebar is displayed correctly
- graph occupies the remaining width
- graph uses the available viewport height
- page-level vertical scrolling is absent
- sidebar scrolls independently
- search works
- Node and Edge filters work
- directed path navigation works
- Paths to start works
- Show free Nodes works
- Grid, Circle, and Dagre layouts work
- Node create/edit/delete works
- Edge create/edit/delete works
- zoom and pan work
- Node dragging works
- Node and Edge selection work
- React Flow controls remain usable

Frontend production build:

`npm run build`

passes.

Frontend lint:

`npm run lint`

passes with:

- 0 errors
- 1 existing `react(set-state-in-effect)` warning in
  `ReactFlowGraph.tsx`

The warning existed before Stage 9 and remains intentionally outside the
scope of this layout change.

`git diff --check`

passes.

## Main files changed

- `poc/graph-visualization/src/App.tsx`
- `poc/graph-visualization/src/App.css`
- `poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx`

## Deferred / out of scope

Stage 9 intentionally does not add:

- new graph features
- collapsible sidebar sections
- resizable sidebar
- fullscreen graph mode
- additional display modes
- mobile-specific layout
- new graph tools
- changes to graph algorithms
- changes to backend CRUD
- deletion of the old visualization renderer implementations
- refactoring solely to remove the existing React effect lint warning

These can be considered in later stages where appropriate.
