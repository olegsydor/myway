import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createLayout, fetchLayout, fetchLayouts, saveLayout } from "../shared/layoutApi";
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
}

type Phase = "loading" | "ready" | "saving" | "load-error";

export function usePersistentLayout(options: Options) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [active, setActive] = useState<SavedLayout | null>(null);
  const [saved, setSaved] = useState<LayoutPosition[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ layout: LayoutDetail | null; notice: string } | null>(null);
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
        const layouts = await fetchLayouts(controller.signal);
        const defaultLayout = layouts.find((layout) => layout.is_default) ?? layouts[0];
        const layout = defaultLayout ? await fetchLayout(defaultLayout.id, controller.signal) : null;
        if (!cancelled) setPending({ layout, notice: defaultLayout && !defaultLayout.is_default
          ? "No default layout was found; opened the oldest saved layout." : "" });
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
    setNotice(pending.notice);
    setPending(null);
    setPhase("ready");
  }, [pending, ready, setNodes]);

  useEffect(() => {
    if (!dirty || (phase !== "ready" && phase !== "saving")) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, phase]);

  async function save(): Promise<boolean> {
    const current = latest.current;
    if (lockedRef.current || current.graphBusy || current.nodes.some((node) => node.dragging) ||
        !graphNodesReady(current.nodes, current.nodeIds)) return false;
    // Lock synchronously as well as through React state, preventing a second
    // click/coordinate event in the same frame from changing the sent snapshot.
    inFlight.current = true;
    lockedRef.current = true;
    setPhase("saving");
    setError("");
    setNotice("");
    try {
      const positions = positionSnapshot(current.nodes);
      const accepted = active ? await saveLayout(active.id, positions) : await createLayout("Main", positions);
      if (!alive.current) return false;
      setActive(accepted);
      setSaved(accepted.positions);
      setNotice("Layout saved");
      return true;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Failed to save layout");
      return false;
    } finally {
      inFlight.current = false;
      if (alive.current) { lockedRef.current = false; setPhase("ready"); }
    }
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
    active, dirty, phase, error, notice, blocked,
    locked: phase !== "ready", isLocked, save, discard,
    canDiscard: active !== null && dirty && !blocked,
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
