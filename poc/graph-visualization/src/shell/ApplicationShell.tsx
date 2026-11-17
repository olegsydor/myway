import type { ReactNode } from "react";
import "./shell.css";
import "./calmCanvas.css";

/** Persistent bar above the independently scrolling workspace. */
export function ApplicationShell({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  return <div className="application-shell">
    <header className="application-shell__bar">{bar}</header>
    <main className="application-shell__workspace">{children}</main>
  </div>;
}
