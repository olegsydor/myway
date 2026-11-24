import { AccountButton } from "../auth/AuthContext";
import { useState } from 'react';
import { ApplicationMenu } from './ApplicationMenu';
import { HelpDialog } from './HelpDialog';
import { applicationMenus, type ShellCommands } from './applicationMenus';
import type { MenuItem } from './menuModel';
import type { Command } from '../react-flow/workspaceCommands';
import { WorkspaceModeSwitch } from '../react-flow/AnnotationControls';
import type { AnnotationWorkspace } from '../react-flow/useAnnotationWorkspace';
import { WORKSPACE_PANEL_ID } from './workspacePanelState';
import type { useWorkspacePanel } from './useWorkspacePanel';
import { isEditableTarget } from '../react-flow/graphShortcuts';

export function ApplicationBar({ layoutName, status, layoutItems, save, commands, workspace,
  modeLocked, menuBlocked, exportDiagnostics, formActive, panel }: {
  layoutName: string; status: string; layoutItems: MenuItem[]; save: Command; commands: ShellCommands;
  workspace: AnnotationWorkspace; modeLocked: boolean; menuBlocked: boolean; formActive: boolean;
  exportDiagnostics?: () => void;
  panel: ReturnType<typeof useWorkspacePanel>;
}) {
  const [help, setHelp] = useState(false);
  const [helpInvoker, setHelpInvoker] = useState<HTMLElement | null>(null);
  function openHelp() {
    setHelpInvoker(document.querySelector<HTMLElement>('[data-application-menu="help"]'));
    setHelp(true);
  }
  const blocked = menuBlocked || help;
  const modalOpen = () => Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
  const annotations = workspace.mode === 'annotation';
  const launcherView = annotations ? 'annotations' : 'search';
  const viewAction = panel.open ? {
    label: 'Close side panel',
    run: () => {
      const invoker = document.querySelector<HTMLElement>('[data-application-menu="view"]') ?? undefined;
      panel.close(invoker);
    },
  } : undefined;
  return <>
    <strong className="application-bar__identity">My Way</strong>
    <ApplicationMenu menus={applicationMenus(layoutItems, commands, openHelp, exportDiagnostics, viewAction, {
      label: annotations ? 'Annotations' : 'Search',
      controls: WORKSPACE_PANEL_ID,
      expanded: panel.open && panel.view === launcherView,
      disabled: help,
      preservePointerFocus: Boolean(workspace.editor),
      run: invoker => { if (!modalOpen()) panel.launch(invoker); },
    })}
      blocked={blocked} canOpen={() => !blocked && !modalOpen()}
      altAllowed={() => !blocked && !modalOpen() && !formActive && !isEditableTarget(document.activeElement)} />
    <div className="application-bar__layout" role="status" aria-live="polite" title={`${layoutName} — ${status}`}>
      <span>{layoutName}</span><small>{status}</small>
    </div>
    <button className="application-bar__save" type="button" disabled={!save.enabled || blocked}
      title="Save layout (Cmd/Ctrl+S)" onClick={save.run}>Save</button>
    <WorkspaceModeSwitch workspace={workspace} locked={modeLocked || help} />
    <AccountButton />
    <HelpDialog open={help} returnFocus={helpInvoker} onClose={() => setHelp(false)} />
  </>;
}
