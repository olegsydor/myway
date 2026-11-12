import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspaceCommands } from '../src/react-flow/workspaceCommands.ts';

function setup(state = {}) {
  const calls: string[] = [];
  const commands = workspaceCommands({ annotationMode: false, blocked: false, locked: false, dirty: true, ...state }, {
    save: () => calls.push('save'), focusForm: name => calls.push(name),
    arrange: name => calls.push(name), fit: () => calls.push('fit'), reset: () => calls.push('reset'),
  });
  return { calls, commands };
}
test('shared command callbacks delegate exactly once to existing owners', () => {
  const { calls, commands } = setup();
  Object.values(commands).forEach(command => command.run());
  assert.deepEqual(calls, ['save', 'createNode', 'createEdge', 'grid', 'circle', 'dagre', 'fit', 'reset']);
});
for (const state of [{ blocked: true }, { locked: true }, { annotationMode: true }]) {
  test(`command availability and execution guards: ${JSON.stringify(state)}`, () => {
    const { calls, commands } = setup(state);
    for (const name of ['createNode', 'createEdge', 'grid', 'circle', 'dagre'] as const) {
      assert.equal(commands[name].enabled, false); commands[name].run();
    }
    assert.deepEqual(calls, []);
    commands.fit.run(); assert.deepEqual(calls, ['fit']);
    assert.equal(commands.save.enabled, Boolean(state.annotationMode));
    assert.equal(commands.reset.enabled, !state.annotationMode);
  });
}
test('clean workspace cannot save; Fit never invokes persistence or arrangement', () => {
  const { commands, calls } = setup({ dirty: false });
  assert.equal(commands.save.enabled, false); commands.save.run(); commands.fit.run();
  assert.deepEqual(calls, ['fit']);
});
