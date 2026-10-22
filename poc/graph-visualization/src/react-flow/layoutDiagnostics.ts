/** Bounded, opt-in diagnostics for graph layout interactions.
 * No node labels, descriptions, properties, or coordinate snapshots are collected.
 */
export type LayoutDiagnosticKind =
  | "node-change-batch"
  | "movement"
  | "dirty-check"
  | "graph-render"
  | "layout-phase"
  | "layout-blocked"
  | "layout-api"
  | "recovery-write"
  | "react-commit"
  | "long-task";

export interface LayoutDiagnosticEvent {
  kind: LayoutDiagnosticKind;
  /** Milliseconds since the current page's performance time origin. */
  atMs: number;
  durationMs?: number;
  nodeCount?: number;
  movedCount?: number;
  changeCount?: number;
  changeTypes?: Record<string, number>;
  phase?: string;
  reasons?: string[];
  result?: string;
  bytes?: number;
  queueDelayMs?: number;
  baseDurationMs?: number;
  commitTimeMs?: number;
}

export interface LayoutDiagnosticStats {
  count: number;
  timedCount: number;
  totalDurationMs: number;
  averageDurationMs: number | null;
  maxDurationMs: number | null;
}

export interface LayoutDiagnosticReport {
  version: 1;
  capturedAt: string;
  capacity: number;
  totalEvents: number;
  droppedEvents: number;
  events: LayoutDiagnosticEvent[];
  approximateHeapBytes?: number;
  statistics: Partial<
  Record<LayoutDiagnosticKind, LayoutDiagnosticStats>
>;
}

const DEFAULT_CAPACITY = 1000;

export class LayoutDiagnostics {
  private readonly buffer: (LayoutDiagnosticEvent | undefined)[];
  private next = 0;
  private count = 0;
  private total = 0;
  private readonly statistics = new Map<
  LayoutDiagnosticKind,
  {
    count: number;
    timedCount: number;
    totalDurationMs: number;
    maxDurationMs: number;
  }
>();
  private observer: PerformanceObserver | null = null;

readonly capacity: number;

constructor(capacity = DEFAULT_CAPACITY) {
  this.capacity = capacity;
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000) {
      throw new Error("Diagnostics capacity must be between 1 and 10000");
    }
    this.buffer = new Array(capacity);
  }

  record(event: LayoutDiagnosticEvent): void {
    // Clone mutable nested fields so callers cannot retain or mutate buffer contents.
    this.buffer[this.next] = {
      ...event,
      changeTypes: event.changeTypes ? { ...event.changeTypes } : undefined,
      reasons: event.reasons ? [...event.reasons] : undefined,
    };
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    this.total += 1;
    let stats = this.statistics.get(event.kind);

    if (!stats) {
      stats = {
        count: 0,
        timedCount: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
      };

      this.statistics.set(event.kind, stats);
    }

    stats.count += 1;

    if (
      typeof event.durationMs === "number" &&
      Number.isFinite(event.durationMs) &&
      event.durationMs >= 0
    ) {
      stats.timedCount += 1;
      stats.totalDurationMs += event.durationMs;
      stats.maxDurationMs = Math.max(
        stats.maxDurationMs,
        event.durationMs,
      );
    }
  }

  /** Snapshot ordered oldest to newest. Never includes an unbounded history. */
  events(): LayoutDiagnosticEvent[] {
    const start = (this.next - this.count + this.capacity) % this.capacity;
    return Array.from({ length: this.count }, (_, index) => {
      const item = this.buffer[(start + index) % this.capacity]!;
      return {
        ...item,
        changeTypes: item.changeTypes ? { ...item.changeTypes } : undefined,
        reasons: item.reasons ? [...item.reasons] : undefined,
      };
    });
  }

  stats(): Partial<Record<LayoutDiagnosticKind, LayoutDiagnosticStats>> {
  const result: Partial<
    Record<LayoutDiagnosticKind, LayoutDiagnosticStats>
  > = {};

  for (const [kind, stats] of this.statistics) {
    result[kind] = {
      count: stats.count,
      timedCount: stats.timedCount,
      totalDurationMs: stats.totalDurationMs,
      averageDurationMs:
        stats.timedCount > 0
          ? stats.totalDurationMs / stats.timedCount
          : null,
      maxDurationMs:
        stats.timedCount > 0
          ? stats.maxDurationMs
          : null,
    };
  }

  return result;
}

  report(): LayoutDiagnosticReport {
    const report: LayoutDiagnosticReport = {
      version: 1,
      capturedAt: new Date().toISOString(),
      capacity: this.capacity,
      totalEvents: this.total,
      droppedEvents: this.total - this.count,
      statistics: this.stats(),
      events: this.events(),
    };
    // Chrome exposes this non-standard measurement in some configurations.
    const memory = (globalThis.performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    } | undefined)?.memory;
    if (typeof memory?.usedJSHeapSize === "number" &&
        Number.isFinite(memory.usedJSHeapSize)) {
      report.approximateHeapBytes = memory.usedJSHeapSize;
    }
    return report;
  }

  exportJson(): string {
    return JSON.stringify(this.report(), null, 2);
  }

  startLongTaskObserver(): boolean {
    if (this.observer || typeof PerformanceObserver === "undefined") return !!this.observer;
    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return false;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.record({ kind: "long-task", atMs: entry.startTime, durationMs: entry.duration });
        }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
      return true;
    } catch {
      this.observer?.disconnect();
      this.observer = null;
      return false;
    }
  }

  stopLongTaskObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.next = 0;
    this.count = 0;
    this.total = 0;
    this.statistics.clear();
  }

  dispose(): void {
    this.stopLongTaskObserver();
    this.clear();
  }
}

/** Enable by adding ?layoutDebug=1 to the page URL, never by default. */
export function layoutDiagnosticsEnabled(search: string): boolean {
  return new URLSearchParams(search).get("layoutDebug") === "1";
}
