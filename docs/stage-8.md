# Stage 8 — Graph expansion and navigation

## Goal

Expand the graph with new Node and Edge types, improve search across graph data, and add navigation tools for exploring how Nodes are connected to their origins.

After Stage 8, the user can:

- create and edit additional graph entity types;
- filter both Nodes and Edges by type;
- search across Nodes, Edges, descriptions, types, endpoints, and Properties;
- view and navigate to every matching search result;
- highlight every incoming path leading to a selected Node;
- find Nodes that are not connected to any Edge.

## Starting point

Stage 8 started from the completed Stage 7 checkpoint:

`6ee65d8 Improve frontend reload recovery`

The working tree was clean before Stage 8 changes.

The existing architectural decisions remain unchanged:

- React Flow is the primary graph renderer;
- the backend is the source of truth;
- the frontend reloads the canonical graph through `GET /graph`;
- graph mutations are not optimistic;
- Node deletion does not cascade to connected Edges;
- duplicate directed Edges with the same source, target, and Edge type are prohibited.

## New reference types

Stage 8 adds one Node type:

- `story` — a story, narrative, or separately described part of the graph.

Stage 8 adds three Edge types:

- `family` — a family relationship;
- `pushed` — a person, event, or other element pushed toward a later action or event;
- `shared` — a shared action, event, resource, experience, or other common element.

The types are introduced by Alembic migration:

`b4edbb2ba0b8_add_story_family_pushed_and_shared_types.py`

Migration revision:

`b4edbb2ba0b8`

Previous revision:

`f59f4efa694f`

The migration supports both upgrade and downgrade.

The frontend continues to use type records returned by:

- `GET /node-types`;
- `GET /edge-types`.

It does not depend on numeric reference-type IDs.

The existing Node model and CRUD workflow are reused for `story`. No separate storage model or API was introduced.

## Frontend support for new types

The existing Create and Edit forms load Node and Edge types dynamically from the backend. The new types therefore participate in the existing workflows:

- create;
- edit;
- delete;
- graph display;
- search;
- filtering.

The `story` Node type has its own frontend color:

`#db2777`

Existing Node and Edge types remain supported.

## Node and Edge type filters

Before Stage 8, the React Flow UI had only a Node-type filter.

Stage 8 adds an Edge-type filter and combines both filters.

The filtering rules are:

- `All types` disables the corresponding filter;
- the Node filter hides Nodes of other types;
- an Edge is hidden if either endpoint is hidden by the Node filter;
- the Edge filter hides Edges of other types;
- applying one filter does not implicitly remove the other filter;
- Edge filtering keeps the allowed Nodes visible to preserve graph context;
- commands that restore the complete graph reset both filter selectors;
- graph refresh after a mutation restores the full graph and resets both selectors to `All types`.

Filter options are derived from the types currently present in the graph.

## Expanded graph search

The previous search returned only the first matching Node.

Stage 8 replaces it with a graph-wide search that returns every matching Node and Edge.

The pure search implementation is located in:

`poc/graph-visualization/src/shared/graphSearch.ts`

The search UI is located in:

`poc/graph-visualization/src/react-flow/GraphSearchPanel.tsx`

### Searchable Node fields

Node search includes:

- exact Node ID;
- label;
- description;
- Node type code;
- Property keys;
- Property values.

### Searchable Edge fields

Edge search includes:

- exact Edge ID;
- source Node label;
- target Node label;
- description;
- Edge type code;
- Property keys;
- Property values.

### Search behavior

Search is:

- case-insensitive;
- based on partial text matching;
- recursive for nested Property objects and arrays;
- performed against the canonical `GraphResponse` already loaded by the frontend.

No additional backend search endpoint was introduced because the complete graph is currently loaded into the frontend.

Each result shows:

- whether it is a Node or Edge;
- its type;
- its ID;
- the fields in which the match was found.

Node results are sorted by Node label. Edge results are sorted by their source/target display text. Node results are displayed before Edge results.

The result list intentionally remains open after selecting an item. This allows the user to inspect multiple results without repeating the search. Clearing the search input removes the result list.

Because results are derived from the current `graph` prop, they are recalculated when the canonical graph changes and do not retain stale graph elements.

## Navigation to search results

Selecting a Node search result:

- restores all graph elements;
- resets Node and Edge type filters;
- centers the viewport on the Node;
- visually highlights the Node.

Selecting an Edge search result:

- restores all graph elements;
- resets Node and Edge type filters;
- fits both endpoint Nodes into the viewport;
- highlights the Edge;
- highlights its source and target Nodes.

The current layout is not changed by search navigation.

## Paths to start

Stage 8 adds the `Paths to start` command for a selected Node.

Its purpose is to show every graph element from which the selected Node can be reached by following directed Edges forward.

The implementation traverses the graph backward from the selected Node through all incoming Edges.

The pure algorithm is:

`findPathsToStart()`

in:

`poc/graph-visualization/src/shared/graphAlgorithms.ts`

### Traversal rules

The algorithm:

- starts from the selected Node;
- follows every incoming Edge;
- includes all incoming branches;
- continues until each branch reaches a Node without an incoming Edge;
- returns all ancestor Node IDs;
- returns all participating Edge IDs;
- returns all detected root Node IDs;
- includes the selected Node even when it is already a root;
- includes all Edge types;
- processes every Node only once;
- handles converging branches;
- terminates safely when cycles exist;
- ignores self-loops because they do not move the traversal toward an earlier Node;
- returns `null` if the selected Node does not exist.

A cycle may produce a branch without a root Node. This is reported in the UI as no root Node found rather than causing an infinite traversal.

### Path highlighting

When `Paths to start` is activated:

- the selected Node has a red border;
- root Nodes have green borders;
- intermediate ancestor Nodes have orange borders;
- participating Edges are highlighted in red;
- unrelated Nodes and Edges are dimmed;
- the viewport fits all Nodes in the resulting ancestor subgraph.

The action message reports:

- number of included Nodes;
- number of included Edges;
- number of root Nodes, or that no root Node was found.

## Free Nodes

Stage 8 adds the `Show free Nodes` command.

A free Node is a Node with:

- no incoming Edge;
- no outgoing Edge.

The pure detection function is:

`findUnconnectedNodeIds()`

in:

`poc/graph-visualization/src/shared/graphAlgorithms.ts`

The algorithm builds a set containing every source and target Node referenced by an Edge. Nodes absent from that set are free.

A self-loop counts as a connection. Therefore, a Node with a self-loop is not considered free.

When the command is activated:

- free Nodes are highlighted with green borders;
- other Nodes and all Edges are dimmed;
- the viewport fits all free Nodes;
- the UI reports the number of free Nodes;
- if no free Nodes exist, the complete graph is restored and an explanatory message is shown.

This is a highlighting mode rather than a destructive filter. The full graph remains available.

## Interaction between navigation modes

Search selection, type filtering, path highlighting, Paths to start, and free-Node highlighting reuse the same React Flow elements.

Commands that need the complete graph:

- restore hidden graph elements;
- clear incompatible type filters;
- replace the previous visual highlighting.

`Reset selection` or clicking the graph pane restores normal highlighting.

No client-side server-state cache, optimistic updates, autosave, or localStorage persistence was added.

## Main files changed

Backend/database:

- `alembic/versions/b4edbb2ba0b8_add_story_family_pushed_and_shared_types.py`

Frontend:

- `poc/graph-visualization/src/App.css`
- `poc/graph-visualization/src/react-flow/GraphSearchPanel.tsx`
- `poc/graph-visualization/src/react-flow/ReactFlowGraph.tsx`
- `poc/graph-visualization/src/react-flow/adapter.ts`
- `poc/graph-visualization/src/shared/graphAlgorithms.ts`
- `poc/graph-visualization/src/shared/graphSearch.ts`

## Manual verification

The following scenarios were verified manually:

### New types

- `story` appears in Create Node and Edit Node;
- `family`, `pushed`, and `shared` appear in Create Edge and Edit Edge;
- new types can be created, displayed, edited, filtered, and deleted;
- existing Node and Edge types continue to work.

### Combined filtering

- Node filtering works independently;
- Edge filtering works independently;
- Node and Edge filters work together;
- applying filters in either order produces consistent results;
- `All types` removes only the corresponding filter;
- mutation refresh returns both selectors to `All types`.

### Expanded search

- multiple results are displayed;
- Node labels and descriptions are searchable;
- Edge descriptions and endpoint names are searchable;
- Node and Edge Property keys and values are searchable;
- type codes are searchable;
- matching is case-insensitive;
- partial matching works;
- nested Property values are supported;
- Node result navigation centers and highlights the Node;
- Edge result navigation shows both endpoints and highlights the Edge;
- the result list remains available for subsequent selections.

### Paths to start

- a linear ancestor chain is highlighted;
- multiple incoming branches are highlighted;
- multiple roots are identified;
- a root Node returns itself;
- cycles terminate safely;
- self-loops are ignored by backward traversal.

### Free Nodes

- Nodes without incoming or outgoing Edges are highlighted;
- connected Nodes are excluded;
- a Node with a self-loop is excluded;
- connecting a previously free Node removes it from the result;
- the no-results state is handled.

## Validation

Database migration:

```bash
docker compose exec api alembic downgrade f59f4efa694f
docker compose exec api alembic upgrade head
docker compose exec api alembic current
```

Result:

```text
b4edbb2ba0b8 (head)
```

The new Node and Edge type records were verified directly in PostgreSQL after upgrade.

Backend:

```bash
docker compose exec api pytest -q
```

Result:

```text
33 passed
```

Frontend:

```bash
cd poc/graph-visualization
npm run build
```

Result:

```text
passed
```

Frontend lint:

```bash
npm run lint
```

Result:

- 0 errors;
- 1 warning.

The remaining warning is the known `react(set-state-in-effect)` warning in `ReactFlowGraph.tsx`. It existed before Stage 8 and was intentionally not refactored as part of this stage.

The Vite bundle-size warning for an evaluated renderer chunk remains informational and is outside the scope of Stage 8.

Whitespace validation:

```bash
git diff --check
```

Result:

```text
clean
```

## Final Stage 8 behavior

After Stage 8:

- the graph supports `story` Nodes;
- the graph supports `family`, `pushed`, and `shared` Edges;
- Node and Edge types can be filtered independently or together;
- search returns every matching Node and Edge;
- search includes descriptions, types, endpoints, and Properties;
- users can navigate directly to each search result;
- users can highlight every incoming path leading to a selected Node;
- cycles and self-loops are handled safely;
- users can find every unconnected Node;
- existing graph creation, editing, deletion, layouts, selection, and directed path behavior remain available;
- the backend remains the source of truth.

## Deferred / out of scope

Stage 8 intentionally does not add:

- server-side graph search;
- progressive graph loading;
- search pagination;
- fuzzy search or ranking;
- typed Property editing;
- branch collapsing;
- selection of Edge types used by Paths to start;
- optimistic mutations;
- client-side graph persistence;
- complex undo/redo;
- refactoring solely to remove the existing lint warning.
