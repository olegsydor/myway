import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

/** Presentation adapter only: controllers retain locking, confirmations and mutations. */
export interface Command { enabled: boolean; disabledReason?: string; run: () => void }
export interface CommandState {
  annotationMode: boolean; blocked: boolean; locked: boolean; dirty: boolean; saveProtected?: boolean; ready?: boolean; nodeLimitReason?: string;
}
export function workspaceCommands(state: CommandState, handlers: {
  save: () => unknown;
  focusForm: (form: "createNode" | "createEdge") => void;
  arrange: (name: "grid" | "circle" | "dagre") => void;
  fit: () => void;
  reset: () => void;
}) {
  const command = (enabled: boolean, run: () => unknown): Command => ({
    enabled, run: () => { if (enabled) void run(); },
  });
  const graphAvailable = !state.annotationMode && !state.blocked && !state.locked;
  return {
    save: command(state.dirty && !state.blocked && !state.locked && !state.saveProtected, handlers.save),
    createNode: {
      ...command(graphAvailable && !state.nodeLimitReason, () => handlers.focusForm("createNode")),
      disabledReason: state.nodeLimitReason,
    },
    createEdge: command(graphAvailable, () => handlers.focusForm("createEdge")),
    grid: command(graphAvailable, () => handlers.arrange("grid")),
    circle: command(graphAvailable, () => handlers.arrange("circle")),
    dagre: command(graphAvailable, () => handlers.arrange("dagre")),
    // View commands do not mutate workspace snapshots or layout dirty state.
    fit: command(state.ready !== false, handlers.fit),
    reset: command(state.ready !== false && !state.annotationMode, handlers.reset),
  };
}

/** Stable command identities; invoke the latest committed controller callbacks. */
export function useWorkspaceCommands(state: CommandState, handlers: Parameters<typeof workspaceCommands>[1]) {
  const latest = useRef(handlers);
  useLayoutEffect(() => { latest.current = handlers; });
  const { annotationMode, blocked, locked, dirty, saveProtected, ready, nodeLimitReason } = state;
  const save = useCallback(() => latest.current.save(), []);
  const focusForm = useCallback((form: "createNode" | "createEdge") => latest.current.focusForm(form), []);
  const arrange = useCallback((name: "grid" | "circle" | "dagre") => latest.current.arrange(name), []);
  const fit = useCallback(() => latest.current.fit(), []);
  const reset = useCallback(() => latest.current.reset(), []);
  // The factory stores callbacks; it never invokes them during render.
  // oxlint-disable-next-line react/refs -- Ref reads occur only when a command is invoked.
  return useMemo(() => workspaceCommands({ annotationMode, blocked, locked, dirty, saveProtected, ready, nodeLimitReason }, {
    save, focusForm, arrange, fit, reset,
  }), [annotationMode, blocked, locked, dirty, saveProtected, ready, nodeLimitReason, save, focusForm, arrange, fit, reset]);
}
