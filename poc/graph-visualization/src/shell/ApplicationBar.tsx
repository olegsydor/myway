import { useState } from 'react';
import { ApplicationMenu } from './ApplicationMenu';
import { HelpDialog } from './HelpDialog';
import { applicationMenus, type ShellCommands } from './applicationMenus';
import type { MenuItem } from './menuModel';
import type { Command } from '../react-flow/workspaceCommands';
import { WorkspaceModeSwitch } from '../react-flow/AnnotationControls';
import type { AnnotationWorkspace } from '../react-flow/useAnnotationWorkspace';
import { isEditableTarget } from '../react-flow/graphShortcuts';

export function ApplicationBar({ layoutName, status, layoutItems, save, commands, workspace,
  modeLocked, menuBlocked, exportDiagnostics, formActive, toolsPanel }: {
  layoutName: string; status: string; layoutItems: MenuItem[]; save: Command; commands: ShellCommands;
  workspace: AnnotationWorkspace; modeLocked: boolean; menuBlocked: boolean; formActive: boolean;
  exportDiagnostics?: () => void;
  toolsPanel: { open: boolean; toggle: () => void };
}) {
  const [help, setHelp] = useState(false);
  const [helpInvoker, setHelpInvoker] = useState<HTMLElement | null>(null);
  function openHelp() {
    setHelpInvoker(document.querySelector<HTMLElement>('[data-application-menu="help"]'));
    setHelp(true);
  }
  const blocked = menuBlocked || help;
  const modalOpen = () => Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
  return <>
    <button type="button" data-tools-toggle className="application-bar__tools" aria-controls="myway-tools-panel"
      aria-expanded={toolsPanel.open} aria-label={toolsPanel.open ? 'Hide tools panel' : 'Show tools panel'}
      onPointerDown={event => { if (workspace.editor) event.preventDefault(); }}
      onClick={toolsPanel.toggle}>Tools</button>
    <strong className="application-bar__identity">My Way</strong>
    <ApplicationMenu menus={applicationMenus(layoutItems, commands, openHelp, exportDiagnostics, toolsPanel)}
      blocked={blocked} canOpen={() => !blocked && !modalOpen()}
      altAllowed={() => !blocked && !modalOpen() && !formActive && !isEditableTarget(document.activeElement)} />
    <div className="application-bar__layout" role="status" aria-live="polite" title={`${layoutName} — ${status}`}>
      <span>{layoutName}</span><small>{status}</small>
    </div>
    <button className="application-bar__save" type="button" disabled={!save.enabled || blocked}
      title="Save layout (Cmd/Ctrl+S)" onClick={save.run}>Save</button>
    <WorkspaceModeSwitch workspace={workspace} locked={modeLocked || help} />
    <HelpDialog open={help} returnFocus={helpInvoker} onClose={() => setHelp(false)} />
  </>;
}
