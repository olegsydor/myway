import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { tsxModule } from './loadTsx.ts';
const { NodeSearchSelect } = await import(tsxModule(new URL('../src/react-flow/NodeSearchSelect.tsx', import.meta.url)));
const { GraphSearchPanel } = await import(tsxModule(new URL('../src/react-flow/GraphSearchPanel.tsx', import.meta.url)));
const nodes = ['Alpha', 'Beta'].map((label, index) => ({ id: index + 1, label, type: 'person', description: null, attributes: {} }));
const graph = { user_id: 1, nodes, edges: [], meta: { nodes_count: 2, edges_count: 0 } };
function key(value: string, composing = false) {
  return { key: value, nativeEvent: { isComposing: composing }, prevented: false,
    preventDefault() { this.prevented = true; }, stopPropagation() {} };
}
function focusMock(record: (value: string) => void) {
  return (element: { type: string; props: any }) => ({ focus() {
    const children = element.props.children;
    record(element.type === 'input' ? 'input' : typeof children === 'string' ? children : children?.[0]?.props?.children);
  } });
}

test('node suggestions support arrow navigation, Escape/reopen and native Enter/Tab without selecting on arrows', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let focus = ''; const changes: string[] = []; let root: ReturnType<typeof create>;
  await act(async () => { root = create(createElement(NodeSearchSelect, { nodes, value: '', placeholder: 'Source Node', onChange: (v: string) => changes.push(v) }), { createNodeMock: focusMock(v => { focus = v; }) }); });
  try {
    const input = () => root.root.findByType('input');
    const buttons = () => root.root.findAllByType('button');
    await act(async () => input().props.onChange({ target: { value: 'a' } }));
    const count = changes.length;
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Alpha');
    await act(async () => buttons()[0].props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Beta');
    await act(async () => buttons()[1].props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Beta');
    await act(async () => buttons()[1].props.onKeyDown(key('ArrowUp'))); assert.equal(focus, 'Alpha');
    await act(async () => buttons()[0].props.onKeyDown(key('ArrowUp'))); assert.equal(focus, 'input');
    assert.equal(changes.length, count);
    await act(async () => buttons()[0].props.onKeyDown(key('Escape')));
    assert.equal(buttons().length, 0); assert.equal(focus, 'input'); assert.equal(input().props.value, 'a');
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Alpha');
    for (const name of ['Enter', 'Tab']) { const e = key(name); buttons()[0].props.onKeyDown(e); assert.equal(e.prevented, false); }
    await act(async () => buttons()[0].props.onClick()); assert.equal(changes.at(-1), '1'); assert.equal(focus, 'input');
  } finally { await act(async () => root.unmount()); }
});

test('graph search preserves explicit submission and enables arrow navigation and Escape without invoking selection', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let focus = ''; const chosen: unknown[] = []; let root: ReturnType<typeof create>;
  await act(async () => { root = create(createElement(GraphSearchPanel, { graph, onSelect: (v: unknown) => chosen.push(v) }), { createNodeMock: focusMock(v => { focus = v; }) }); });
  try {
    const input = () => root.root.findByType('input');
    const results = () => root.root.findAllByProps({ className: 'graph-search__result' });
    await act(async () => input().props.onChange({ target: { value: 'a' } }));
    assert.equal(results().length, 0);
    await act(async () => input().props.onKeyDown(key('Enter', true))); assert.equal(results().length, 0);
    await act(async () => input().props.onKeyDown(key('Enter'))); assert.equal(results().length, 2);
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Alpha');
    await act(async () => results()[0].props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Beta');
    assert.deepEqual(chosen, []);
    await act(async () => results()[1].props.onKeyDown(key('Escape'))); assert.equal(focus, 'input'); assert.equal(results().length, 0);
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, 'Alpha');
    await act(async () => results()[0].props.onClick()); assert.equal((chosen[0] as any).title, 'Alpha');
  } finally { await act(async () => root.unmount()); }
});

test('empty, nonmatching and disabled suggestions do not steal focus; composing keys are ignored', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let focus = ''; let root: ReturnType<typeof create>;
  const props = { nodes, value: '', placeholder: 'Source Node', onChange() {} };
  await act(async () => { root = create(createElement(NodeSearchSelect, props), { createNodeMock: focusMock(v => { focus = v; }) }); });
  try {
    const input = () => root.root.findByType('input');
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, '');
    await act(async () => input().props.onChange({ target: { value: 'zzz' } }));
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, '');
    await act(async () => input().props.onChange({ target: { value: 'a' } })); assert.equal(focus, '');
    await act(async () => input().props.onKeyDown(key('ArrowDown', true))); assert.equal(focus, '');
    await act(async () => root.update(createElement(NodeSearchSelect, { ...props, disabled: true })));
    await act(async () => input().props.onKeyDown(key('ArrowDown'))); assert.equal(focus, '');
  } finally { await act(async () => root.unmount()); }
});
