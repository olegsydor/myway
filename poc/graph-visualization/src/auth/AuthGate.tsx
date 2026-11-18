import { AccountDialog } from "./AccountDialog";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApplicationShell } from "../shell/ApplicationShell";
import { AccountContext } from "./accountContext";
import { ApiError, authRequest, identityGeneration, onAuthInvalid, setCsrf, setIdentity } from "./http";
import { workspaceExit } from "./workspaceLifecycle";
import "./auth.css";

interface User { id: number; email: string; display_name: string }
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
  const [leaving, setLeaving] = useState(false);
  const [revision, setRevision] = useState(0);
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
    setUser(null); setAccountOpen(false); setLeaving(false); setRevision(v => v+1);
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
      closeWorkspace();
      setScreen(incoming.screen); setToken(incoming.token); setChecking(false); setConnectionError(false);
    };
    window.addEventListener("hashchange", hashLink);
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("myway-auth");
      channel.onmessage = () => {
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
  }, [closeWorkspace, validate]);

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
    } catch (cause) { setError(message(cause)); }
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

  if (checking) return <ApplicationShell bar={<strong>My Way</strong>}><p className="auth-status" role="status">Checking your session…</p></ApplicationShell>;
  if (user && !token) return <AccountContext.Provider value={{ openAccount: () => { setAccountOpen(true); setError(""); setNotice(""); } }}>
    {connectionError && <div className="connection-banner" role="status">Connection interrupted. Your workspace is still open. <button onClick={() => void validate()}>Retry</button></div>}
    {children(user, revision)}
    {accountOpen && <AccountDialog busy={busy} onClose={() => { setAccountOpen(false); setLeaving(false); }}>
      {leaving ? <><h1>Sign out?</h1><p>Your unsaved layout can stay in local recovery for this account.</p>{alerts}
        <button disabled={busy || workspaceExit()?.busy} onClick={() => void logout(true)}>Save and sign out</button>
        <button disabled={busy} onClick={() => void logout(false)}>Leave without saving</button>
        <button disabled={busy} onClick={() => setLeaving(false)}>Cancel</button></> : <>{form}<button disabled={busy} onClick={() => {
          if (workspaceExit()?.dirty) setLeaving(true); else void logout(false);
        }}>Sign out</button><button disabled={busy} onClick={() => { setAccountOpen(false); setFields(v => ({ ...v, password: "", current_password: "" })); }}>Back to workspace</button></>}
    </AccountDialog>}
  </AccountContext.Provider>;
  return <ApplicationShell bar={<strong>My Way</strong>}><section className="auth-card">
    {connectionError ? <><h1>Cannot connect to My Way</h1><button onClick={() => void validate()}>Try again</button></> : form}
  </section></ApplicationShell>;
}
