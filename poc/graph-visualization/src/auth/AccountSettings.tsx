import { useRef, type FormEvent, type KeyboardEvent } from "react";

export type AccountSection = "profile" | "data" | "danger";

interface AccountSettingsProps {
  displayName: string;
  email: string;
  section: AccountSection;
  onSectionChange: (section: AccountSection) => void;
  currentPassword: string;
  newPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
  notice: string;
  busy: boolean;
  onExport: () => void;
  onImport: (event: FormEvent<HTMLFormElement>) => void;
  onRestorePreview: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteAccount: () => void;
  onSignOut: () => void;
  onBackToWorkspace: () => void;
}

const sections: { id: AccountSection; label: string }[] = [
  { id: "profile", label: "Profile & Security" },
  { id: "data", label: "Your Data" },
  { id: "danger", label: "Danger Zone" },
];

const sectionIds: Record<AccountSection, { tab: string; panel: string }> = {
  profile: { tab: "account-tab-profile", panel: "account-panel-profile" },
  data: { tab: "account-tab-data", panel: "account-panel-data" },
  danger: { tab: "account-tab-danger", panel: "account-panel-danger" },
};

export function AccountSettings(props: AccountSettingsProps) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, current: AccountSection) {
    const index = sections.findIndex(item => item.id === current);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + sections.length) % sections.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sections.length - 1;
    if (next === null) return;
    event.preventDefault();
    const section = sections[next].id;
    props.onSectionChange(section);
    tabs.current[next]?.focus();
  }

  return <div className="account-settings">
    <header className="account-settings__header">
      <h1 id="account-dialog-title">Account Settings</h1>
      <div className="account-settings__identity" aria-label="Account details">
        <span>{props.displayName}</span>
        <span>{props.email}</span>
      </div>
    </header>

    <div className="account-settings__tabs" role="tablist" aria-label="Account settings sections">
      {sections.map((item, index) => <button
        key={item.id}
        ref={element => { tabs.current[index] = element; }}
        id={sectionIds[item.id].tab}
        type="button"
        role="tab"
        aria-controls={sectionIds[item.id].panel}
        aria-selected={props.section === item.id}
        tabIndex={props.section === item.id ? 0 : -1}
        disabled={props.busy}
        onClick={() => props.onSectionChange(item.id)}
        onKeyDown={event => moveTab(event, item.id)}
      >{item.label}</button>)}
    </div>

    <div className="account-settings__feedback" aria-live="off">
      {props.error && <p role="alert" className="error">{props.error}</p>}
      {props.notice && <p role="status">{props.notice}</p>}
    </div>

    <section id={sectionIds.profile.panel} role="tabpanel" aria-labelledby={sectionIds.profile.tab} hidden={props.section !== "profile"}>
      <div className="account-settings__card">
        <h2>Password</h2>
        <form onSubmit={props.onPasswordSubmit}>
          <fieldset disabled={props.busy}>
            <label>Current password
              <input name="current_password" type="password" autoComplete="current-password" required maxLength={128}
                value={props.currentPassword} onChange={event => props.onCurrentPasswordChange(event.target.value)} />
            </label>
            <label>New password (15–128 characters)
              <input name="password" type="password" autoComplete="new-password" required minLength={15} maxLength={128}
                value={props.newPassword} onChange={event => props.onNewPasswordChange(event.target.value)} />
            </label>
            <button type="submit">{props.busy ? "Please wait…" : "Change password and sign out"}</button>
          </fieldset>
        </form>
      </div>
      <div className="account-settings__card">
        <h2>Session</h2>
        <p>Sign out of My Way on this device. Your workspace recovery stays with your account.</p>
        <button type="button" className="account-settings__secondary" disabled={props.busy} onClick={props.onSignOut}>Sign out</button>
      </div>
    </section>

    <section id={sectionIds.data.panel} role="tabpanel" aria-labelledby={sectionIds.data.tab} hidden={props.section !== "data"}>
      <div className="account-settings__card">
        <h2>Export workspace</h2>
        <p>Download a JSON copy of your My Way workspace.</p>
        <button type="button" disabled={props.busy} onClick={props.onExport}>Download my data (JSON)</button>
      </div>
      <div className="account-settings__card">
        <h2>Import into an empty account</h2>
        <p>Import a My Way JSON export into an empty account.</p>
        <form onSubmit={props.onImport}>
          <fieldset disabled={props.busy}>
            <label>My Way export file
              <input name="exportFile" type="file" accept=".json,application/json" required />
            </label>
            <button type="submit">Import data (JSON)</button>
          </fieldset>
        </form>
      </div>
      <div className="account-settings__card account-settings__card--restore">
        <h2>Restore / Replace workspace</h2>
        <p className="account-settings__warning">The current workspace will be completely replaced by the selected export.</p>
        <form onSubmit={props.onRestorePreview}>
          <fieldset disabled={props.busy}>
            <label>Restore from a My Way JSON export
              <input name="restoreFile" type="file" accept=".json,application/json" required />
            </label>
            <button type="submit">Preview restore</button>
          </fieldset>
        </form>
      </div>
    </section>

    <section id={sectionIds.danger.panel} role="tabpanel" aria-labelledby={sectionIds.danger.tab} hidden={props.section !== "danger"}>
      <div className="account-settings__card account-settings__danger">
        <h2>Delete account</h2>
        <p>Schedule your account and workspace for deletion. You can cancel within 30 days.</p>
        <button type="button" className="account-settings__danger-button" disabled={props.busy} onClick={props.onDeleteAccount}>Delete account</button>
      </div>
    </section>

    <footer className="account-settings__footer">
      <button type="button" className="account-settings__secondary" disabled={props.busy} onClick={props.onBackToWorkspace}>Back to workspace</button>
    </footer>
  </div>;
}
