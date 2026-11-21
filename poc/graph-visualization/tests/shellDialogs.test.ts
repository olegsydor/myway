import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement, useLayoutEffect } from 'react';
import { create } from 'react-test-renderer';
import { tsxModule } from './loadTsx.ts';
import type { MenuItem } from '../src/shell/menuModel.ts';
const { LayoutControls } = await import(tsxModule(new URL('../src/react-flow/LayoutControls.tsx', import.meta.url)));
const { HelpDialog } = await import(tsxModule(new URL('../src/shell/HelpDialog.tsx', import.meta.url)));
const { AnnotationControls, WorkspaceModeSwitch } = await import(tsxModule(new URL('../src/react-flow/AnnotationControls.tsx', import.meta.url)));

test('migrated Layout menu reaches existing dirty-switch, name validation and delete dialogs', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const originalDocument = globalThis.document;
  let restored = 0;
  Object.assign(globalThis, { document: { querySelector: () => ({ focus: () => restored++ }) } });
  const calls: unknown[] = [];
  let items: MenuItem[] = [];
  const active = { id: 1, name: 'Working', is_default: false };
  let succeed = false;
  const layout = { active, layouts: [active, { id: 2, name: 'Default', is_default: true }],
    phase: 'ready', dirty: true, blocked: false, locked: false, isLocked: () => false, error: '',
    canDelete: true, canDiscard: true, clearError() {},
    switchTo: async (...args: unknown[]) => { calls.push(args); return true; },
    saveAsNew: async (name: string) => { calls.push(['new', name]); return succeed; },
    rename: async (name: string) => { calls.push(['rename', name]); return true; },
    deleteActive: async () => { calls.push('delete'); return true; },
  };
  function Capture({ surface }: { surface: { items: MenuItem[] } }) {
    useLayoutEffect(() => { items = surface.items; }); return null;
  }
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  let root: ReturnType<typeof create>;
  const invoke = async (id: string) => { await act(async () => items.find(item => item.id === id)!.run!()); };
  const button = (label: string) => root.root.findAllByType('button').find(item => item.children.includes(label))!;
  try {
    await act(async () => { root = create(createElement(LayoutControls, { layout, saveCommand: { enabled: true, run() {} } },
      (surface: any) => createElement(Capture, { surface })), {
      createNodeMock: element => element.type === 'dialog' ? dialog : { focus() {}, select() {} },
    }); });
    await act(async () => items.find(item => item.id === 'switch')!.children![1]!.run!());
    assert.equal(dialog.open, true); assert.deepEqual(calls, []);
    await act(async () => button('Cancel').props.onClick()); assert.equal(dialog.open, false); assert.equal(restored, 1);
    await act(async () => items.find(item => item.id === 'switch')!.children![1]!.run!());
    await act(async () => button('Save and switch').props.onClick()); assert.deepEqual(calls, [[2, 'save']]);
    await invoke('new');
    await act(async () => root.root.findByType('input').props.onChange({ target: { value: '   ' } }));
    await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(root!.root.findAllByProps({ role: 'alert' }).length, 1);
    await act(async () => root.root.findByType('input').props.onChange({ target: { value: ' Copy ' } }));
    await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(dialog.open, true); // Failed save does not dismiss the dialog.
    succeed = true;
    await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(dialog.open, false); assert.deepEqual(calls.at(-1), ['new', 'Copy']);
    await invoke('rename'); assert.equal(root!.root.findByType('input').props.value, 'Working');
    await act(async () => root.root.findByType('input').props.onChange({ target: { value: ' Renamed ' } }));
    await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.deepEqual(calls.at(-1), ['rename', 'Renamed']);
    await invoke('delete');
    await act(async () => button('Delete and discard changes').props.onClick());
    assert.equal(calls.at(-1), 'delete'); assert.equal(dialog.open, false);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, { document: originalDocument }); }
});

test('Help modal traps Tab, handles Escape and restores the invoking menu button', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const original = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  let invokerFocus = 0, closeFocus = 0, dismissed = 0;
  class Invoker { isConnected = true; focus() { invokerFocus++; } }
  Object.assign(globalThis, { HTMLElement: Invoker, document: { activeElement: new Invoker() } });
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement(HelpDialog, { open: true, onClose: () => dismissed++ }), {
      createNodeMock: element => element.type === 'dialog' ? dialog : { focus() { closeFocus++; } },
    }); });
    assert.equal(dialog.open, true); assert.equal(closeFocus, 1);
    let prevented = 0;
    const event = { key: 'Tab', preventDefault() { prevented++; }, stopPropagation() {} };
    await act(async () => root.root.findByType('dialog').props.onKeyDown(event));
    assert.equal(closeFocus, 2); assert.equal(prevented, 1);
    await act(async () => root.root.findByType('dialog').props.onCancel(event)); assert.equal(dismissed, 1);
    await act(async () => root.update(createElement(HelpDialog, { open: false, onClose() {} })));
    assert.equal(dialog.open, false); assert.equal(invokerFocus, 1);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, original); }
});

test('extracted mode switch delegates to Stage 15; annotation tools/properties retain their callbacks', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: unknown[] = [];
  const workspace = { mode: 'annotation', tool: 'select', selected: { kind: 'text', id: 't', text: 'Text', color: 'blue', size: 'medium' },
    editor: null, gestureActive: false, deleteTarget: null, error: '',
    switchMode: (mode: string) => calls.push(mode), setActiveTool: (tool: string) => calls.push(tool),
    setTextStyle: (style: unknown) => calls.push(style), editText: (id: string) => calls.push(id), requestDelete: () => calls.push('delete'),
  };
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement('div', {},
      createElement(WorkspaceModeSwitch, { workspace, locked: false }), createElement(AnnotationControls, { annotations: [workspace.selected], workspace, locked: false }))); });
    const buttons = root!.root.findAllByType('button');
    await act(async () => buttons.find(button => button.children.includes('Graph'))!.props.onClick());
    await act(async () => buttons.find(button => button.children.includes('Rectangle'))!.props.onClick());
    await act(async () => root.root.findByProps({ 'aria-label': 'Text size' }).props.onChange({ target: { value: 'large' } }));
    await act(async () => buttons.find(button => button.children.includes('Edit text'))!.props.onClick());
    await act(async () => buttons.find(button => button.children.includes('Delete text'))!.props.onClick());
    assert.deepEqual(calls, ['graph', 'rectangle', { size: 'large' }, 't', 'delete']);
    assert.equal(root!.root.findAllByProps({ 'aria-label': 'Workspace mode' }).length, 1);
  } finally { await act(async () => root?.unmount()); }
});
