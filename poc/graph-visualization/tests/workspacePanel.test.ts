import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, useEffect, useLayoutEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { initialPanelPreference, panelPresentation, WORKSPACE_PANEL_PREFERENCE, LEGACY_PANEL_PREFERENCE,
  type PanelView } from '../src/shell/workspacePanelState.ts';
import { useWorkspacePanel } from '../src/shell/useWorkspacePanel.ts';
import { useAnnotationWorkspace } from '../src/react-flow/useAnnotationWorkspace.ts';
import { workspaceSnapshot, workspaceIsDirty } from '../src/shared/persistentLayouts.ts';
import { rectangle, text } from './annotationFixtures.ts';
import { tsxModule } from './loadTsx.ts';
const { WorkspacePanel } = await import(tsxModule(new URL('../src/shell/WorkspacePanel.tsx', import.meta.url)));

function memory(legacy?: string) {
  const values = new Map<string, string>();
  if (legacy) values.set(LEGACY_PANEL_PREFERENCE, legacy);
  return { values, storage: { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } } };
}

test('preference migrates both v1 values, validates v2, and tolerates storage failure', () => {
  const preference = (open: boolean, graphView = 'search') => ({ open, graphView });
  for (const width of [800, 1199, 1200, 1500]) {
    assert.deepEqual(initialPanelPreference(width, memory('open').storage), { preference: preference(true), migrated: true });
    assert.deepEqual(initialPanelPreference(width, memory('closed').storage), { preference: preference(false), migrated: true });
    assert.deepEqual(initialPanelPreference(width, memory('broken').storage).preference, preference(width >= 1200));
    assert.deepEqual(initialPanelPreference(width, { getItem() { throw Error('blocked'); }, setItem() {} }).preference,
      preference(width >= 1200));
  }
  const store = memory('open');
  for (const corrupt of ['{', 'null', '{"open":true,"graphView":"annotations"}']) {
    store.values.set(WORKSPACE_PANEL_PREFERENCE, corrupt);
    assert.deepEqual(initialPanelPreference(800, store.storage).preference, preference(false));
  }
  store.values.set(WORKSPACE_PANEL_PREFERENCE, JSON.stringify(preference(false, 'create-edge')));
  assert.deepEqual(initialPanelPreference(1500, store.storage).preference, preference(false, 'create-edge'));
  assert.equal(panelPresentation(1099), 'overlay');
  assert.equal(panelPresentation(1100), 'docked');
});

test('controller restores graph preference, routes launcher, and drops stale submit focus', async () => {
  const previous = { window: globalThis.window, document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const store = memory('closed');
  const frames = new Map<number, FrameRequestCallback>();
  const resize = new Set<() => void>();
  let frame = 0;
  let modalOpen = false;
  const calls: string[] = [];
  const invoker = { isConnected: true, closest: () => null, focus: () => calls.push('invoker') } as unknown as HTMLElement;
  const browser = { innerWidth: 1300, localStorage: store.storage,
    addEventListener: (_: string, fn: () => void) => resize.add(fn), removeEventListener: (_: string, fn: () => void) => resize.delete(fn) };
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true, window: browser,
    document: { activeElement: null, querySelector: (selector: string) => {
      if (selector.startsWith('dialog')) return modalOpen ? {} : null;
      if (!selector.startsWith('#myway-')) return null;
      return { matches: () => true, closest: () => null, focus: () => calls.push(selector), scrollIntoView() {} };
    } },
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++frame, fn); return frame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  let panel: ReturnType<typeof useWorkspacePanel>;
  let root: ReturnType<typeof create>;
  function Harness({ annotation }: { annotation: boolean }) {
    const value = useWorkspacePanel(annotation);
    useLayoutEffect(() => { panel = value; });
    return null;
  }
  const flush = async () => act(async () => {
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(0));
  });
  try {
    await act(async () => { root = create(createElement(Harness, { annotation: false })); });
    assert.equal(panel!.open, false);
    assert.deepEqual(JSON.parse(store.values.get(WORKSPACE_PANEL_PREFERENCE)!), { open: false, graphView: 'search' });
    await act(async () => panel.launch(invoker));
    assert.equal(panel!.open, true);
    await flush();
    assert.match(calls.at(-1)!, /graph-search/);
    await act(async () => panel.launch(invoker));
    assert.equal(panel!.open, false);
    assert.equal(calls.at(-1), 'invoker');
    await act(async () => panel.openCreateNode(invoker));
    await flush();
    assert.match(calls.at(-1)!, /data-create-name/);
    const stillCreating = panel!.focusAfterSubmit('create-node');
    await act(async () => stillCreating());
    await flush();
    assert.match(calls.at(-1)!, /data-create-name/);
    const delayed = panel!.focusAfterSubmit('create-node');
    await act(async () => panel.launch(invoker));
    await flush();
    const count = calls.length;
    await act(async () => delayed());
    await flush();
    assert.equal(calls.length, count);
    assert.equal(panel!.view, 'search');
    assert.match(calls.at(-1)!, /graph-search/);
    await act(async () => panel.openCreateEdge(invoker));
    await flush();
    assert.match(calls.at(-1)!, /create-edge-source/);
    const callsBeforeModal = calls.length;
    const pendingSubmit = panel!.focusAfterSubmit('create-edge');
    await act(async () => pendingSubmit());
    modalOpen = true;
    await flush();
    await act(async () => panel.close());
    assert.equal(panel!.open, true);
    assert.equal(calls.length, callsBeforeModal);
    modalOpen = false;
    await flush();
    assert.equal(calls.length, callsBeforeModal);
    await act(async () => { browser.innerWidth = 900; resize.forEach(fn => fn()); });
    assert.equal(panel!.mode, 'overlay');
    assert.equal(panel!.view, 'create-edge');
    const saved = store.values.get(WORKSPACE_PANEL_PREFERENCE);
    await act(async () => root.update(createElement(Harness, { annotation: true })));
    assert.equal(panel!.view, 'annotations');
    assert.equal(panel!.open, true);
    await act(async () => panel.close());
    assert.equal(panel!.open, false);
    assert.equal(store.values.get(WORKSPACE_PANEL_PREFERENCE), saved);
    await act(async () => root.update(createElement(Harness, { annotation: false })));
    assert.equal(panel!.view, 'create-edge');
    assert.equal(panel!.open, true);
    await act(async () => panel.close());
    await act(async () => root.update(createElement(Harness, { annotation: true })));
    assert.equal(panel!.open, true);
    await act(async () => root.update(createElement(Harness, { annotation: false })));
    assert.equal(panel!.open, false);
    assert.equal(panel!.view, 'create-edge');
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, previous); }
  assert.equal(resize.size, 0);
});

test('all views stay mounted with independent scroll across contextual editing and close', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let mounted = 0, unmounted = 0, closed = 0;
  const scroller = { scrollTop: 0 };
  function Draft() {
    const [value, setValue] = useState('');
    useEffect(() => { mounted++; return () => { unmounted++; }; }, []);
    return createElement('input', { value, onChange: (event: { target: { value: string } }) => setValue(event.target.value) });
  }
  const views: PanelView[] = ['create-node', 'create-edge', 'search', 'annotations'];
  const panel = (view: PanelView, open = true, mode = 'docked') => createElement(WorkspacePanel, {
    view, open, mode, onClose: () => closed++, bodies: {
      'create-node': createElement(Draft), 'create-edge': 'Edge draft',
      search: createElement('button', {}, 'Edit Node'), annotations: 'Annotation tools',
    },
  });
  let root: ReturnType<typeof create>;
  const section = (view: PanelView) => root!.root.findByProps({ 'data-panel-view': view });
  try {
    await act(async () => { root = create(panel('create-node'), {
      createNodeMock: node => node.props.className === 'react-flow-sidebar__content' ? scroller : {},
    }); });
    await act(async () => root.root.findByType('input').props.onChange({ target: { value: 'unfinished node' } }));
    for (const [index, view] of views.entries()) {
      await act(async () => root.update(panel(view)));
      assert.equal(root!.root.findByType('aside').props['aria-label'], ['Create Node', 'Create Edge', 'Search & Navigate', 'Annotations'][index]);
      for (const key of views) assert.equal(section(key).props.hidden, key !== view);
      root!.root.findByProps({ className: 'react-flow-sidebar__content' }).props.onScroll({ currentTarget: { scrollTop: (index + 1) * 100 } });
    }
    await act(async () => root.update(panel('create-node', false)));
    assert.equal(root!.root.findByType('aside').props.hidden, true);
    for (const [index, view] of views.entries()) {
      await act(async () => root.update(panel(view, true, 'overlay')));
      assert.equal(scroller.scrollTop, (index + 1) * 100);
    }
    await act(async () => root.update(panel('create-node', true, 'overlay')));
    assert.equal(root!.root.findByType('input').props.value, 'unfinished node');
    assert.equal(mounted, 1);
    assert.equal(unmounted, 0);
    let prevented = 0, stopped = 0;
    const event = { preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
    const backdrop = root!.root.findByProps({ className: 'workspace-panel__backdrop' });
    backdrop.props.onPointerDown(event); backdrop.props.onClick(event);
    assert.deepEqual([prevented, stopped, closed], [2, 2, 1]);
  } finally { await act(async () => root?.unmount()); }
});

test('panel toggling preserves annotation selection/tool and the accepted workspace snapshot', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = { window: globalThis.window, document: globalThis.document };
  const invoker = { isConnected: true, closest: () => null, focus() {} } as unknown as HTMLElement;
  Object.assign(globalThis, { document: { querySelector: () => null } });
  Object.assign(globalThis, { window: { innerWidth: 1300, localStorage: memory().storage, addEventListener() {}, removeEventListener() {} } });
  let panel: ReturnType<typeof useWorkspacePanel>, workspace: ReturnType<typeof useAnnotationWorkspace>;
  let current = [rectangle, text]; let entered = 0;
  const positions = [{ id: 'n-1', data: { originalId: 1 }, position: { x: 120, y: 90 } }];
  const baseline = workspaceSnapshot(positions, current);
  function Harness() {
    const [annotations, setAnnotations] = useState([rectangle, text]);
    const value = useAnnotationWorkspace({ annotations, setAnnotations, locked: false, toGraph: point => point,
      onBusy() {}, onEnterAnnotation() { entered++; } });
    const tools = useWorkspacePanel(value.mode === 'annotation');
    useLayoutEffect(() => { panel = tools; workspace = value; current = annotations; });
    return null;
  }
  const pointer = { pointerId: 1, button: 0, clientX: 0, clientY: 0,
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} },
    preventDefault() {}, stopPropagation() {},
  };
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement(Harness)); });
    await act(async () => workspace.switchMode('annotation'));
    await act(async () => workspace.begin(pointer, rectangle.id));
    await act(async () => workspace.end(pointer));
    assert.equal(workspace!.selected?.id, rectangle.id);
    for (let i = 0; i < 4; i++) await act(async () => panel.launch(invoker));
    assert.equal(workspace!.selected?.id, rectangle.id); assert.equal(workspace!.mode, 'annotation');
    await act(async () => workspace.setActiveTool('text'));
    await act(async () => panel.close()); await act(async () => panel.openAnnotations());
    assert.equal(workspace!.tool, 'text'); assert.equal(entered, 1);
    assert.equal(workspaceIsDirty(positions, current, baseline), false);
    assert.deepEqual(workspaceSnapshot(positions, current), baseline);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, previous); }
});
