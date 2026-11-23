import type { Command } from '../react-flow/workspaceCommands.ts';
import type { MenuDefinition, MenuItem } from './menuModel.ts';
export interface ShellCommands {
  createNode: Command; createEdge: Command; grid: Command; circle: Command; dagre: Command; fit: Command; reset: Command;
}
export function applicationMenus(layout: MenuItem[], commands: ShellCommands, help: () => void,
  exportDiagnostics?: () => void, toolsPanel?: { open: boolean; toggle: () => void }): MenuDefinition[] {
  const item = (id: keyof ShellCommands, label: string, shortcut?: string): MenuItem => ({
    id, label: commands[id].disabledReason ? `${label} · ${commands[id].disabledReason}` : label,
    shortcut, disabled: !commands[id].enabled, run: commands[id].run,
  });
  return [
    { id: 'layout', label: 'Layout', items: layout },
    { id: 'create', label: 'Create', items: [item('createNode', 'New Node', 'N'), item('createEdge', 'New Edge', 'E')] },
    { id: 'arrange', label: 'Arrange', items: [item('grid', 'Grid'), item('circle', 'Circle'), item('dagre', 'Dagre'),
      { id: 'separator', kind: 'separator', label: '' }, item('fit', 'Fit to workspace')] },
    { id: 'view', label: 'View', items: [
      ...(toolsPanel ? [{ id: 'tools', label: toolsPanel.open ? 'Hide tools panel' : 'Show tools panel', run: toolsPanel.toggle }] : []),
      item('reset', 'Reset graph selection'),
      ...(exportDiagnostics ? [{ id: 'export', label: 'Export diagnostics…', run: exportDiagnostics }] : [])] },
    { id: 'help', label: 'Help', items: [{ id: 'shortcuts', label: 'Keyboard shortcuts…', run: help }] },
  ];
}
