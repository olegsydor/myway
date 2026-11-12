import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement, useEffect, useLayoutEffect, useState } from 'react';
import { create } from 'react-test-renderer';
import { initialToolsPanel, rememberToolsPanel, toolsPanelPresentation, TOOLS_PANEL_PREFERENCE } from '../src/shell/toolsPanelState.ts';
import { useToolsPanel } from '../src/shell/useToolsPanel.ts';
import { useCreateFormFocus } from '../src/shell/useCreateFormFocus.ts';
import { applicationMenus } from '../src/shell/applicationMenus.ts';
import { dispatchShortcut } from '../src/react-flow/graphShortcuts.ts';
import { workspaceCommands } from '../src/react-flow/workspaceCommands.ts';
import { useAnnotationWorkspace } from '../src/react-flow/useAnnotationWorkspace.ts';
import { workspaceSnapshot, workspaceIsDirty } from '../src/shared/persistentLayouts.ts';
import { rectangle, text } from './annotationFixtures.ts';
import { tsxModule } from './loadTsx.ts';
const { ToolsPanel } = await import(tsxModule(new URL('../src/shell/ToolsPanel.tsx', import.meta.url)));

function memory(value: string | null = null) {
  const values = new Map<string, string>();
  if (value !== null) values.set(TOOLS_PANEL_PREFERENCE, value);
  const writes: unknown[] = [];
  return { values, writes, storage: { getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) { writes.push([key, value]); values.set(key, value); } } };
}
test('first-visit preference boundary is 1200 px; presentation changes separately at 1100 px', () => {
  assert.equal(initialToolsPanel(1199, null), false);
  assert.equal(initialToolsPanel(1200, null), true);
  assert.equal(toolsPanelPresentation(1099), 'overlay');
  assert.equal(toolsPanelPresentation(1100), 'docked');
  assert.equal(initialToolsPanel(1150, null), false);
  assert.equal(toolsPanelPresentation(1150), 'docked');
});
test('valid stored preference wins at any viewport; corrupt/missing values use first-visit policy', () => {
  for (const width of [800, 1199, 1500]) {
    assert.equal(initialToolsPanel(width, memory('open').storage), true);
    assert.equal(initialToolsPanel(width, memory('closed').storage), false);
    assert.equal(initialToolsPanel(width, memory('broken').storage), width >= 1200);
  }
});
test('preference storage failures are harmless and writes use only the versioned UI key', () => {
  const throwing = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } };
  assert.equal(initialToolsPanel(1300, throwing), true);
  assert.equal(initialToolsPanel(900, throwing), false);
  assert.doesNotThrow(() => rememberToolsPanel(true, throwing));
  const store = memory(); rememberToolsPanel(true, store.storage); rememberToolsPanel(false, store.storage);
  assert.deepEqual(store.writes, [[TOOLS_PANEL_PREFERENCE, 'open'], [TOOLS_PANEL_PREFERENCE, 'closed']]);
});
test('resize changes docking only; explicit preference survives remount and localStorage getter failure', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.window;
  const store = memory();
  const listeners = new Set<() => void>();
  const browser = { innerWidth: 1300, localStorage: store.storage,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  Object.assign(globalThis, { window: browser });
  let panel: ReturnType<typeof useToolsPanel>;
  function Harness() { const value = useToolsPanel(); useLayoutEffect(() => { panel = value; }); return null; }
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement(Harness)); });
    assert.equal(panel!.open, true); assert.deepEqual(store.writes, []);
    await act(async () => { browser.innerWidth = 800; listeners.forEach(fn => fn()); });
    assert.equal(panel!.open, true); assert.equal(panel!.mode, 'overlay');
    await act(async () => panel.hide()); assert.equal(panel!.open, false);
    await act(async () => { browser.innerWidth = 1500; listeners.forEach(fn => fn()); });
    assert.equal(panel!.open, false); assert.equal(panel!.mode, 'docked');
    await act(async () => root.unmount());
    await act(async () => { root = create(createElement(Harness)); });
    assert.equal(panel!.open, false);
    await act(async () => root.unmount());
    Object.defineProperty(browser, 'localStorage', { get() { throw Error('unavailable'); } });
    await act(async () => { root = create(createElement(Harness)); });
    assert.equal(panel!.open, true);
    await act(async () => panel.toggle()); assert.equal(panel!.open, false);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, { window: previous }); }
  assert.equal(listeners.size, 0);
});
test('closing/reopening retains mounted form/filter state and scroll; overlay backdrop consumes dismissal', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.document;
  let toggleFocus = 0, mounted = 0, unmounted = 0, closed = 0;
  Object.assign(globalThis, { document: { querySelector: () => ({ focus: () => toggleFocus++ }), activeElement: null } });
  const scroller = { scrollTop: 0 };
  function Controls() {
    const [value, setValue] = useState('draft'), [filter, setFilter] = useState('project');
    useEffect(() => { mounted++; return () => { unmounted++; }; }, []);
    return createElement('div', {}, createElement('input', { value, onChange: (e: any) => setValue(e.target.value) }),
      createElement('select', { value: filter, onChange: (e: any) => setFilter(e.target.value) }));
  }
  const props = (open: boolean, mode = 'docked') => ({ open, mode, onClose: () => closed++ });
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement(ToolsPanel, props(true), createElement(Controls)), {
      createNodeMock: node => node.props.className === 'react-flow-sidebar__content' ? scroller : {},
    }); });
    await act(async () => root.root.findByType('input').props.onChange({ target: { value: 'unfinished node' } }));
    await act(async () => root.root.findByType('select').props.onChange({ target: { value: 'story' } }));
    root!.root.findByProps({ className: 'react-flow-sidebar__content' }).props.onScroll({ currentTarget: { scrollTop: 480 } });
    await act(async () => root.update(createElement(ToolsPanel, props(false), createElement(Controls))));
    assert.equal(root!.root.findByType('aside').props.hidden, true); assert.equal(unmounted, 0);
    scroller.scrollTop = 0;
    await act(async () => root.update(createElement(ToolsPanel, props(true, 'overlay'), createElement(Controls))));
    assert.equal(scroller.scrollTop, 480); assert.equal(root!.root.findByType('input').props.value, 'unfinished node');
    assert.equal(root!.root.findByType('select').props.value, 'story'); assert.equal(mounted, 1);
    let prevented = 0, stopped = 0;
    const event = { preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
    const backdrop = root!.root.findByProps({ className: 'tools-panel__backdrop' });
    backdrop.props.onPointerDown(event); backdrop.props.onClick(event);
    assert.equal(prevented, 2); assert.equal(stopped, 2); assert.equal(closed, 1); assert.equal(toggleFocus, 1);
    await act(async () => root.update(createElement(ToolsPanel, props(true), createElement(Controls))));
    assert.equal(root!.root.findAllByProps({ className: 'tools-panel__backdrop' }).length, 0);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, { document: previous }); }
});
test('Create command opens a closed panel, then focuses the rendered form; View shares the toggle', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = { window: globalThis.window, document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const callbacks = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const store = memory('closed'), calls: string[] = [];
  Object.assign(globalThis, { window: { innerWidth: 1000, localStorage: store.storage, addEventListener() {}, removeEventListener() {} },
    document: { querySelector: () => null },
    requestAnimationFrame: (fn: FrameRequestCallback) => { callbacks.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: (id: number) => callbacks.delete(id),
  });
  let panel: ReturnType<typeof useToolsPanel>, commands: ReturnType<typeof workspaceCommands>;
  function Harness() {
    const tools = useToolsPanel(), forms = useCreateFormFocus(tools.open, tools.show);
    const shared = workspaceCommands({ annotationMode: false, blocked: false, locked: false, dirty: false }, {
      save() {}, focusForm: forms.focus, arrange: () => calls.push('arrange'), fit: () => calls.push('fit'), reset: () => calls.push('reset'),
    });
    useLayoutEffect(() => { panel = tools; commands = shared; });
    return createElement('aside', { hidden: !tools.open }, createElement('div', { ref: forms.createNode, 'data-form': 'createNode' }),
      createElement('div', { ref: forms.createEdge, 'data-form': 'createEdge' }));
  }
  let root: ReturnType<typeof create>;
  const flushFrames = async () => { await act(async () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(0)); }); };
  try {
    await act(async () => { root = create(createElement(Harness), { createNodeMock: node => ({
      scrollIntoView() { calls.push('scroll:' + node.props['data-form']); },
      querySelector: () => ({ focus: () => calls.push('focus:' + node.props['data-form']) }),
    }) }); });
    assert.equal(panel!.open, false);
    await act(async () => applicationMenus([], commands!, () => {}, undefined, panel!)[1]!.items[0]!.run!());
    assert.equal(panel!.open, true); assert.deepEqual(calls, []);
    await flushFrames(); assert.deepEqual(calls, ['scroll:createNode', 'focus:createNode']);
    const menu = applicationMenus([], commands!, () => {}, undefined, panel!);
    const toggle = menu[3]!.items.find(item => item.id === 'tools')!;
    assert.equal(toggle.label, 'Hide tools panel'); assert.equal(toggle.run, panel!.toggle);
    await act(async () => toggle.run!()); assert.equal(panel!.open, false);
    await act(async () => dispatchShortcut({ key: 'e', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      defaultPrevented: false, preventDefault() {} } as KeyboardEvent, {
        canvas: true, editable: false, modal: false, busy: false, form: false,
        notice: () => assert.fail('unexpected notice'), run: () => commands.createEdge.run(),
      })); assert.equal(panel!.open, true);
    await flushFrames(); assert.deepEqual(calls.slice(2), ['scroll:createEdge', 'focus:createEdge']);
    await act(async () => panel.hide());
    await act(async () => dispatchShortcut({ key: 'n', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      defaultPrevented: false, preventDefault() {} } as KeyboardEvent, {
        canvas: true, editable: false, modal: false, busy: false, form: false,
        notice: () => assert.fail('unexpected notice'), run: () => commands.createNode.run(),
      }));
    assert.equal(panel!.open, true); await flushFrames();
    assert.deepEqual(calls.slice(4), ['scroll:createNode', 'focus:createNode']);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, previous); }
});

test('panel toggling preserves annotation selection/tool and the accepted workspace snapshot', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = globalThis.window;
  Object.assign(globalThis, { window: { innerWidth: 1300, localStorage: memory().storage, addEventListener() {}, removeEventListener() {} } });
  let panel: ReturnType<typeof useToolsPanel>, workspace: ReturnType<typeof useAnnotationWorkspace>;
  let current = [rectangle, text]; let entered = 0;
  const positions = [{ id: 'n-1', data: { originalId: 1 }, position: { x: 120, y: 90 } }];
  const baseline = workspaceSnapshot(positions, current);
  function Harness() {
    const tools = useToolsPanel(), [annotations, setAnnotations] = useState([rectangle, text]);
    const value = useAnnotationWorkspace({ annotations, setAnnotations, locked: false, toGraph: point => point,
      onBusy() {}, onEnterAnnotation() { entered++; } });
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
    for (let i = 0; i < 4; i++) await act(async () => panel.toggle());
    assert.equal(workspace!.selected?.id, rectangle.id); assert.equal(workspace!.mode, 'annotation');
    await act(async () => workspace.setActiveTool('text'));
    await act(async () => panel.hide()); await act(async () => panel.show());
    assert.equal(workspace!.tool, 'text'); assert.equal(entered, 1);
    assert.equal(workspaceIsDirty(positions, current, baseline), false);
    assert.deepEqual(workspaceSnapshot(positions, current), baseline);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, { window: previous }); }
});
