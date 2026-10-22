# Stage 13 — Layout Diagnostics

## Purpose

Investigate performance degradation and occasional UI freezes when working with large graphs, without introducing premature optimizations or changing existing graph behavior.

## Implementation

- Development-only diagnostics enabled with `?layoutDebug=1`.
- Bounded ring buffer containing the latest 1,000 diagnostic events.
- Aggregated event counts and duration statistics retained across the entire session.
- React Profiler instrumentation for React Flow rendering.
- Long Task observation where supported by the browser.
- Layout lifecycle, dirty-check, movement and node-change diagnostics.
- JSON export without node labels, properties or coordinates.

## Validation

- Automated tests: 45 passed, 0 failed.
- Production build: successful.
- `git diff --check`: clean.
- Stress testing performed with 503 nodes.

## Findings

The initial extended stress test did not reproduce progressive performance degradation or user-visible freezes.

Movement processing and dirty checks remained inexpensive.

React Profiler measurements from the subsequent diagnostic session:

| Metric | Average | Maximum |
|---|---:|---:|
| React rendering | 2.54 ms | 63.4 ms |
| Movement processing | 0.07 ms | 0.6 ms |
| Dirty check | 0.08 ms | 0.3 ms |

React rendering accounts for considerably more measured work than the coordinate-processing callbacks. However, no consistent performance degradation has been established.

## Limitations

- The ring buffer retains only the latest 1,000 events; aggregated statistics preserve overall counts and timing data.
- Profiler measurements do not include all browser layout, paint and compositing costs.
- Development-mode measurements are not directly equivalent to production performance.
- Heap snapshots are approximate and insufficient alone to establish memory leaks.
- The original intermittent freeze has not been reproduced or explained.

## Decision

Do not introduce performance optimizations without evidence of a specific bottleneck.

Retain development diagnostics for investigating future incidents. If a freeze recurs, export the diagnostic report before reloading the page.

Checkpoint 1B is ready for acceptance.
