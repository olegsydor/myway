# Stage 6 — User Graph Creation and Editing

## Goal

Stage 6 adds user-facing graph editing on top of the React Flow visualization selected in Stage 5.

The main workflow implemented in this stage is:

1. Create a Node.
2. Describe the Node and add properties.
3. Create a directed Edge between Nodes.
4. Describe the Edge and add properties.
5. Immediately see the resulting changes on the graph.
6. Edit and delete existing Nodes and Edges.

The backend remains the source of truth. The frontend does not perform optimistic graph mutations.

---

## Backend

### Reference type endpoints

The frontend needs the complete list of allowed Node and Edge types independently of which types currently occur in the graph.

Two read-only endpoints were added:

- `GET /node-types`
- `GET /edge-types`

The endpoints return:

```json
{
  "id": 1,
  "code": "person",
  "name": "Person"
}
```

and the analogous structure for Edge types.

Reference types are ordered by ID.

CRUD operations for Node and Edge types are intentionally not part of Stage 6.

### Available Node types

The following Node types are currently seeded:

- `person`
- `place`
- `organization`
- `skill`
- `event`
- `project`
- `hobby`

### Available Edge types

The following Edge types are currently seeded:

- `knows`
- `works_at`
- `lives_in`
- `has_skill`
- `participates_in`
- `works_on`
- `located_in`
- `leads_to`

The additional reference data was introduced through Alembic data migrations rather than being inserted manually into the development database.

---

## Edge uniqueness

Stage 6 defines an Edge duplicate as two Edges belonging to the same user with the same:

- `source_node_id`
- `target_node_id`
- `edge_type_id`

The database enforces this with:

```text
uq_edges_user_source_target_type
```

on:

```text
(user_id, source_node_id, target_node_id, edge_type_id)
```

Consequences:

- `A -> B` with the same Edge type cannot exist twice.
- `A -> B` with different Edge types is allowed.
- `B -> A` is distinct from `A -> B` because Edges are directed.
- self-loops remain allowed.

Duplicate creation or an update that would create a duplicate returns:

```text
409 Conflict
```

with:

```json
{
  "detail": "Edge already exists"
}
```

The database constraint is the final concurrency-safe enforcement mechanism. The API does not rely on a SELECT-before-write duplicate check.

---

## Node deletion rule

Cascade deletion of connected Edges is intentionally forbidden.

If a Node still has one or more connected Edges, deleting that Node returns:

```text
409 Conflict
```

with:

```json
{
  "detail": "Node has connected edges. Delete the edges first."
}
```

The user must explicitly remove the relevant Edges before deleting the Node.

This is an intentional product rule and must not be replaced with automatic cascade deletion in future stages without an explicit design decision.

---

## Frontend architecture

Stage 6 editing functionality is implemented only for the React Flow renderer selected in Stage 5.

`App` owns the canonical `GraphResponse`.

After every successful mutation:

```text
POST / PATCH / DELETE
        ↓
onGraphChanged()
        ↓
GET /graph
        ↓
App updates GraphResponse
        ↓
ReactFlowGraph receives new graph props
```

The frontend therefore does not manually patch its canonical graph after mutations.

There is currently:

- no optimistic update
- no client-side graph cache
- no autosave
- no state-management library for server state

The backend remains the source of truth.

---

## Node operations

The React Flow UI supports:

- creating a Node
- selecting its Node type
- setting its display name
- setting its description
- adding arbitrary properties
- editing an existing Node
- deleting a Node when it has no connected Edges

Backend naming remains:

```text
display_name
```

while the graph visualization contract exposes it as:

```text
label
```

This naming distinction is intentional and unchanged from the previous stages.

---

## Edge operations

The React Flow UI supports:

- selecting a source Node
- selecting a target Node
- selecting an Edge type
- setting an Edge description
- adding arbitrary properties
- editing an existing Edge
- deleting an Edge

Edges are directed.

Duplicate Edge errors returned by the backend are shown to the user as:

```text
Edge already exists
```

rather than as a generic HTTP error.

---

## Properties

Node and Edge properties are edited as key/value rows.

For Stage 6:

- property keys are strings
- property values are entered as strings
- rows with empty keys are ignored
- empty values are allowed
- if the same key is entered multiple times, the last value wins

The backend continues to store the resulting object in JSONB.

Typed property editing is outside the scope of this stage.

---

## React Flow visualization changes

### Custom Nodes

A custom `MyWayNode` component was added.

Nodes display their primary graph information compactly and expose additional information through a hover tooltip.

Node colors currently depend on Node type.

Known explicit colors include:

```text
person        #3b82f6
skill         #10b981
place         #f59e0b
event         #8b5cf6
organization  #475569
project       #06b6d4
hobby         #b45309
```

Unknown Node types use a fallback color.

The tooltip positioning checks available space in the graph container and can open to either side of the Node to reduce clipping.

### Custom Edges

A custom `MyWayEdge` component was added.

It provides:

- the visible Edge path
- directed arrow rendering
- a larger transparent interaction area
- Edge information through the Edge label/tooltip layer

The rendered target endpoint is slightly offset so that the arrow remains visible rather than disappearing underneath the target Node.

---

## Node selectors

A reusable `NodeSearchSelect` component was added.

It is used where a Node must be selected, including:

- Create Edge source
- Create Edge target
- directed path start
- directed path end

The selector supports searching by Node label and keeps Node IDs as the internal value.

The directed-path result displays Node labels to the user rather than exposing IDs as the primary UI representation.

---

## Layout synchronization

Available layouts remain:

- Grid
- Circle
- Dagre

Dagre is the default layout.

The currently selected layout is remembered by the React Flow component.

After graph mutations and the subsequent `GET /graph` refresh, the new graph is positioned using the currently selected layout rather than always reverting to Grid.

Mutation refreshes do not automatically call `fitView`, avoiding unwanted viewport jumps during editing.

---

## Alembic migrations

Stage 6 adds the following migrations:

```text
1fad1039e79c_add_default_node_and_edge_types.py
1934c101cf4c_add_hobby_and_leads_to_types.py
f59f4efa694f_prevent_duplicate_edges.py
```

Current Alembic head:

```text
f59f4efa694f
```

The final duplicate-Edge migration contains only the intended unique constraint change. Unrelated schema differences produced during autogeneration were deliberately removed before applying the migration.

---

## Tests and verification

At the end of Stage 6:

```text
Backend tests:     33 passed
Frontend build:    passed
Frontend lint:     0 errors, 1 warning
git diff --check:  clean
Alembic current:   f59f4efa694f (head)
Alembic heads:     f59f4efa694f (head)
```

The remaining frontend lint warning is:

```text
react(set-state-in-effect)
```

in `ReactFlowGraph.tsx`.

It occurs in the effect that synchronizes local React Flow state with a newly received `GraphResponse` and resets selection/editing state.

The behavior is currently intentional and working. It was not refactored during Stage 6 merely to remove the warning because doing so could alter the already-tested graph synchronization behavior.

This warning may be revisited as a focused frontend cleanup later.

---

## Explicitly deferred functionality

The following functionality was discussed but intentionally not included in Stage 6:

- creating a new Node from inside the Create Edge workflow
- selecting a parent while creating a Node
- progressive graph loading
- collapsing graph branches
- advanced upstream/downstream highlighting
- custom Node sizing based on out-degree
- complex undo/redo
- autosave
- optimistic updates
- typed property editor

These should not be assumed to exist when starting the next stage.

---

## Stage 6 result

At the end of Stage 6, the React Flow PoC has moved from a read-only graph visualization into an editable graph interface.

A user can now perform the complete basic graph-editing workflow:

```text
Create Node
    ↓
Describe Node
    ↓
Connect it to another Node
    ↓
Describe the directed relationship
    ↓
See the updated graph
    ↓
Edit or explicitly remove graph elements
```

The implementation preserves tenant ownership rules, prevents duplicate relationships at the database level, prevents implicit deletion of connected relationships, and keeps the backend as the authoritative graph state.
