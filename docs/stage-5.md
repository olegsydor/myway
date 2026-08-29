# Stage 5. Graph visualization tooling decision

Status: completed

## Decision

The primary graph visualization stack is:

- React Flow 12.11.5
- @dagrejs/dagre 3.1.1
- React 19.2.8
- TypeScript 6.0.3
- Vite 8.2.2

The reserve candidate is:

- Cytoscape.js 3.34.2
- cytoscape-dagre 4.0.1

Rejected candidates:

- Sigma.js 3.0.3 + Graphology 0.26.0
- vis-network 10.1.2

The rejected candidates remain in the Stage 5 PoC so that the evaluation
is reproducible. They are not part of the planned production frontend
stack.

## Goal

Select a graph visualization library using the actual `GET /graph`
contract, realistic graph topology, expected product interactions, and
basic performance measurements.

The goal was not to build a production frontend. The PoC implements only
the functionality required to compare the candidates.

## API data contract

All candidates receive the same data returned by `GET /graph`:

- `nodes`
  - `id`
  - `type`
  - `label`
  - `description`
  - `attributes`
- `edges`
  - `id`
  - `type`
  - `source`
  - `target`
  - `description`
  - `attributes`
- `meta`
  - `nodes_count`
  - `edges_count`

Each candidate has its own adapter from this shared API format to the
library-specific format.

## Expected production graph profile

The initial dense benchmarks were useful as stress tests, but they did
not accurately represent the expected production data.

The expected graph is:

- directed;
- sparse;
- normally between 1,000 and 2,000 Nodes;
- approximately one incoming Edge for most non-root Nodes;
- no more than 3% of Nodes expected to have two incoming Edges;
- between 1 and 10 root Nodes;
- potentially many outgoing Edges from a Node;
- several hub Nodes;
- simple directed paths of up to approximately 20 Nodes;
- rare cycles are allowed;
- self-loops and cycles are not forbidden by database constraints.

The expected graph is therefore a sparse, rooted, branching, mostly
acyclic directed graph with occasional merges and cycles.

These characteristics describe expected data, not database constraints.

## Benchmark profiles

### Realistic profiles

- 100 Nodes / 100 Edges / 2 roots
- 500 Nodes / 510 Edges / 4 roots
- 1,000 Nodes / 1,020 Edges / 5 roots
- 2,000 Nodes / 2,040 Edges / 6 roots
- 5,000 Nodes / 5,100 Edges / 8 roots

The realistic generator creates:

- a guaranteed path containing 20 Nodes;
- shorter branches;
- hub Nodes;
- no more than 3% of Nodes with two incoming Edges;
- no Nodes with more than two incoming Edges;
- a small deterministic number of cycles;
- deterministic output from a fixed random seed.

Validation of the 100/100 realistic graph produced:

- 2 roots;
- maximum in-degree 2;
- 2 Nodes with two incoming Edges (2%);
- 0 Nodes with more than two incoming Edges;
- maximum out-degree 10;
- declared depth of 19 Edges / 20 Nodes;
- 1 declared cycle Edge.

### Additional sparse and stress profiles

The PoC also retains the earlier random datasets:

- 100 / 120
- 500 / 600
- 1,000 / 1,200
- 5,000 / 6,000
- 100 / 300
- 500 / 1,500
- 1,000 / 5,000
- 5,000 / 20,000

These datasets are useful for identifying degradation and technical
limits, but they are not the primary selection criteria.

## Selection criteria

The candidates were evaluated for:

- directed Edges;
- multiple Node types;
- Node labels;
- Edge labels;
- zoom and pan;
- draggable Nodes;
- Node selection;
- Edge selection;
- highlighting a Node and its neighbours;
- directed path search;
- path highlighting;
- filtering by Node type;
- finding a Node by ID or label;
- fitting the viewport to a result;
- layout algorithms;
- TypeScript support;
- React integration;
- compatibility with the `GET /graph` format;
- performance on realistic and stress datasets;
- bundle size;
- future extensibility.

## Product interactions tested

The primary candidates support:

- finding a Node by ID or label;
- selecting a Node;
- selecting an Edge;
- showing immediate neighbours;
- highlighting connected Edges;
- finding a directed path between two Nodes;
- highlighting the found path;
- fitting the viewport to the path;
- hiding Nodes and Edges by type;
- restoring the full graph;
- zooming, panning, and dragging Nodes.

A valid unsuccessful path search must clear the previous path
highlighting. Leaving the previous result visible would incorrectly make
it appear to be the result of the new search.

Future highlighting should support:

- upstream traversal;
- downstream traversal;
- traversal in both directions;
- configurable traversal depth;
- upstream traversal to one or more root Nodes.

Traversal must track visited Nodes because rare cycles are allowed.

For a fully loaded graph, a root can be derived as a Node with no
incoming Edges. For partial or progressively loaded subgraphs, the API
will eventually need to expose whether a Node has parents outside the
loaded subgraph.

## Performance results

Measurements were taken locally in the browser during PoC development.
They are indicative measurements rather than a formal browser benchmark.
Different libraries expose different lifecycle events, so initialization
and first-render measurements are not perfectly equivalent.

### Main realistic benchmark: 1,000 / 1,020

| Candidate | Initialization / first render | Layout |
|---|---:|---:|
| React Flow | first render 904 ms | Dagre 480 ms |
| Cytoscape | initialization 175 ms | Dagre 428 ms |
| Sigma | initialization 54 ms, first render 29 ms | ForceAtlas2 1,053 ms |

React Flow and Cytoscape produced similarly fast Dagre layouts. React
Flow was considered more intuitive visually. Sigma rendered much faster,
but ForceAtlas2 communicated the directed branching structure less
clearly.

### Upper normal benchmark: 2,000 / 2,040

| Candidate | Initialization / first render | Layout |
|---|---:|---:|
| React Flow | first render 1,856 ms | Dagre 1,551 ms |
| Cytoscape | initialization 670 ms | Grid 2,840 ms; Dagre 1,389 ms |
| Sigma | initialization 56 ms, first render 23 ms | not required |

React Flow and Cytoscape both remained functional:

- zoom, pan, drag, and selection worked;
- Find Node worked;
- Node type filters worked;
- directed path search worked;
- path highlighting worked.

Displaying all 2,000 Nodes with Fit makes labels too small on a small
monitor. This is a viewport and product-design limitation rather than a
reason to reject a candidate.

### Stress-test findings

Cytoscape COSE became unsuitable for large graphs:

- 500 / 1,500: approximately 9,963 ms;
- 1,000 / 5,000: approximately 31,621 ms;
- 1,000 / 1,200 sparse: approximately 36,568 ms.

COSE remains available for small graphs but is not the primary layout.
Dagre is the selected directed layout.

React Flow Dagre on an unrealistically dense graph also degraded
significantly:

- 500 / 1,500: approximately 53,608 ms;
- 1,000 / 5,000: initial rendering approximately 3,394 ms with
  noticeable zoom lag.

These results remain useful as known limits, but they do not represent
the expected production topology.

Sigma was the strongest renderer for very large graphs:

- 5,000 / 20,000:
  - adapter 50 ms;
  - initialization 93 ms;
  - first render 73 ms;
  - Grid 62 ms;
  - Circle 61 ms;
  - ForceAtlas2 with 100 iterations 22,640 ms.

vis-network showed noticeably worse zoom, pan, and drag behaviour already
on 100 / 300. Disabling hover, changing dynamic Edges to static Edges,
and hiding Edges during interaction did not produce a competitive user
experience.

## Bundle sizes

Production build measurements:

| Candidate chunk | Minified | Gzip |
|---|---:|---:|
| React Flow JavaScript | 233.04 kB | 75.37 kB |
| React Flow CSS | 15.41 kB | 2.56 kB |
| React Flow total | 248.45 kB | 77.93 kB |
| Cytoscape + Dagre | 487.91 kB | 155.55 kB |
| Sigma + Graphology | 183.89 kB | 45.47 kB |
| vis-network | 529.02 kB | 161.66 kB |

All candidates are loaded through lazy imports. A candidate renderer is
not included in the initial application chunk until selected.

## Candidate assessment

### React Flow + Dagre

Advantages:

- best visual result for the expected graph topology;
- directed paths and branching levels are intuitive;
- good viewport fitting to search and path results;
- strong React and TypeScript integration;
- highly customizable Nodes;
- convenient foundation for future Node cards and editing;
- acceptable performance for the normal 1,000–2,000 Node range;
- substantially smaller bundle than Cytoscape + Dagre.

Disadvantages:

- dense graphs degrade significantly;
- graph algorithms must be implemented separately;
- slightly less precise mouse targeting was observed;
- displaying the complete large graph with Fit makes Nodes too small;
- Dagre can block the main UI thread for large or dense datasets.

### Cytoscape + Dagre

Advantages:

- mature graph-specific API;
- convenient selection, neighbourhood, filtering, and traversal
  operations;
- good directed Dagre layout;
- good zoom, pan, drag, Find, and path highlighting;
- acceptable performance on realistic datasets;
- strongest reserve candidate.

Disadvantages:

- approximately twice the React Flow bundle size;
- visual result was considered slightly less attractive;
- viewport fitting to paths was considered weaker;
- COSE is too slow for medium and large graphs.

Cytoscape should be reconsidered if graph analysis and traversal
requirements become substantially more complex than the current product
requirements.

### Sigma + Graphology

Advantages:

- best rendering performance;
- smallest candidate bundle;
- strong handling of very large graphs;
- Graphology provides a good graph data model.

Disadvantages:

- more interaction behaviour must be implemented manually;
- ForceAtlas2 communicates the expected directed hierarchy less clearly
  than Dagre;
- path highlighting required stronger hiding of background elements,
  reducing surrounding context;
- ranked third for visual suitability.

Sigma was rejected as the primary renderer because product readability
is more important than maximum renderer throughput in the expected
1,000–2,000 Node range.

### vis-network

Advantages:

- straightforward API;
- built-in interaction and physics capabilities.

Disadvantages:

- visible interaction lag on small benchmark graphs;
- worse visual result than the other candidates;
- largest bundle;
- attempted configuration changes did not make it competitive.

vis-network was rejected.

## Scalability strategy

The number of Nodes stored in the database does not have to equal the
number displayed simultaneously.

For exceptional large graphs, the planned product strategies are:

- filtering before display;
- showing a working subgraph;
- loading one or two levels around a selected Node;
- progressive branch expansion;
- collapsing branches;
- showing only the selected path and nearby context;
- optionally providing an explicit “show full graph” action.

Potential future API operations include:

- graph filtering;
- loading neighbours for a Node;
- loading a subgraph from a root to a requested depth;
- finding a path server-side.

The current `GET /graph` remains the baseline endpoint.

## Future visual extensions

All finalists support changing Node size based on outgoing Edge count.
The initial idea is a configurable tiered scale, for example:

- 0–2 outgoing Edges: standard size;
- 3–5: slightly larger;
- 6–10: larger;
- 11 or more: largest tier.

The exact thresholds and size multipliers are UI configuration and will
be selected using real data.

React Flow Dagre must receive each Node’s actual dimensions when variable
Node sizes are introduced.

Other future improvements:

- configurable upstream/downstream highlighting depth;
- upstream highlighting to roots;
- larger or more forgiving Node hit areas;
- fullscreen graph mode;
- orientation switching between left-to-right and top-to-bottom;
- improved partial-graph navigation.

## Final conclusion

The project will build its frontend graph visualization on React Flow
12.11.5 with @dagrejs/dagre 3.1.1.

Cytoscape.js 3.34.2 with cytoscape-dagre 4.0.1 is retained as the reserve
candidate.

This decision is based on the expected sparse directed topology,
normal graph size of 1,000–2,000 Nodes, product interaction scenarios,
visual readability, extensibility, bundle size, and measured
performance.