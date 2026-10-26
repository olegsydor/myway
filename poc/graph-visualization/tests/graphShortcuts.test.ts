import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchShortcut, resolveShortcut, GRAPH_SHORTCUTS, registerGraphKeyboard } from '../src/react-flow/graphShortcuts.ts';
const key = (key: string, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra });
function dispatch(k: string, context = {}, extra = {}) {
  let prevented = false;
  const actions: string[] = [];
  const event = { ...key(k, extra), preventDefault() { prevented = true; }, repeat: false, isComposing: false, ...extra } as unknown as KeyboardEvent;
  dispatchShortcut(event, { canvas: true, editable: false, modal: false, busy: false, form: false,
    run: action => actions.push(action), notice: () => actions.push('notice'), ...context });
  return { prevented, actions };
}
test('central bindings resolve both save modifiers and reserve unsupported combinations', () => {
  assert.equal(resolveShortcut(key('s', {metaKey:true})), 'saveLayout');
  assert.equal(resolveShortcut(key('s', {ctrlKey:true})), 'saveLayout');
  for (const modifier of ['shiftKey','altKey','ctrlKey','metaKey']) {
    assert.equal(resolveShortcut(key('N', {[modifier]:true})), null);
  }
  assert.equal(resolveShortcut(key('N')), 'createNode');
  assert.equal(resolveShortcut(key('x'), {...GRAPH_SHORTCUTS, createNode:'x'}), 'createNode');
  for (const k of ['Delete', 'Backspace']) assert.equal(resolveShortcut(key(k)), 'deleteElement');
});
test('save always prevents browser default; forms show notice and busy/repeated events do not dispatch', () => {
  assert.deepEqual(dispatch('s', {}, {metaKey:true}), {prevented:true, actions:['saveLayout']});
  for (const context of [{form:true}, {modal:true}]) assert.deepEqual(dispatch('s',context,{ctrlKey:true}).actions,['notice']);
  assert.deepEqual(dispatch('s',{busy:true},{ctrlKey:true}).actions,[]);
  assert.deepEqual(dispatch('s',{}, {ctrlKey:true,repeat:true}),{prevented:true,actions:[]});
});
test('canvas actions obey context, editable, modal, busy, form, repeat and composition guards', () => {
  for (const k of ['n','e','Delete','Backspace']) {
    assert.equal(dispatch(k).actions.length,1);
    for (const context of [{canvas:false},{editable:true},{modal:true},{busy:true},{form:true}]) {
      assert.deepEqual(dispatch(k,context),{prevented:false,actions:[]});
    }
    for (const extra of [{repeat:true},{isComposing:true}]) assert.equal(dispatch(k,{},extra).actions.length,0);
  }
});
test('F2 remains unbound and preserves default behavior', () => {
  assert.equal(resolveShortcut(key('F2')), null);
  assert.deepEqual(dispatch('F2'), {prevented:false, actions:[]});
});

test('one registration is removed with the same callback and capture mode', () => {
  const calls: unknown[][] = [];
  const target = {
    addEventListener: (...args: unknown[]) => calls.push(['add', ...args]),
    removeEventListener: (...args: unknown[]) => calls.push(['remove', ...args]),
  };
  const listener = () => {};
  const cleanup = registerGraphKeyboard(target as unknown as Window, listener);
  assert.deepEqual(calls, [['add','keydown',listener,true]]);
  cleanup();
  assert.deepEqual(calls[1], ['remove','keydown',listener,true]);
});
