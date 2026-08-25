# Stage 4 — Graph API

## Status

Completed.

Final automated test result:

    32 passed
    0 warnings

Swagger exposes the graph endpoint:

    GET /graph

---

## Goal

Provide the complete graph of the current user through a single API endpoint in
a format ready for frontend graph visualization.

The frontend no longer needs to:

1. request Nodes separately;
2. request Edges separately;
3. combine them;
4. translate database fields;
5. reconstruct graph relationships.

Instead, it can request:

    GET /graph

and receive the complete graph representation.

---

# 1. API Boundary

The CRUD API remains responsible for manipulating individual resources:

    /nodes
    /edges

The Graph API is responsible for presenting the complete graph:

    /graph

This creates a clear separation between:

- the backend persistence model;
- CRUD operations;
- the frontend visualization model.

Stage 4 does not change the existing Node or Edge CRUD endpoints.

---

# 2. Graph Endpoint

Implemented endpoint:

    GET /graph

The endpoint:

- resolves the current user through `get_current_user`;
- retrieves only the current user's Nodes;
- retrieves only the current user's Edges;
- converts database models into the Graph API response format;
- returns Nodes, Edges and graph metadata in one response.

Successful response:

    200 OK

---

# 3. Graph Response

The response has three required fields:

    {
      "nodes": [],
      "edges": [],
      "meta": {
        "nodes_count": 0,
        "edges_count": 0
      }
    }

All three fields are always present.

An empty graph is a successful response, not an error.

---

# 4. Graph Node Format

Each Node is returned in the following format:

    {
      "id": 1,
      "type": "person",
      "label": "John Smith",
      "description": "Former colleague",
      "attributes": {
        "age": 35
      }
    }

Field mapping:

    Graph field    Database source
    -----------    ---------------
    id             nodes.id
    type           node_types.code
    label          nodes.display_name
    description    nodes.description
    attributes     nodes.properties

The Graph API preserves the existing numeric Node ID.

No prefix or alternative frontend-specific ID is generated.

`type` contains the NodeType code rather than `node_type_id`.

System fields are kept separate from arbitrary domain attributes.

Only the contents of `nodes.properties` are returned in `attributes`.

---

# 5. Graph Edge Format

Each Edge is returned in the following format:

    {
      "id": 1,
      "type": "knows",
      "source": 1,
      "target": 2,
      "description": "Met at work",
      "attributes": {
        "since": 2022
      }
    }

Field mapping:

    Graph field    Database source
    -----------    --------------------
    id             edges.id
    type           edge_types.code
    source         edges.source_node_id
    target         edges.target_node_id
    description    edges.description
    attributes     edges.properties

The Graph API preserves the existing numeric Edge ID.

`type` contains the EdgeType code rather than `edge_type_id`.

`source` and `target` contain Node IDs and refer to Nodes returned in the same
graph response.

Only the contents of `edges.properties` are returned in `attributes`.

---

# 6. Graph Metadata

Every response includes:

    {
      "nodes_count": 10,
      "edges_count": 15
    }

The values are calculated from the returned graph representation.

For an empty graph:

    {
      "nodes_count": 0,
      "edges_count": 0
    }

The metadata is intended to support frontend display and future graph features
such as filtering or pagination without introducing those features now.

---

# 7. Stable Ordering

Graph results use deterministic ordering:

    Nodes -> ORDER BY nodes.id
    Edges -> ORDER BY edges.id

Stable ordering makes API responses predictable and simplifies automated
testing and debugging.

The ordering does not change graph semantics.

---

# 8. Data Access

Stage 4 introduced a dedicated Graph repository:

    app/repositories/graph.py

The repository retrieves Nodes and Edges separately from the existing CRUD
repositories.

Both queries apply ownership filtering directly in PostgreSQL:

    Node.user_id == current_user.id
    Edge.user_id == current_user.id

The application does not load all users' data and filter it afterward.

NodeType and EdgeType relationships are loaded with `joinedload`, so the type
codes are available without lazy-loading a separate relationship for every
graph object.

No database migration was required for Stage 4.

---

# 9. Multi-Tenant Isolation

The Graph API returns only data belonging to the current user.

Isolation applies independently to:

- the Nodes query;
- the Edges query.

Nodes belonging to other users are excluded.

Edges belonging to other users are excluded.

Existing composite foreign keys continue to guarantee that an Edge cannot
connect Nodes owned by different users:

    (user_id, source_node_id)
        -> nodes(user_id, id)

    (user_id, target_node_id)
        -> nodes(user_id, id)

Therefore every returned Edge references Nodes belonging to the same user.

---

# 10. Response Schemas

Stage 4 introduced dedicated Pydantic response schemas:

    GraphNode
    GraphEdge
    GraphMeta
    GraphResponse

These schemas define the public Graph API contract separately from the existing
CRUD schemas.

The Graph API does not expose persistence-specific fields such as:

- `user_id`;
- `node_type_id`;
- `edge_type_id`;
- `source_node_id`;
- `target_node_id`;
- `properties`;
- `created_at`;
- `updated_at`.

Where needed, these fields are translated into the graph representation.

---

# 11. Tests

Stage 4 added:

    tests/test_graph.py

The new tests cover:

- an empty graph;
- a graph containing one Node and no Edges;
- a graph containing multiple Nodes and Edges;
- isolation between two users;
- NodeType code mapping;
- EdgeType code mapping;
- `display_name` to `label` mapping;
- `properties` to `attributes` mapping;
- separation of `description` from `attributes`;
- correct `source` and `target` references;
- correct Node and Edge counts;
- stable ordering by ID.

Stage 4 test result:

    docker compose exec api pytest -q tests/test_graph.py

    4 passed

Complete project test result:

    docker compose exec api pytest -q

    32 passed
    0 warnings

All tests from the previous stages continue to pass.

---

# 12. Swagger

Swagger UI exposes:

    GET /graph

Manual smoke testing through Swagger was completed successfully.

The tested response contained:

- three Nodes;
- one Edge;
- expanded Node and Edge type codes;
- correct source and target references;
- correct metadata counts.

---

# 13. Files Added

Stage 4 added:

    app/repositories/graph.py
    app/routers/graph.py
    app/schemas/graph.py
    tests/test_graph.py
    docs/stage-4.md

---

# 14. Files Modified

Stage 4 modified:

    app/main.py
    app/schemas/__init__.py

`app/main.py` registers the Graph router.

`app/schemas/__init__.py` exports the Graph response schemas.

---

# 15. Out of Scope

Stage 4 intentionally does not implement:

    GET /graph/{node_id}
    GET /graph/nodes/{id}/neighbors
    GET /graph/paths?from=...&to=...

The following features are also deferred:

- pagination;
- graph filtering;
- path search;
- neighbor retrieval;
- graph depth limits;
- aggregation;
- clustering;
- visualization-specific styling configuration.

Stage 4 solves one task:

> Return the complete graph of the current user in a format that the frontend
> can directly visualize.

---

# Definition of Done

Stage 4 is complete.

- `GET /graph` is implemented.
- Nodes and Edges are returned in one response.
- The Graph Node format is defined.
- The Graph Edge format is defined.
- Edge type is included.
- System fields are separated from arbitrary attributes.
- `source` and `target` reference returned Nodes.
- Only the current user's data is returned.
- Empty graphs are returned successfully.
- Metadata is always present.
- Node and Edge counts are correct.
- Nodes and Edges use stable ordering.
- Swagger exposes the endpoint.
- Manual Swagger testing succeeded.
- Automated Graph API tests pass.
- All previous automated tests continue to pass.
- Final test suite: 32 passed, 0 warnings.

The project is ready to proceed to Stage 5.
