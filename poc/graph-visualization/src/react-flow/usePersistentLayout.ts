import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createLayout, deleteLayout, fetchLayout, fetchLayouts, saveLayout, updateLayout } from "../shared/layoutApi";
import {
  graphNodesReady, layoutIsDirty, positionSnapshot, restoreLayoutPositions,
  type LayoutDetail, type LayoutPosition, type SavedLayout,
} from "../shared/persistentLayouts";
import type { ReactFlowNode } from "./adapter";

interface Options {
  nodes: ReactFlowNode[];
  nodeIds: number[];
  setNodes: Dispatch<SetStateAction<ReactFlowNode[]>>;
  fallback: () => ReactFlowNode[];
  graphBusy: boolean;
  onRestored: () => void;
  onSwitched: () => void;
}

type Phase = "loading" | "ready" | "saving" | "switching" | "managing" | "load-error";

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
  const latest = useRef(options);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const lockedRef = useRef(true);
  useLayoutEffect(() => {
    latest.current = options;
    lockedRef.current = phase !== "ready" || inFlight.current;
  });
  const isLocked = useCallback(() => lockedRef.current, []);
  const { setNodes } = options;

  const ready = graphNodesReady(options.nodes, options.nodeIds);
  const dragging = options.nodes.some((node) => node.dragging);
  const dirty = useMemo(() => layoutIsDirty(options.nodes, saved), [options.nodes, saved]);
  const blocked = phase !== "ready" || options.graphBusy || dragging || !ready;

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
    if (pending.layout) {
      const positions = pending.layout.positions;
      const fallback = latest.current.fallback();
      setNodes((nodes) => restoreLayoutPositions(nodes, positions, fallback));
      setActive(pending.layout);
      setSaved(positions);
      latest.current.onRestored();
    } else {
      setActive(null);
      setSaved(null);
    }
    setLayouts(pending.layouts);
    setNotice(pending.notice);
    setPending(null);
    setPhase("ready");
    setStartupReady(true);
  }, [pending, ready, setNodes]);

  useEffect(() => {
    if (!dirty || phase === "loading" || phase === "load-error") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, phase]);

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

  async function persistCurrent() {
    const positions = positionSnapshot(latest.current.nodes);
    const accepted = active ? await saveLayout(active.id, positions) : await createLayout("Main", positions);
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
      const accepted = await createLayout(name.trim(), positionSnapshot(latest.current.nodes));
      if (alive.current) {
        acceptSnapshot(accepted);
        latest.current.onSwitched();
        setNotice("New layout saved");
      }
    });
  }

  function switchTo(id: number, choice: "save" | "discard" | "cancel"): Promise<boolean> {
    if (choice === "cancel") return Promise.resolve(false);
    if (id === active?.id) return Promise.resolve(true);
    return operate("switching", async () => {
      if (choice === "save") await persistCurrent();
      if (!alive.current) return;
      const accepted = await fetchLayout(id);
      // Fetch success is required before either coordinates or active identity
      // changes. A failed discard-and-switch preserves the unsaved canvas.
      if (alive.current) { applyLayout(accepted); setNotice("Layout opened"); }
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
      await deleteLayout(active.id);
      if (alive.current) {
        setLayouts((previous) => previous.filter((layout) => layout.id !== active.id));
        applyLayout(destination);
        setNotice("Layout deleted; default layout opened");
      }
    });
  }

  function discard() {
    if (blocked || lockedRef.current || saved === null) return;
    const fallback = latest.current.fallback();
    options.setNodes((nodes) => restoreLayoutPositions(nodes, saved, fallback));
    setError("");
    const ids = new Set(saved.map((position) => position.node_id));
    const hasMissing = latest.current.nodes.some((node) => !ids.has(node.data.originalId));
    setNotice(hasMissing ? "Saved positions restored. New nodes still need saving." : "Saved positions restored");
    latest.current.onRestored();
  }

  return {
    active, layouts, dirty, phase, startupReady, error, notice, blocked,
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
