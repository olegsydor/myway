import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { createMenuModel, registerMenuAlt, type MenuDefinition } from '../src/shell/menuModel.ts';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Node's TS runner cannot parse JSX; compile the actual component for renderer tests.
const componentUrl = new URL('../src/shell/ApplicationMenu.tsx', import.meta.url);
const compiled = ts.transpileModule(readFileSync(componentUrl, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
  .replaceAll("'./menuModel.ts'", JSON.stringify(new URL('../src/shell/menuModel.ts', import.meta.url).href));
const { ApplicationMenu } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));


function setup() {
  const focus: string[] = [];
  const calls: string[] = [];
  const menus: MenuDefinition[] = [{ id: 'a', label: 'A', items: [
    { id: 'disabled', label: 'Disabled', disabled: true, run: () => calls.push('bad') },
    { id: 'one', label: 'One', run: () => { assert.equal(model.state.open, false); calls.push('one'); } },
    { id: 'sub', label: 'Sub', children: [{ id: 'child', label: 'Child', run: () => calls.push('child') }] },
    { id: 'last', label: 'Last' },
  ] }, { id: 'b', label: 'B', items: [{ id: 'two', label: 'Two' }] }];
  const model = createMenuModel(() => menus, () => {}, (menu, path) => focus.push([menu, ...path].join('-')));
  return { model, focus, calls, menus };
}
test('toggle, hover and keyboard switching keep exactly one menu open', () => {
  const { model } = setup();
  model.toggle(0); assert.equal(model.state.open, true);
  model.hover(1); assert.equal(model.state.menu, 1);
  model.toggle(1); assert.equal(model.state.open, false);
  model.key('ArrowRight'); assert.equal(model.state.menu, 0);
  model.key('Enter'); model.key('ArrowLeft'); assert.equal(model.state.menu, 1);
});
test('item movement wraps, skips disabled items, and supports Home/End', () => {
  const { model, focus } = setup();
  model.key('ArrowDown'); assert.deepEqual(model.state.path, [1]);
  model.key('ArrowUp'); assert.deepEqual(model.state.path, [3]);
  model.key('Home'); assert.deepEqual(model.state.path, [1]);
  model.key('End'); assert.deepEqual(model.state.path, [3]);
  model.key('ArrowDown'); assert.equal(focus.at(-1), '0-1');
});
test('submenu Right/Left and Escape restore focus one level at a time', () => {
  const { model, focus } = setup();
  model.open(0); model.key('ArrowDown'); model.key('ArrowRight');
  assert.deepEqual(model.state.path, [2, 0]);
  model.key('ArrowLeft'); assert.equal(focus.at(-1), '0-2');
  model.key('ArrowRight'); model.key('Escape'); assert.equal(focus.at(-1), '0-2');
  model.key('Escape'); assert.equal(focus.at(-1), '0'); assert.equal(model.state.open, false);
});
test('disabled commands cannot execute; enabled commands close before invoking', () => {
  const { model, calls } = setup(); model.open(0);
  model.activate([0]); assert.deepEqual(calls, []); assert.equal(model.state.open, true);
  model.key(' '); assert.deepEqual(calls, ['one']);
});
test('Tab closes without capturing normal focus movement', () => {
  const { model, focus } = setup(); model.open(0); const count = focus.length;
  assert.equal(model.key('Tab'), false); assert.equal(model.state.open, false); assert.equal(focus.length, count);
});
test('Alt alone: non-Mac only, respects safety gate, combinations, composition and cleanup', () => {
  const listeners = new Map<string, (event: any) => void>();
  const target = { addEventListener: (key: string, fn: any) => listeners.set(key, fn),
    removeEventListener: (key: string) => listeners.delete(key) } as unknown as Window;
  let allowed = true, count = 0;
  const uninstall = registerMenuAlt(target, false, () => allowed, () => count++);
  const key = (type: string, value: string, extra = {}) => listeners.get(type)?.({ key: value, preventDefault() {}, ...extra });
  key('keydown', 'Alt'); key('keyup', 'Alt'); assert.equal(count, 1);
  key('keydown', 'Alt'); key('keydown', 'n'); key('keyup', 'Alt'); assert.equal(count, 1);
  key('keydown', 'Alt', { isComposing: true }); key('keyup', 'Alt'); assert.equal(count, 1);
  listeners.get('pointerdown')!({}); key('keydown', 'Alt'); key('keyup', 'Alt'); assert.equal(count, 1);
  listeners.get('pointerup')!({});
  key('keydown', 'Alt'); allowed = false; key('keyup', 'Alt'); assert.equal(count, 1);
  uninstall(); assert.equal(listeners.size, 0);
  registerMenuAlt(target, true, () => true, () => count++); assert.equal(listeners.size, 0);
});
test('rendered primitive focuses items, restores trigger, guards outside pointer and modal priority', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const oldWindow = globalThis.window, oldNode = globalThis.Node, oldElement = globalThis.Element;
  const listeners = new Map<string, (event: any) => void>();
  class FakeNode {}
  Object.assign(globalThis, { Node: FakeNode, Element: class {}, window: {
    addEventListener: (key: string, fn: any) => listeners.set(key, fn),
    removeEventListener: (key: string) => listeners.delete(key),
  } });
  const focus: string[] = [];
  const { menus } = setup();
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement(ApplicationMenu, { menus }), { createNodeMock: element =>
      element.props.role === 'menubar' ? { contains: () => false, querySelector: (selector: string) => ({ focus: () => focus.push(selector) }) } : {} }); });
    const trigger = () => root.root.findAllByType('button')[0]!;
    await act(async () => trigger().props.onClick());
    assert.equal(root!.root.findAllByProps({ role: 'menu' }).length, 1);
    assert.match(focus.at(-1)!, /0-1/);
    let stopped = false, prevented = false;
    await act(async () => root.root.findByProps({ role: 'menubar' }).props.onKeyDown({ key: 'Escape',
      stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } }));
    assert.equal(stopped && prevented, true); assert.match(focus.at(-1)!, /"0"/);
    await act(async () => trigger().props.onClick());
    await act(async () => listeners.get('pointerdown')!({ target: new FakeNode(),
      preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }));
    assert.equal(root!.root.findAllByProps({ role: 'menu' }).length, 0);
    stopped = false; prevented = false;
    listeners.get('click')!({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.equal(stopped && prevented, true);
    await act(async () => trigger().props.onClick());
    await act(async () => root.update(createElement(ApplicationMenu, { menus, blocked: true })));
    assert.equal(root!.root.findAllByProps({ role: 'menu' }).length, 0);
    assert.equal(trigger().props['aria-disabled'], true);
    // A blocked trigger must not blur/commit the annotation editor beneath it.
    prevented = false;
    trigger().props.onPointerDown({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    await act(async () => trigger().props.onClick());
    assert.equal(root!.root.findAllByProps({ role: 'menu' }).length, 0);
  } finally {
    await act(async () => root?.unmount());
    Object.assign(globalThis, { window: oldWindow, Node: oldNode, Element: oldElement });
  }
});
