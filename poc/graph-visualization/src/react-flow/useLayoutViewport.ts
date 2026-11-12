import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { ReactFlowNode, ReactFlowEdge } from "./adapter";
import { LayoutViewportCoordinator } from "./layoutViewport.ts";
import type { LayoutViewport } from "./workspacePreferences.ts";

export function useLayoutViewport(options: {
  scope: string | null; id: number | null; startupReady: boolean; flowReady: boolean;
  transition: { generation: number; preserve: boolean };
  instance: RefObject<ReactFlowInstance<ReactFlowNode, ReactFlowEdge> | null>;
}) {
  const [completed, setCompleted] = useState<{ scope: string | null; id: number | null; transition: typeof options.transition; token: number } | null>(null);
  const [coordinator] = useState(() => new LayoutViewportCoordinator());
  const { scope, id, startupReady, flowReady, transition, instance } = options;
  useLayoutEffect(() => {
    const current = coordinator.begin(scope, id);
    if (!startupReady || !flowReady || !instance.current) return;
    const flow = instance.current;
    // Interrupt any outgoing camera animation before initializing the destination.
    void flow.setViewport(flow.getViewport(), { duration: 0 });
    let frame = 0;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void (async () => {
          if (!coordinator.current(current)) return;
          if (!transition.preserve) {
            const stored = coordinator.stored();
            if (stored) await flow.setViewport(stored, { duration: 0 });
            else await flow.fitView({ padding: 0.1, duration: 0 });
          }
          if (coordinator.finish(current, flow.getViewport())) setCompleted({ scope, id, transition, token: current });
        })();
      });
    });
    return () => { cancelAnimationFrame(frame); coordinator.cancel(); };
  }, [scope, id, startupReady, flowReady, transition, instance, coordinator]);

  // Render-bound callbacks retain their generation across async programmatic Fits.
  const generation = completed?.token ?? -1;
  const ready = startupReady && flowReady && completed?.scope === scope && completed?.id === id && completed?.transition === transition;
  const moved = useCallback((_event: unknown, viewport: LayoutViewport) => {
    coordinator.moved(generation, viewport);
  }, [coordinator, generation]);
  const fit = useCallback(async (fitOptions: Parameters<ReactFlowInstance<ReactFlowNode, ReactFlowEdge>["fitView"]>[0]) => {
    const flow = instance.current;
    if (!flow || !coordinator.current(generation)) return;
    await flow.fitView(fitOptions);
    coordinator.moved(generation, flow.getViewport());
  }, [instance, coordinator, generation]);
  return { ready, moved, fit };
}
