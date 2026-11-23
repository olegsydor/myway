import { EntitlementContext, fetchEntitlements, formatPlanViolation, type Entitlements } from "./entitlements.ts";
import { downloadDataExport } from "./dataExport";
import { importDataFile, importErrorMessage, previewRestore, restoreWorkspace, type RestorePreview } from "./dataImport";
import { AccountSettings, type AccountSection } from "./AccountSettings";
import { clearWorkspaceRecovery } from "../react-flow/layoutRecoveryController";
import { layoutRecoveryScope } from "../react-flow/layoutRecoveryScope";
import { AccountDialog } from "./AccountDialog";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApplicationShell } from "../shell/ApplicationShell";
import { AccountContext } from "./accountContext";
import { ApiError, authRequest, identityGeneration, onAuthInvalid, setCsrf, setIdentity } from "./http";
import { workspaceExit } from "./workspaceLifecycle";
import "./auth.css";

interface User { id: number; email: string; display_name: string }
interface PendingDeletion {
  deletion_due_at: string;
  can_cancel: boolean;
}
interface Session { user: User; csrf_token: string }
type Screen = "login" | "register" | "forgot" | "resend" | "verify-email" | "reset-password";
const explanations: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  email_verification_required: "Verify your email before signing in. You can request another email below.",
  account_blocked: "Access to this account is blocked. Contact the My Way operator.",
  registration_disabled: "New registrations are temporarily closed. Existing accounts can still sign in.",
  invalid_or_expired_token: "This link is invalid or has expired. Request a new email.",
  invalid_current_password: "The current password is incorrect.",
  rate_limited: "Too many attempts. Please wait before trying again.",
  deletion_not_pending: "This account is no longer scheduled for deletion. Try signing in again.",
  deletion_window_closed: "The cancellation deadline has passed.",
  invalid_deletion_input: "Check your account details and password.",
  csrf_failed: "Your session changed. Please sign in again.",
};
function message(error: unknown) {
  if (error instanceof ApiError) return explanations[error.code] ?? error.message;
  return "Could not connect to My Way. Please try again.";
}
function initialLink(): { screen: Screen; token: string } {
  const match = /^#(verify-email|reset-password)\/([A-Za-z0-9_-]{32,128})$/.exec(window.location.hash);
  if (!match) return { screen: "login", token: "" };
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return { screen: match[1] as Screen, token: match[2] };
}
let channel: BroadcastChannel | null = null;
function notifyOtherTabs() { channel?.postMessage("session-changed"); }

export function AuthGate({ children }: { children: (user: User, generation: number) => ReactNode }) {
  const [link] = useState(initialLink);
  const [screen, setScreen] = useState<Screen>(link.screen);
  const [token, setToken] = useState(link.token);
  const linkPending = useRef(Boolean(link.token));
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSection, setAccountSection] = useState<AccountSection>("profile");
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [deletionPassword, setDeletionPassword] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [planSnapshot, setPlanSnapshot] = useState<{ revision: number; plan: Entitlements | null }>();
  const [planRefresh, setPlanRefresh] = useState(0);
  const refreshPlan = useCallback(() => setPlanRefresh(value => value + 1), []);
  const plan = planSnapshot && planSnapshot.revision === revision ? planSnapshot.plan : null;
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetchEntitlements(controller.signal).then(
      result => { if (!controller.signal.aborted) setPlanSnapshot({ revision, plan: result }); },
      () => { if (!controller.signal.aborted) setPlanSnapshot({ revision, plan: null }); },
    );
    return () => controller.abort();
  }, [user, revision, planRefresh]);
  const [restorePreview, setRestorePreview] = useState<{ file: File; counts: RestorePreview } | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const mounted = useRef(true);
  const validating = useRef(false);
  const [fields, setFields] = useState({ email: "", password: "", display_name: "", current_password: "" });

  const preCsrf = useCallback(async () => {
    const value = await authRequest<{ csrf_token: string }>("/csrf");
    setCsrf(value.csrf_token);
  }, []);
  const closeWorkspace = useCallback((reason = "") => {
    // Snapshot captures the old scope before invalidating requests and unmounting.
    void workspaceExit()?.preserve().catch(() => {});
    userRef.current = null;
    setIdentity(null, null);
    setUser(null); setAccountOpen(false); setLeaving(false); setConfirmDeletion(false); setDeletionPassword(""); setRevision(v => v+1);
    setRestorePreview(null); setRestoreConfirmed(false);
    setNotice(reason); setError("");
    setFields(value => ({ ...value, password: "", current_password: "" }));
    void preCsrf().catch(() => {});
  }, [preCsrf]);
  const validate = useCallback(async () => {
    if (validating.current) return;
    validating.current = true;
    const started = identityGeneration();
    try {
      if (linkPending.current) { await preCsrf(); setConnectionError(false); return; }
      const session = await authRequest<Session>("/me");
      if (!mounted.current || started !== identityGeneration()) return;
      if (userRef.current?.id !== session.user.id) {
        if (userRef.current) void workspaceExit()?.preserve().catch(() => {});
        setIdentity(session.user.id, session.csrf_token);
        userRef.current = session.user;
        setUser(session.user); setRevision(v => v+1); setAccountOpen(false);
      } else setCsrf(session.csrf_token);
      setConnectionError(false);
    } catch (cause) {
      if (!mounted.current || started !== identityGeneration()) return;
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        if (userRef.current) closeWorkspace("Your session ended. Sign in to continue. Local recovery stays with your account.");
        else { await preCsrf(); setConnectionError(false); }
      } else {
        setConnectionError(true);
      }
    } finally {
      validating.current = false;
      if (mounted.current) setChecking(false);
    }
  }, [closeWorkspace, preCsrf]);

  const reloadRestoredWorkspace = useCallback(async (userId: number) => {
    const started = identityGeneration();
    workspaceExit()?.stopRecovery();
    let recoveryCleared = true;
    try {
      const scope = layoutRecoveryScope(userId);
      if (scope) await clearWorkspaceRecovery(scope);
    } catch {
      recoveryCleared = false;
    } finally {
      if (started === identityGeneration()) setRevision(value => value + 1);
    }
    return recoveryCleared;
  }, []);

  useEffect(() => {
    mounted.current = true;
    onAuthInvalid(cause => closeWorkspace(message(cause)));
    void Promise.resolve().then(() => { if (mounted.current) return validate(); });
    const focus = () => { if (document.visibilityState === "visible") void validate(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const heartbeat = window.setInterval(focus, 60000);
    const hashLink = () => {
      const incoming = initialLink();
      if (!incoming.token) return;
      linkPending.current = true;
      setPendingDeletion(null);
      closeWorkspace();
      setScreen(incoming.screen); setToken(incoming.token); setChecking(false); setConnectionError(false);
    };
    window.addEventListener("hashchange", hashLink);
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("myway-auth");
      channel.onmessage = event => {
        if (event.data?.type === "workspace-restored") {
          if (userRef.current?.id === event.data.userId) {
            setRestorePreview(null);
            setRestoreConfirmed(false);
            void reloadRestoredWorkspace(event.data.userId);
          }
          return;
        }
        // Stop the old workspace immediately; only /me establishes the next identity.
        if (userRef.current) closeWorkspace("Session changed in another tab.");
        void validate();
      };
    }
    return () => {
      mounted.current = false; onAuthInvalid(null);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("hashchange", hashLink);
      window.clearInterval(heartbeat); channel?.close(); channel = null;
    };
  }, [closeWorkspace, reloadRestoredWorkspace, validate]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      // Public actions use fresh pre-auth token; authenticated password change uses session token.
      if (!user) await preCsrf();
      if (user) {
        await authRequest("/password/change", { current_password: fields.current_password, password: fields.password });
        closeWorkspace("Password changed. Sign in again."); notifyOtherTabs();
      } else if (screen === "login") {
        const session = await authRequest<Session>("/login", { email: fields.email, password: fields.password });
        setIdentity(session.user.id, session.csrf_token);
        userRef.current = session.user; setUser(session.user); setRevision(v => v+1);
        setConnectionError(false); notifyOtherTabs();
      } else if (screen === "register") {
        await authRequest("/register", { email: fields.email, password: fields.password, display_name: fields.display_name });
        setScreen("resend"); setNotice("If eligible, a verification email will arrive. Open it and confirm your password to activate your account.");
      } else if (screen === "forgot" || screen === "resend") {
        await authRequest(screen === "forgot" ? "/password/forgot" : "/email/resend", { email: fields.email });
        setNotice("If this address is eligible, an email will arrive shortly. Check your inbox and spam folder.");
      } else {
        await authRequest(screen === "verify-email" ? "/email/verify" : "/password/reset", { token, password: fields.password });
        linkPending.current = false; setToken(""); setScreen("login");
        setNotice("Your password is set. Sign in to continue."); notifyOtherTabs();
      }
      setFields(value => ({ ...value, password: "", current_password: "" }));
    } catch (cause) {
      if (screen === "login" && cause instanceof ApiError && cause.code === "account_pending_deletion") {
        setPendingDeletion(cause.detail as PendingDeletion);
        setFields(value => ({ ...value, password: "" }));
      } else setError(message(cause));
    }
    finally { setBusy(false); }
  }
  async function logout(save: boolean) {
    setBusy(true); setError("");
    try {
      const workspace = workspaceExit();
      if (save && workspace && !await workspace.save()) { setError("Could not save. Finish the current operation or try again."); return; }
      await workspace?.preserve().catch(() => {});
      await authRequest("/logout", {});
      closeWorkspace("Signed out. Local recovery stays with your account."); notifyOtherTabs();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { closeWorkspace(); notifyOtherTabs(); }
      else setError(message(cause));
    } finally { setBusy(false); }
  }
  const field = (name: keyof typeof fields, label: string, type = "text") => <label>{label}
    <input name={name} type={type} value={fields[name]} required maxLength={name === "display_name" ? 255 : name === "email" ? 320 : 128}
      minLength={name === "password" && (user || screen !== "login") ? 15 : undefined}
      autoComplete={name === "email" ? "email" : name === "display_name" ? "name" : name === "current_password" || screen === "login" ? "current-password" : "new-password"}
      onChange={event => setFields({ ...fields, [name]: event.target.value })} /></label>;
  const alerts = <>{error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}</>;
  const title = user ? "Account" : ({ login: "Welcome to My Way", register: "Create your account", forgot: "Reset your password", resend: "Verify your email", "verify-email": "Confirm your email and password", "reset-password": "Choose a new password" })[screen];
  const form = <form onSubmit={event => void submit(event)}>
    <h1>{title}</h1>
    {user && <p>{user.display_name}<br />{user.email}</p>}
    {alerts}
    <fieldset disabled={busy}>
      {user ? <>{field("current_password", "Current password", "password")}{field("password", "New password (15–128 characters)", "password")}</> : <>
        {screen === "register" && field("display_name", "Name")}
        {!["verify-email", "reset-password"].includes(screen) && field("email", "Email", "email")}
        {["register", "login", "verify-email", "reset-password"].includes(screen) && field("password", screen === "login" ? "Password" : "Password (15–128 characters)", "password")}
      </>}
      <button type="submit">{busy ? "Please wait…" : user ? "Change password and sign out" : screen === "login" ? "Sign in" : screen === "register" ? "Create account" : screen === "verify-email" ? "Verify email and set password" : screen === "reset-password" ? "Set password" : "Send email"}</button>
    </fieldset>
    {!user && <nav aria-label="Account options">{([ ["login", "Sign in"], ["register", "Create account"], ["forgot", "Forgot password?"], ["resend", "Resend verification"] ] as [Screen,string][]).filter(([value]) => value !== screen).map(([value,label]) => <button type="button" disabled={busy} key={value} onClick={() => { linkPending.current = false; setToken(""); setScreen(value); setError(""); setNotice(""); setFields(v => ({ ...v, password: "" })); }}>{label}</button>)}</nav>}
  </form>;

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const email = user?.email ?? "";
    const started = identityGeneration();
    try {
      const result = await authRequest<{ deletion_due_at: string }>("/account/deletion", {
        current_password: deletionPassword,
      });
      if (started !== identityGeneration()) return;
      closeWorkspace();
      setFields(value => ({ ...value, email }));
      setPendingDeletion({ deletion_due_at: result.deletion_due_at, can_cancel: true });
      notifyOtherTabs();
    } catch (cause) {
      if (started === identityGeneration()) {
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) void validate();
        setError(message(cause));
      }
    } finally {
      setDeletionPassword(""); setBusy(false);
    }
  }

  async function cancelDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await preCsrf();
      await authRequest("/account/deletion/cancel", { email: fields.email, password: deletionPassword });
      setPendingDeletion(null);
      setNotice("Deletion canceled. Sign in to open your workspace.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "deletion_window_closed") {
        setPendingDeletion(value => value && { ...value, can_cancel: false });
      }
      setError(message(cause));
    } finally {
      setDeletionPassword(""); setBusy(false);
    }
  }

  const deletionPasswordField = <label>Current password
    <input type="password" autoComplete="current-password" required maxLength={128}
      value={deletionPassword} onChange={event => setDeletionPassword(event.target.value)} />
  </label>;
  const pendingForm = pendingDeletion && <div>
    <h1>Account scheduled for deletion</h1>
    <p>{fields.email}</p>
    <p>{pendingDeletion.can_cancel
      ? <>Your workspace is locked. You can cancel until <time dateTime={pendingDeletion.deletion_due_at}>{new Date(pendingDeletion.deletion_due_at).toLocaleString()}</time>.</>
      : "The cancellation deadline has passed."}</p>
    {alerts}
    {pendingDeletion.can_cancel && <form onSubmit={event => void cancelDeletion(event)}>
      <fieldset disabled={busy}>
        {deletionPasswordField}
        <button type="submit">Cancel account deletion</button>
      </fieldset>
    </form>}
    <button type="button" disabled={busy} onClick={() => {
      setPendingDeletion(null); setDeletionPassword(""); setError("");
    }}>Back to sign in</button>
  </div>;

  async function exportData() {
    const started = identityGeneration();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await downloadDataExport();
    } catch {
      if (started === identityGeneration()) setError("Could not download your data. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function importData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const importForm = event.currentTarget;
    const file = new FormData(importForm).get("exportFile");
    if (!(file instanceof File)) return;

    const started = identityGeneration();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const workspace = workspaceExit();
      if (workspace?.busy) {
        setError("Finish your current workspace edits before importing.");
        return;
      }
      const result = await importDataFile(file);
      if (started !== identityGeneration()) return;
      if (result.nodes || result.edges || result.layouts) {
        await workspace?.preserve().catch(() => {});
        if (started !== identityGeneration()) return;
        setRevision(value => value + 1);
      }
      importForm.reset();
      setNotice(`Import complete. Nodes: ${result.nodes}, edges: ${result.edges}, layouts: ${result.layouts}.`);
    } catch (cause) {
      if (started === identityGeneration()) {
        if (cause instanceof ApiError && cause.code === "plan_limit_exceeded") refreshPlan();
        setError(importErrorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  }

  async function reviewRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const file = new FormData(event.currentTarget).get("restoreFile");
    if (!(file instanceof File) || !file.name) return;
    const started = identityGeneration();
    setBusy(true); setError(""); setNotice(""); setRestoreConfirmed(false);
    try {
      const counts = await previewRestore(file);
      if (started === identityGeneration()) { setRestorePreview({ file, counts }); setAccountSection("data"); }
    } catch (cause) {
      if (started === identityGeneration()) setError(importErrorMessage(cause, "preview"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy || !restorePreview?.counts.eligibility.allowed || !restoreConfirmed) return;
    if (workspaceExit()?.busy) {
      setError("Finish your current workspace edits before restoring.");
      return;
    }
    const started = identityGeneration();
    setBusy(true); setError(""); setNotice("");
    try {
      await restoreWorkspace(restorePreview.file);
      channel?.postMessage({ type: "workspace-restored", userId: user.id });
      if (started !== identityGeneration()) return;
      const recoveryCleared = await reloadRestoredWorkspace(user.id);
      if (started !== identityGeneration()) return;
      setRestorePreview(null); setRestoreConfirmed(false);
      setNotice("Workspace restored.");
      if (!recoveryCleared) setError("The workspace was replaced. This browser could not clear local recovery.");
    } catch (cause) {
      if (started === identityGeneration()) {
        setRestoreConfirmed(false);
        if (cause instanceof ApiError && cause.code === "plan_limit_exceeded") refreshPlan();
        setError(importErrorMessage(cause, "restore"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <ApplicationShell bar={<strong>My Way</strong>}><p className="auth-status" role="status">Checking your session…</p></ApplicationShell>;
  if (user && !token) return <AccountContext.Provider value={{ openAccount: () => { refreshPlan(); setAccountSection("profile"); setAccountOpen(true); setError(""); setNotice(""); } }}>
    {connectionError && <div className="connection-banner" role="status">Connection interrupted. Your workspace is still open. <button onClick={() => void validate()}>Retry</button></div>}
    <EntitlementContext.Provider value={{ plan, refresh: refreshPlan }}>
    {children(user, revision)}
    {accountOpen && <AccountDialog busy={busy} labelledBy="account-dialog-title" onClose={() => { setAccountOpen(false); setLeaving(false); setConfirmDeletion(false); setDeletionPassword(""); setRestorePreview(null); setRestoreConfirmed(false); setFields(v => ({ ...v, password: "", current_password: "" })); }}>
      {restorePreview ? <>
        <h1 id="account-dialog-title">Replace your workspace?</h1>
        <p role="alert">Restoring this file will permanently delete and replace your current workspace, including unsaved layout changes.</p>
        <p>{restorePreview.file.name}</p>
        <ul>
          <li>Nodes: {restorePreview.counts.nodes}</li>
          <li>Edges: {restorePreview.counts.edges}</li>
          <li>Layouts: {restorePreview.counts.layouts}</li>
          <li>Positions: {restorePreview.counts.positions}</li>
          <li>Annotations: {restorePreview.counts.annotations}</li>
        </ul>
        {!restorePreview.counts.eligibility.allowed && <ul role="alert">
          {restorePreview.counts.eligibility.violations.map((violation, index) =>
            <li key={index}>{formatPlanViolation(violation, true)}</li>)}
        </ul>}
        {alerts}
        <button type="button" disabled={busy} onClick={() => void exportData()}>Download current workspace (JSON)</button>
        <form onSubmit={event => void confirmRestore(event)}>
          <fieldset disabled={busy}>
            <label className="restore-confirmation"><input type="checkbox" required checked={restoreConfirmed} disabled={!restorePreview.counts.eligibility.allowed}
              onChange={event => setRestoreConfirmed(event.target.checked)} />
              I understand that my current workspace will be permanently replaced.
            </label>
            <button className="restore-submit" type="submit" disabled={!restoreConfirmed || !restorePreview.counts.eligibility.allowed}>Replace workspace</button>
            <button type="button" onClick={() => { setRestorePreview(null); setRestoreConfirmed(false); setAccountSection("data"); setError(""); }}>Cancel</button>
          </fieldset>
        </form>
      </> : confirmDeletion ? <form onSubmit={event => void deleteAccount(event)}>
        <h1 id="account-dialog-title">Delete your account?</h1>
        <p>Every session will be signed out and your workspace will be locked. You have 30 days to cancel before your account and workspace data can be permanently deleted.</p>
        {alerts}
        <fieldset disabled={busy}>
          {deletionPasswordField}
          <button type="submit">Schedule account deletion</button>
          <button type="button" onClick={() => { setConfirmDeletion(false); setDeletionPassword(""); setAccountSection("danger"); setError(""); }}>Back to account</button>
        </fieldset>
      </form> : leaving ? <><h1 id="account-dialog-title">Sign out?</h1><p>Your unsaved layout can stay in local recovery for this account.</p>{alerts}
        <button disabled={busy || workspaceExit()?.busy} onClick={() => void logout(true)}>Save and sign out</button>
        <button disabled={busy} onClick={() => void logout(false)}>Leave without saving</button>
        <button disabled={busy} onClick={() => { setLeaving(false); setAccountSection("profile"); }}>Cancel</button></> : <AccountSettings
          displayName={user.display_name}
          email={user.email}
          section={accountSection}
          onSectionChange={setAccountSection}
          currentPassword={fields.current_password}
          newPassword={fields.password}
          onCurrentPasswordChange={value => setFields(fields => ({ ...fields, current_password: value }))}
          onNewPasswordChange={value => setFields(fields => ({ ...fields, password: value }))}
          onPasswordSubmit={event => void submit(event)}
          error={error}
          notice={notice}
          busy={busy}
          onExport={() => void exportData()}
          onImport={event => void importData(event)}
          onRestorePreview={event => void reviewRestore(event)}
          onDeleteAccount={() => {
            setAccountSection("danger"); setConfirmDeletion(true); setError(""); setNotice("");
            setFields(value => ({ ...value, password: "", current_password: "" }));
          }}
          onSignOut={() => { if (workspaceExit()?.dirty) setLeaving(true); else void logout(false); }}
          onBackToWorkspace={() => { setAccountOpen(false); setFields(v => ({ ...v, password: "", current_password: "" })); }}
        />}
    </AccountDialog>}
    </EntitlementContext.Provider>
  </AccountContext.Provider>;
  return <ApplicationShell bar={<strong>My Way</strong>}><section className="auth-card">
    {connectionError ? <><h1>Cannot connect to My Way</h1><button onClick={() => void validate()}>Try again</button></> : pendingForm ?? form}
  </section></ApplicationShell>;
}
