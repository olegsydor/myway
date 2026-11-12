import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement, useLayoutEffect } from 'react';
import { create } from 'react-test-renderer';
import { useGraphShortcuts } from '../src/react-flow/useGraphShortcuts.ts';
import { useWorkspaceCommands } from '../src/react-flow/workspaceCommands.ts';

test('shared Save/Create commands retain identity and current callbacks; capture skips menu input', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const original = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element };
  const listeners = new Map<string, (event: any) => void>();
  let menuOpen = false, modal = false, form = false, dirty = true;
  const calls: string[] = [];
  class Target {
    menu = false;
    closest(selector: string) {
      if (selector.includes('menubar')) return this.menu;
      if (selector === '.react-flow-container') return true;
      return false;
    }
  }
  Object.assign(globalThis, { Element: Target,
    document: { querySelector: (selector: string) => selector.includes('menubar') ? menuOpen : modal },
    window: { addEventListener: (key: string, listener: any) => listeners.set(key, listener),
      removeEventListener: (key: string) => listeners.delete(key) },
  });
  let commands: ReturnType<typeof useWorkspaceCommands>;
  function Harness({ label }: { label: string }) {
    const currentCommands = useWorkspaceCommands({ annotationMode: false, blocked: false, locked: false, dirty }, {
      save: () => calls.push(label), focusForm: name => calls.push(name), arrange() {}, fit() {}, reset() {},
    });
    useLayoutEffect(() => { commands = currentCommands; });
    useGraphShortcuts({ busy: false, form, notice: () => calls.push('notice'), fallback: () => calls.push('fallback'),
      run: action => { if (action === 'saveLayout') currentCommands.save.run();
        else if (action === 'createNode' || action === 'createEdge') currentCommands[action].run(); },
    });
    return null;
  }
  const key = (key: string, menu = false, mod = false) => {
    const target = new Target(); target.menu = menu;
    listeners.get('keydown')!({ key, target, ctrlKey: mod, metaKey: false, altKey: false, shiftKey: false,
      preventDefault() {}, defaultPrevented: false });
  };
  let root: ReturnType<typeof create>;
  try {
    await act(async () => { root = create(createElement(Harness, { label: 'first' })); });
    const first = commands!;
    await act(async () => root.update(createElement(Harness, { label: 'latest' })));
    assert.equal(commands!, first);
    commands!.save.run(); key('s', false, true); key('n'); key('e');
    assert.deepEqual(calls, ['latest', 'latest', 'createNode', 'createEdge']);
    calls.length = 0;
    key('s', true, true); key('n', true); key('Escape', true);
    menuOpen = true; key('s', false, true); key('e');
    assert.deepEqual(calls, []);
    menuOpen = false; modal = true; key('s', false, true);
    assert.deepEqual(calls, ['notice']);
    modal = false; form = true;
    await act(async () => root.update(createElement(Harness, { label: 'latest' })));
    key('s', false, true); assert.deepEqual(calls, ['notice', 'notice']);
    form = false; dirty = false;
    await act(async () => root.update(createElement(Harness, { label: 'clean' })));
    key('s', false, true); assert.deepEqual(calls, ['notice', 'notice']);
  } finally {
    await act(async () => root?.unmount()); Object.assign(globalThis, original);
  }
  assert.equal(listeners.size, 0);
});
