import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutMenu, layoutStatus, type LayoutController, type LayoutDialog } from '../src/react-flow/layoutMenu.ts';
import { applicationMenus } from '../src/shell/applicationMenus.ts';
import { workspaceCommands } from '../src/react-flow/workspaceCommands.ts';
import { SHORTCUT_HELP } from '../src/shell/shortcutHelp.ts';

export function fixture(overrides: Partial<LayoutController> = {}) {
  const calls: unknown[] = [];
  const active = { id: 1, name: 'Main', is_default: true, created_at: '', updated_at: '' };
  const layout = { active, layouts: [active, { ...active, id: 2, name: 'Other', is_default: false }],
    dirty: false, phase: 'ready', error: '', blocked: false, locked: false, canDiscard: true, canDelete: false,
    isLocked: () => false, discard: () => calls.push('discard'), switchTo: async (...args: unknown[]) => { calls.push(args); return true; },
    setDefault: async () => { calls.push('default'); return true; }, ...overrides,
  } as LayoutController;
  const open = (dialog: LayoutDialog) => calls.push(dialog);
  const save = { enabled: true, run: () => calls.push('save') };
  const menu = layoutMenu(layout, save, open);
  return { layout, menu, calls, save };
}
test('Layout switching delegates directly when clean and offers the existing decision when dirty', () => {
  for (const dirty of [false, true]) {
    const { menu, calls } = fixture({ dirty });
    menu.find(item => item.id === 'switch')!.children![1]!.run!();
    assert.deepEqual(calls, dirty ? [{ kind: 'switch', id: 2, name: 'Other' }] : [[2, 'discard']]);
  }
});
test('Layout menu delegates Save, Discard and existing dialog commands with default-layout protection', () => {
  const { menu, calls, save } = fixture();
  assert.equal(menu.find(item => item.id === 'save')!.run, save.run);
  for (const id of ['save', 'discard', 'new', 'rename', 'delete', 'default']) menu.find(item => item.id === id)!.run!();
  assert.deepEqual(calls, ['save', 'discard', { kind: 'new' }, { kind: 'rename' }]);
  assert.equal(menu.find(item => item.id === 'delete')!.disabled, true);
  assert.equal(menu.find(item => item.id === 'default')!.disabled, true);
});
test('layout busy and immediate lock guards prevent management and switching', () => {
  for (const overrides of [{ blocked: true }, { locked: true, isLocked: () => true }, { isLocked: () => true }]) {
    const { menu, calls } = fixture(overrides);
    for (const id of ['new', 'rename', 'delete', 'default', 'discard']) menu.find(item => item.id === id)!.run!();
    menu.find(item => item.id === 'switch')!.children![1]!.run!();
    assert.deepEqual(calls, []);
  }
});
test('layout status derives from the controller phase, errors and dirty state', () => {
  const statuses = { loading: 'Loading…', recovery: 'Loading…', saving: 'Saving…', switching: 'Opening…', managing: 'Updating…', 'load-error': 'Error', ready: 'Saved' } as const;
  for (const [phase, expected] of Object.entries(statuses)) {
    assert.equal(layoutStatus({ phase: phase as LayoutController['phase'], error: '', dirty: false }), expected);
  }
  assert.equal(layoutStatus({ phase: 'ready', error: '', dirty: true }), 'Unsaved');
  assert.equal(layoutStatus({ phase: 'ready', error: 'Failed', dirty: true }), 'Error');
});
test('product menus share command identities; diagnostics is absent without debug capability', () => {
  const calls: string[] = [];
  const commands = workspaceCommands({ annotationMode: true, blocked: false, locked: false, dirty: true }, {
    save() {}, focusForm() {}, arrange() {}, fit: () => calls.push('fit'), reset() {},
  });
  const launcher = { label: 'Search', controls: 'workspace-panel', expanded: false, disabled: false, run() {} };
  const menus = applicationMenus([], commands, () => calls.push('help'), undefined, undefined, launcher);
  assert.deepEqual(menus.map(menu => menu.label), ['Create', 'Search', 'Layout', 'View', 'Arrange', 'Help']);
  assert.equal(menus[0]!.items.every(item => item.disabled), true);
  assert.equal(menus[4]!.items.find(item => item.id === 'fit')!.run, commands.fit.run);
  assert.equal(menus[3]!.items.some(item => item.id === 'export'), false);
  assert.equal(applicationMenus([], commands, () => {}, () => {}, undefined, launcher)[3]!.items.some(item => item.id === 'export'), true);
  menus[4]!.items.find(item => item.id === 'fit')!.run!(); assert.deepEqual(calls, ['fit']);
});
test('Save is unavailable during protected forms/editors; Help lists only delivered shortcuts', () => {
  const commands = workspaceCommands({ annotationMode: false, blocked: false, locked: false, dirty: true, saveProtected: true }, {
    save: () => assert.fail('protected Save invoked'), focusForm() {}, arrange() {}, fit() {}, reset() {},
  });
  assert.equal(commands.save.enabled, false); commands.save.run();
  const help = JSON.stringify(SHORTCUT_HELP);
  assert.doesNotMatch(help, /F2|Undo|Redo/);
  assert.match(help, /Cmd\/Ctrl\+S/); assert.match(help, /Shift-drag/);
});

test('Fit and Reset are unavailable until React Flow and workspace are ready', () => {
  const commands = workspaceCommands({ annotationMode: false, blocked: false, locked: false, dirty: false, ready: false }, {
    save() {}, focusForm() {}, arrange() {}, fit: () => assert.fail('Fit before readiness'), reset: () => assert.fail('Reset before readiness'),
  });
  assert.equal(commands.fit.enabled, false); commands.fit.run();
  assert.equal(commands.reset.enabled, false); commands.reset.run();
});

test("layout quota disables creation while Save and switching remain available", () => {
  const { menu, calls } = fixture({ layoutCreationBlocked: "Your plan allows 3 layouts." });
  const create = menu.find(item => item.id === "new")!;
  assert.equal(create.disabled, true);
  assert.match(create.label, /limit reached/);
  create.run?.();
  assert.deepEqual(calls, []);
  assert.equal(menu.find(item => item.id === "save")!.disabled, false);
  assert.equal(menu.find(item => item.id === "switch")!.disabled, false);
});
