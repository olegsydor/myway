import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { tsxModule } from './loadTsx.ts';

const { GraphDeleteDialog } = await import(tsxModule(new URL('../src/react-flow/GraphDeleteDialog.tsx', import.meta.url)));
const { AnnotationDeleteDialog } = await import(tsxModule(new URL('../src/react-flow/AnnotationControls.tsx', import.meta.url)));

for (const kind of ['node', 'edge', 'annotation'] as const) {
  test(`${kind} deletion confirmation moves focus safely with horizontal arrows`, async () => {
    const previousActEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    const calls: string[] = [];
    const cancel = () => calls.push('cancel');
    const confirm = () => calls.push('delete');
    const renderDialog = (locked = false, deleted = false) => kind === 'annotation'
      ? createElement(AnnotationDeleteDialog, { locked, workspace: {
        deleteTarget: { kind: 'text', text: 'Example' }, cancelDelete: cancel, confirmDelete: confirm,
      } })
      : createElement(GraphDeleteDialog, { state: {
        target: { kind, description: 'Remove this element?' }, busy: locked, deleted,
      }, onCancel: cancel, onConfirm: confirm, onRetry: () => calls.push('retry') });
    const dialog = { open: false, showModal() { this.open = true; } };
    let focused: unknown;
    let root: ReturnType<typeof create> | undefined;

    try {
      await act(async () => {
        root = create(renderDialog(), {
          createNodeMock: element => element.type === 'dialog' ? dialog : {
            focus() { focused = element.props.children; },
          },
        });
      });
      assert.equal(dialog.open, true);
      assert.equal(focused, 'Cancel');
      const actions = () => root!.root.findByProps({ className: 'layout-dialog-actions' });
      const press = (key: string, modifiers: Record<string, boolean> = {}) => {
        const handled: string[] = [];
        actions().props.onKeyDown({
          key, ...modifiers,
          preventDefault: () => handled.push('prevented'),
          stopPropagation: () => handled.push('stopped'),
        });
        return handled;
      };

      assert.deepEqual(press('ArrowRight'), ['prevented', 'stopped']);
      assert.equal(focused, 'Delete');
      assert.deepEqual(press('ArrowLeft'), ['prevented', 'stopped']);
      assert.equal(focused, 'Cancel');
      for (const key of ['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown']) {
        assert.deepEqual(press(key), []);
      }
      assert.deepEqual(press('Tab', { shiftKey: true }), []);
      for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
        assert.deepEqual(press('ArrowRight', { [modifier]: true }), []);
      }
      assert.equal(focused, 'Cancel');
      assert.deepEqual(calls, []);

      await act(async () => root!.update(renderDialog(true)));
      assert.deepEqual(press('ArrowRight'), []);
      assert.equal(focused, 'Cancel');
      assert.ok(actions().findAllByType('button').every(button => button.props.disabled));

      const escape = () => root!.root.findByType('dialog').props.onCancel({ preventDefault() {} });
      escape();
      assert.deepEqual(calls, []);
      await act(async () => root!.update(renderDialog()));
      escape();
      assert.deepEqual(calls, ['cancel']);

      if (kind !== 'annotation') {
        await act(async () => root!.update(renderDialog(false, true)));
        assert.deepEqual(press('ArrowRight'), []);
        assert.deepEqual(press('ArrowLeft'), []);
        assert.deepEqual(calls, ['cancel']);
      }
    } finally {
      await act(async () => root?.unmount());
      Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    }
  });
}
