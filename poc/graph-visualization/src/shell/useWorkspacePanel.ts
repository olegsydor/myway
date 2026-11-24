import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { initialPanelPreference, rememberPanelPreference, panelPresentation, WORKSPACE_PANEL_ID,
  type GraphPanelView, type PanelView } from './workspacePanelState.ts';

function storage() {
  try { return window.localStorage; } catch { return null; }
}
const subscribe = (listener: () => void) => {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
};
const presentation = () => panelPresentation(window.innerWidth);
const modalSelector = 'dialog[open], [role="dialog"][aria-modal="true"]';

function firstControl(view: GraphPanelView) {
  if (view === 'create-node') return '[data-create-name]';
  return view === 'search' ? '#react-flow-graph-search' : '#create-edge-source';
}

export function useWorkspacePanel(annotationMode: boolean) {
  const [graph, setGraph] = useState(() => {
    const initial = initialPanelPreference(window.innerWidth, storage());
    return { preference: initial.preference, persist: initial.migrated };
  });
  const [annotations, setAnnotations] = useState({ active: annotationMode, open: true });
  const [focusRequest, setFocusRequest] = useState<{ view: PanelView; control: string } | null>(null);
  const session = useRef({ open: false, view: 'search' as PanelView });
  const graphInvoker = useRef<HTMLElement | null>(null);
  const annotationInvoker = useRef<HTMLElement | null>(null);
  const mode = useSyncExternalStore(subscribe, presentation, () => 'docked' as const);
  if (annotations.active !== annotationMode) {
    setAnnotations({ active: annotationMode, open: true });
    setFocusRequest(null);
  }
  const open = annotationMode ? annotations.open : graph.preference.open;
  const view: PanelView = annotationMode ? 'annotations' : graph.preference.graphView;

  useLayoutEffect(() => { session.current = { open, view }; }, [open, view]);

  useEffect(() => {
    if (graph.persist) rememberPanelPreference(graph.preference, storage());
  }, [graph]);

  useLayoutEffect(() => {
    if (!annotationMode) annotationInvoker.current = null;
  }, [annotationMode]);

  useEffect(() => {
    if (!open || !focusRequest || focusRequest.view !== view) return;
    const frame = requestAnimationFrame(() => {
      setFocusRequest(null);
      if (document.querySelector(modalSelector)) return;
      const control = document.querySelector<HTMLElement>(
        `#${WORKSPACE_PANEL_ID} [data-panel-view="${view}"] ${focusRequest.control}`,
      );
      if (control?.matches(':enabled') && !control.closest('[hidden]')) {
        control.focus({ preventScroll: true });
        control.scrollIntoView({ block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, open, view]);

  function openGraph(next: GraphPanelView, invoker?: HTMLElement, focus = true) {
    if (annotationMode) return;
    if (invoker) graphInvoker.current = invoker;
    setGraph({ preference: { open: true, graphView: next }, persist: true });
    const control = firstControl(next);
    setFocusRequest(focus ? { view: next, control } : null);
  }
  function openAnnotations(invoker?: HTMLElement) {
    if (!annotationMode) return;
    if (invoker) annotationInvoker.current = invoker;
    setAnnotations({ active: true, open: true });
  }
  function close(invoker?: HTMLElement) {
    if (document.querySelector(modalSelector)) return;
    setFocusRequest(null);
    if (annotationMode) setAnnotations({ active: true, open: false });
    else setGraph({ preference: { open: false, graphView: graph.preference.graphView }, persist: true });
    if (document.activeElement?.closest('[data-annotation-editor]')) return;
    const target = invoker ?? (annotationMode ? annotationInvoker.current : graphInvoker.current);
    if (target?.isConnected && !target.closest('[hidden], :disabled')) target.focus();
    else {
      const canvas = annotationMode || !target ? null : document.querySelector<HTMLElement>('.react-flow-container');
      (canvas ?? document.querySelector<HTMLElement>('[data-panel-launcher]'))?.focus();
    }
  }
  function launch(invoker: HTMLElement) {
    if (annotationMode) {
      if (open) close(invoker);
      else openAnnotations(invoker);
    } else if (open && view === 'search') close(invoker);
    else openGraph('search', invoker);
  }

  function focusField(next: Exclude<GraphPanelView, 'search'>, control: string) {
    setFocusRequest({ view: next, control });
  }

  function focusAfterSubmit(next: Exclude<GraphPanelView, 'search'>) {
    const started = session.current;
    return () => {
      // Returning to the same view starts a new focus session.
      if (session.current !== started || !started.open || started.view !== next) return;
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest(`[data-panel-view="${next}"]`)) return;
      setFocusRequest({ view: next, control: firstControl(next) });
    };
  }

  return {
    focusAfterSubmit, focusField,
    open, view, mode, close, launch, openAnnotations,
    openCreateNode: (invoker?: HTMLElement, focus = true) => openGraph('create-node', invoker, focus),
    openCreateEdge: (invoker?: HTMLElement, focus = true) => openGraph('create-edge', invoker, focus),
    openSearch: (invoker?: HTMLElement, focus = true) => openGraph('search', invoker, focus),
  };
}
