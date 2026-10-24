import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createLayout, deleteLayout, fetchLayout, fetchLayouts, saveLayout, updateLayout } from "../shared/layoutApi";
import {
  graphNodesReady, layoutIsDirty, positionSnapshot, restoreLayoutPositions,
  type LayoutDetail, type LayoutPosition, type SavedLayout,
} from "../shared/persistentLayouts";
import type { ReactFlowNode } from "./adapter";
import type { LayoutDiagnostics } from "./layoutDiagnostics";
import {
  checkStartupRecovery,
} from "./layoutRecoveryStartup";


import type {
  LayoutRecoveryRecord,
} from "./layoutRecovery";
import { LayoutRecoveryController } from "./layoutRecoveryController";
import { createRecoveryRecord } from "./layoutRecovery";

interface Options {
  nodes: ReactFlowNode[];
  nodeIds: number[];
  recoveryScope: string | null;
  setNodes: Dispatch<SetStateAction<ReactFlowNode[]>>;
  fallback: () => ReactFlowNode[];
  graphBusy: boolean;
  onRestored: () => void;
  onSwitched: () => void;
  diagnostics?: LayoutDiagnostics | null;
}

type Phase =
  | "loading"
  | "recovery"
  | "ready"
  | "saving"
  | "switching"
  | "managing"
  | "load-error";

export function usePersistentLayout(options: Options) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [startupReady, setStartupReady] = useState(false);
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [active, setActive] = useState<SavedLayout | null>(null);
  const [saved, setSaved] = useState<LayoutPosition[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ layouts: SavedLayout[]; layout: LayoutDetail | null; notice: string } | null>(null);
  const [recoveryOffer, setRecoveryOffer] =
    useState<LayoutRecoveryRecord | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const latest = useRef(options);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const lockedRef = useRef(true);
  const recoveryControllerRef =
    useRef<LayoutRecoveryController | null>(null);
  useEffect(() => {
  const controller = new LayoutRecoveryController({
    debounceMs: 500,
    onError: (error) => {
      console.warn("Layout recovery operation failed:", error);
    },
  });

  recoveryControllerRef.current = controller;

  return () => {
    controller.dispose();

    if (recoveryControllerRef.current === controller) {
      recoveryControllerRef.current = null;
    }
  };
}, []);
  useLayoutEffect(() => {
    latest.current = options;
    lockedRef.current = phase !== "ready" || inFlight.current;
  });
  const isLocked = useCallback(() => lockedRef.current, []);
  const { setNodes } = options;

  const ready = graphNodesReady(options.nodes, options.nodeIds);
  const dragging = options.nodes.some((node) => node.dragging);
  const dirty = useMemo(() => {
  const startedAt = performance.now();

  const result = layoutIsDirty(options.nodes, saved);

  options.diagnostics?.record({
    kind: "dirty-check",
    atMs: startedAt,
    durationMs: performance.now() - startedAt,
    nodeCount: options.nodes.length,
    result: result ? "dirty" : "clean",
  });

  return result;
}, [options.nodes, saved, options.diagnostics]);
  const blocked = phase !== "ready" || options.graphBusy || dragging || !ready;
    useEffect(() => {
    const diagnostics = options.diagnostics;

    if (!diagnostics) return;

    const reasons: string[] = [];

    if (phase !== "ready") {
      reasons.push(`phase:${phase}`);
    }

    if (options.graphBusy) {
      reasons.push("graph-busy");
    }

    if (dragging) {
      reasons.push("dragging");
    }

    if (!ready) {
      reasons.push("graph-not-ready");
    }

    diagnostics.record({
      kind: "layout-phase",
      atMs: performance.now(),
      phase,
      nodeCount: options.nodes.length,
    });

    diagnostics.record({
      kind: "layout-blocked",
      atMs: performance.now(),
      phase,
      reasons,
      result: reasons.length > 0 ? "blocked" : "available",
    });
  }, [
    phase,
    options.graphBusy,
    dragging,
    ready,
    options.diagnostics,
  ]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const owned = await fetchLayouts(controller.signal);
        const defaultLayout = owned.find((layout) => layout.is_default) ?? owned[0];
        const layout = defaultLayout ? await fetchLayout(defaultLayout.id, controller.signal) : null;
        if (!cancelled) setPending({ layouts: owned, layout, notice: defaultLayout && !defaultLayout.is_default
          ? "No default layout was found; opened the oldest saved layout. Choose Set as default to use it on startup." : "" });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load layouts");
          setPhase("load-error");
        }
      }
    })();
    return () => { cancelled = true; alive.current = false; controller.abort(); };
  }, [attempt]);

useEffect(() => {
  if (!pending || !ready) return;

  let cancelled = false;

  const startup = pending;
  const scope = options.recoveryScope;

  async function initializeLayout() {
    let offer: LayoutRecoveryRecord | null = null;

    if (scope !== null && startup.layout !== null) {
      const layoutId = startup.layout.id;

      const result = await checkStartupRecovery(
        () => {
          const controller = recoveryControllerRef.current;

          if (!controller) {
            return Promise.reject(
              new Error("Recovery controller unavailable"),
            );
          }

          return controller.read(scope, layoutId);
        },
        scope,
        layoutId,
        latest.current.nodeIds,
        startup.layout.positions,
      );

      if (result.status === "available") {
        offer = result.record;
      } else if (
        result.status === "unavailable" ||
        result.status === "incompatible"
      ) {
        console.warn(
          "Layout recovery could not be offered:",
          result.status === "unavailable"
            ? result.error
            : result.reason,
        );
      }
    }

    if (cancelled) return;

    if (startup.layout) {
      const positions = startup.layout.positions;
      const fallback = latest.current.fallback();

      setNodes((nodes) =>
        restoreLayoutPositions(nodes, positions, fallback),
      );

      setActive(startup.layout);
      setSaved(positions);
      latest.current.onRestored();
    } else {
      setActive(null);
      setSaved(null);
    }

    setRecoveryOffer(offer);
    setLayouts(startup.layouts);
    setNotice(startup.notice);
    setPending(null);

    if (offer) {
      setPhase("recovery");
      setStartupReady(false);
    } else {
      setPhase("ready");
      setStartupReady(true);
    }
  }

  void initializeLayout();

  return () => {
    cancelled = true;
  };
}, [pending, ready, options.recoveryScope, setNodes]);

  useEffect(() => {
    if (!dirty || phase === "loading" || phase === "load-error") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, phase]);

  useEffect(() => {
    const scope = options.recoveryScope;
    const controller = recoveryControllerRef.current;

    console.log("[Recovery] state", {
      hasController: Boolean(controller),
      scope,
      activeLayoutId: active?.id ?? null,
      hasSaved: saved !== null,
      startupReady,
      phase,
      ready,
      dirty,
      dragging,
      graphBusy: options.graphBusy,
    });
    if (
      !controller ||
      !scope ||
      !active ||
      !saved ||
      !startupReady ||
      phase !== "ready" ||
      !ready ||
      !dirty ||
      dragging ||
      options.graphBusy
    ) {
      return;
    }

    try {
      const record = createRecoveryRecord(
        scope,
        active.id,
        options.nodes,
        saved,
      );

      const generation = controller.getGeneration(
        scope,
        active.id,
      );

      controller.schedule(record, generation);
      console.log("[Recovery] scheduled", {
        scope,
        layoutId: active.id,
        positions: record.positions.length,
        generation,
      });
    } catch (cause) {
      console.warn(
        "Failed to prepare layout recovery snapshot:",
        cause,
      );
    }
  }, [
    options.recoveryScope,
    options.nodes,
    options.graphBusy,
    active,
    saved,
    startupReady,
    phase,
    ready,
    dirty,
    dragging,
  ]);

  function remember(accepted: SavedLayout) {
    setLayouts((previous) => {
      const rest = previous.filter((layout) => layout.id !== accepted.id).map((layout) =>
        accepted.is_default ? { ...layout, is_default: false } : layout);
      return [...rest, accepted].sort((a, b) => a.id - b.id);
    });
  }

  function acceptSnapshot(accepted: LayoutDetail) {
    remember(accepted);
    setActive(accepted);
    setSaved(accepted.positions);
  }

  function applyLayout(accepted: LayoutDetail) {
    const fallback = latest.current.fallback();
    latest.current.setNodes((nodes) => restoreLayoutPositions(nodes, accepted.positions, fallback));
    acceptSnapshot(accepted);
    latest.current.onSwitched();
    latest.current.onRestored();
  }

  async function operate(nextPhase: Phase, action: () => Promise<void>): Promise<boolean> {
    const current = latest.current;
    if (lockedRef.current || current.graphBusy || current.nodes.some((node) => node.dragging) ||
        !graphNodesReady(current.nodes, current.nodeIds)) return false;
    // A synchronous lock covers the gap before React renders the busy state.
    inFlight.current = true;
    lockedRef.current = true;
    setPhase(nextPhase);
    setError("");
    setNotice("");
    try {
      await action();
      return alive.current;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Layout operation failed");
      return false;
    } finally {
      inFlight.current = false;
      if (alive.current) { lockedRef.current = false; setPhase("ready"); }
    }
  }

  async function clearLocalRecovery(
    layoutId: number | null,
  ): Promise<void> {
    const controller = recoveryControllerRef.current;
    const scope = latest.current.recoveryScope;

    if (!controller || !scope) return;

    try {
      await controller.clear(scope, layoutId);
    } catch (cause) {
      console.warn(
        "Failed to clear local layout recovery:",
        cause,
      );
    }
  }

  async function persistCurrent() {
    const current = latest.current;
    const positions = positionSnapshot(current.nodes);
    const previousLayoutId = active?.id ?? null;

    const accepted = active
      ? await saveLayout(active.id, positions)
      : await createLayout("Main", positions);

    // Server save succeeded. Invalidate the old local recovery.
    await clearLocalRecovery(previousLayoutId);

    if (alive.current) acceptSnapshot(accepted);
  }

  function save(): Promise<boolean> {
    return operate("saving", async () => {
      await persistCurrent();
      if (alive.current) setNotice("Layout saved");
    });
  }

  function saveAsNew(name: string): Promise<boolean> {
    return operate("saving", async () => {
      const previousLayoutId = active?.id ?? null;

      const accepted = await createLayout(
        name.trim(),
        positionSnapshot(latest.current.nodes),
      );

      await clearLocalRecovery(previousLayoutId);

      if (alive.current) {
        acceptSnapshot(accepted);
        latest.current.onSwitched();
        setNotice("New layout saved");
      }
    });
  }

  function switchTo(
    id: number,
    choice: "save" | "discard" | "cancel",
  ): Promise<boolean> {
    if (choice === "cancel") return Promise.resolve(false);
    if (id === active?.id) return Promise.resolve(true);

    return operate("switching", async () => {
      const previousLayoutId = active?.id ?? null;

      if (choice === "save") {
        await persistCurrent();
      }

      if (!alive.current) return;

      const accepted = await fetchLayout(id);

      // Fetch success is required before discarding
      // the current unsaved canvas.
      if (!alive.current) return;

      if (choice === "discard") {
        await clearLocalRecovery(previousLayoutId);
      }

      if (alive.current) {
        applyLayout(accepted);
        setNotice("Layout opened");
      }
    });
  }

  function rename(name: string): Promise<boolean> {
    if (!active) return Promise.resolve(false);
    return operate("managing", async () => {
      const accepted = await updateLayout(active.id, { name: name.trim() });
      if (alive.current) {
        remember(accepted);
        setActive(accepted);
        setNotice("Layout renamed");
      }
    });
  }

  function setDefault(): Promise<boolean> {
    if (!active) return Promise.resolve(false);
    return operate("managing", async () => {
      const accepted = await updateLayout(active.id, { is_default: true });
      if (alive.current) {
        remember(accepted);
        setActive(accepted);
        setNotice("Default layout updated");
      }
    });
  }

  const defaultLayout = layouts.find((layout) => layout.is_default);
  const canDelete = active !== null && !active.is_default && layouts.length > 1 && Boolean(defaultLayout);

  function deleteActive(): Promise<boolean> {
    if (!canDelete || !active || !defaultLayout) return Promise.resolve(false);
    return operate("managing", async () => {
      // Fetch the destination first: a load failure must not delete the current
      // layout and leave the user with no usable destination on the canvas.
      const destination = await fetchLayout(defaultLayout.id);
      if (!alive.current) return;
      const deletedLayoutId = active.id;

      await deleteLayout(deletedLayoutId);
      await clearLocalRecovery(deletedLayoutId);

      if (alive.current) {
        setLayouts((previous) => previous.filter((layout) => layout.id !== active.id));
        applyLayout(destination);
        setNotice("Layout deleted; default layout opened");
      }
    });
  }

  function discard(): Promise<boolean> {
    if (blocked || lockedRef.current || saved === null) {
      return Promise.resolve(false);
    }

    const savedPositions = saved;
    const currentLayoutId = active?.id ?? null;

    return operate("managing", async () => {
      await clearLocalRecovery(currentLayoutId);

      if (!alive.current) return;

      const fallback = latest.current.fallback();

      latest.current.setNodes((nodes) =>
        restoreLayoutPositions(
          nodes,
          savedPositions,
          fallback,
        ),
      );

      const ids = new Set(
        savedPositions.map((position) => position.node_id),
      );

      const hasMissing = latest.current.nodes.some(
        (node) => !ids.has(node.data.originalId),
      );

      setNotice(
        hasMissing
          ? "Saved positions restored. New nodes still need saving."
          : "Saved positions restored",
      );

      latest.current.onRestored();
    });
  }


  function restoreRecovery(): void {
  if (
    phase !== "recovery" ||
    !recoveryOffer ||
    !options.recoveryScope
  ) {
    return;
  }

  const fallback = latest.current.fallback();

  latest.current.setNodes((nodes) =>
    restoreLayoutPositions(
      nodes,
      recoveryOffer.positions,
      fallback,
    ),
  );

  setRecoveryOffer(null);
  setError("");
  setNotice("Recovered unsaved positions. Use Save Layout to keep them.");
  setPhase("ready");
  setStartupReady(true);

  latest.current.onRestored();
}

async function discardRecovery(): Promise<void> {
  if (
    phase !== "recovery" ||
    !recoveryOffer ||
    !options.recoveryScope ||
    recoveryBusy
  ) {
    return;
  }

  setRecoveryBusy(true);
  setError("");

  try {
    const controller = recoveryControllerRef.current;

    if (!controller) {
      throw new Error("Recovery controller unavailable");
    }

    await controller.clear(
      options.recoveryScope,
      recoveryOffer.layoutId,
    );

    if (!alive.current) return;

    setRecoveryOffer(null);
    setNotice("Local recovery discarded");
    setPhase("ready");
    setStartupReady(true);
  } catch (cause) {
    if (alive.current) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to discard local recovery",
      );
    }
  } finally {
    if (alive.current) {
      setRecoveryBusy(false);
    }
  }
}

  return {
    active, layouts, dirty, phase, startupReady,
    recoveryOffer,
    recoveryBusy,
    restoreRecovery,
    discardRecovery,
    error, notice, blocked,
    locked: phase !== "ready", isLocked, save, discard, saveAsNew, switchTo, rename, setDefault, deleteActive,
    canDelete, canDiscard: active !== null && dirty && !blocked,
    clearError: () => setError(""),
    retry: () => {
      if (!inFlight.current) {
        lockedRef.current = true;
        setPhase("loading");
        setError("");
        setAttempt((value) => value + 1);
      }
    },
  };
}
