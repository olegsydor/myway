import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, useState } from "react";
import { create } from "react-test-renderer";
import { tsxModule } from "./loadTsx.ts";
const { AccountSettings } = await import(tsxModule(new URL("../src/auth/AccountSettings.tsx", import.meta.url)));

function harnessProps(section: string, onSectionChange: (section: string) => void, overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Oleh", email: "oleh@example.test", section, onSectionChange,
    currentPassword: "current-pass", newPassword: "new-password-long-enough",
    onCurrentPasswordChange() {}, onNewPasswordChange() {}, onPasswordSubmit() {},
    error: "", notice: "", busy: false, onExport() {}, onImport() {}, onRestorePreview() {},
    onDeleteAccount() {}, onSignOut() {}, onBackToWorkspace() {}, ...overrides,
  };
}

test("Account Settings opens on Profile and keeps all section panels mounted with accessible tabs", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let root: ReturnType<typeof create>;
  function Harness() {
    const [section, setSection] = useState("profile");
    return createElement(AccountSettings, harnessProps(section, setSection));
  }
  try {
    await act(async () => { root = create(createElement(Harness)); });
    const tabs = root!.root.findAllByProps({ role: "tab" });
    assert.deepEqual(tabs.map(tab => [tab.children.join(""), tab.props["aria-selected"], tab.props.tabIndex]), [
      ["Profile & Security", true, 0], ["Your Data", false, -1], ["Danger Zone", false, -1],
    ]);
    const panels = root!.root.findAllByProps({ role: "tabpanel" });
    assert.deepEqual(panels.map(panel => panel.props.hidden), [false, true, true]);
    assert.equal(root!.root.findAllByType("input").length, 4);
    assert.equal(root!.root.findAllByProps({ id: "account-dialog-title" }).length, 1);
    assert.equal(root!.root.findAllByType("h1")[0].children.join(""), "Account Settings");
    assert.equal(root!.root.findAllByType("form").length, 3);
    assert.equal(root!.root.findAllByType("input").some(input => input.props.name === undefined && input.props.type !== "file"), false);
  } finally { await act(async () => root?.unmount()); }
});

test("tabs support click, wrap-around arrows, Home and End without submitting forms", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const changes: string[] = [];
  const focus: number[] = [];
  let root: ReturnType<typeof create>;
  function Harness() {
    const [section, setSection] = useState("profile");
    return createElement(AccountSettings, harnessProps(section, next => { changes.push(next); setSection(next); }));
  }
  try {
    await act(async () => { root = create(createElement(Harness), { createNodeMock: element => element.type === "button" ? { focus() { focus.push(element.props.id); } } : {} }); });
    let tabs = root!.root.findAllByProps({ role: "tab" });
    await act(async () => tabs[0].props.onKeyDown({ key: "ArrowLeft", preventDefault() {} }));
    tabs = root!.root.findAllByProps({ role: "tab" });
    assert.equal(tabs[2].props["aria-selected"], true);
    assert.equal(focus.at(-1), "account-tab-danger");
    await act(async () => tabs[2].props.onKeyDown({ key: "ArrowDown", preventDefault() {} }));
    tabs = root!.root.findAllByProps({ role: "tab" });
    assert.equal(tabs[0].props["aria-selected"], true);
    await act(async () => tabs[0].props.onKeyDown({ key: "End", preventDefault() {} }));
    tabs = root!.root.findAllByProps({ role: "tab" });
    assert.equal(tabs[2].props["aria-selected"], true);
    await act(async () => tabs[2].props.onKeyDown({ key: "Home", preventDefault() {} }));
    assert.deepEqual(changes, ["danger", "profile", "danger", "profile"]);
    assert.equal(root!.root.findAllByType("form").length, 3);
  } finally { await act(async () => root?.unmount()); }
});

test("switching sections preserves password fields and native file input instances", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let root: ReturnType<typeof create>;
  function Harness() {
    const [section, setSection] = useState("profile");
    const [currentPassword, setCurrentPassword] = useState("current-pass");
    const [newPassword, setNewPassword] = useState("new-password-long-enough");
    return createElement(AccountSettings, harnessProps(section, setSection, {
      currentPassword, newPassword,
      onCurrentPasswordChange: setCurrentPassword, onNewPasswordChange: setNewPassword,
    }));
  }
  try {
    await act(async () => { root = create(createElement(Harness)); });
    const before = root!.root.findAllByType("input");
    const fileInputs = before.filter(input => input.props.type === "file");
    const tabs = root!.root.findAllByProps({ role: "tab" });
    await act(async () => tabs[1].props.onClick());
    await act(async () => root!.root.findAllByProps({ role: "tab" })[2].props.onClick());
    await act(async () => root!.root.findAllByProps({ role: "tab" })[1].props.onClick());
    const after = root!.root.findAllByType("input");
    assert.equal(after.find(input => input.props.name === "current_password")?.props.value, "current-pass");
    assert.equal(after.find(input => input.props.name === "password")?.props.value, "new-password-long-enough");
    assert.deepEqual(after.filter(input => input.props.type === "file"), fileInputs);
  } finally { await act(async () => root?.unmount()); }
});

test("busy state disables tabs and all section actions; shared feedback and danger content are accessible", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: string[] = [];
  let root: ReturnType<typeof create>;
  await act(async () => { root = create(createElement(AccountSettings, harnessProps("danger", () => {}, {
    busy: true, error: "There was a problem", notice: "Saved", onExport: () => calls.push("export"), onDeleteAccount: () => calls.push("delete"),
  }))); });
  try {
    assert.equal(root!.root.findAllByProps({ role: "tab" }).every(tab => tab.props.disabled), true);
    assert.equal(root!.root.findByProps({ role: "alert" }).children.join(""), "There was a problem");
    assert.equal(root!.root.findByProps({ role: "status" }).children.join(""), "Saved");
    assert.equal(root!.root.findAllByType("form").length, 3);
    assert.equal(root!.root.findAllByType("h1")[0].children.join(""), "Account Settings");
    assert.equal(root!.root.findAllByProps({ role: "tabpanel" }).find(panel => panel.props.id === "account-panel-profile")?.props.hidden, true);
    assert.equal(root!.root.findAllByProps({ role: "tabpanel" }).find(panel => panel.props.id === "account-panel-danger")?.props.hidden, false);
    assert.equal(root!.root.findAllByType("button").find(button => button.children.join("") === "Delete account")?.props.disabled, true);
    assert.deepEqual(calls, []);
  } finally { await act(async () => root?.unmount()); }
});

test("main sections invoke existing handlers once and do not expose deletion password confirmation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: string[] = [];
  let root: ReturnType<typeof create>;
  const handlers = {
    onExport: () => calls.push("export"), onImport: () => calls.push("import"),
    onRestorePreview: () => calls.push("preview"), onDeleteAccount: () => calls.push("delete"),
    onSignOut: () => calls.push("signout"), onBackToWorkspace: () => calls.push("back"),
    onPasswordSubmit: () => calls.push("password"),
  };
  function Harness() {
    const [section, setSection] = useState("profile");
    return createElement(AccountSettings, harnessProps(section, setSection, handlers));
  }
  await act(async () => { root = create(createElement(Harness)); });
  try {
    const exportButton = root!.root.findAllByType("button").find(button => button.children.join("") === "Download my data (JSON)")!;
    const forms = root!.root.findAllByType("form");
    await act(async () => exportButton.props.onClick());
    await act(async () => forms[1].props.onSubmit({ preventDefault() {} }));
    await act(async () => forms[2].props.onSubmit({ preventDefault() {} }));
    assert.deepEqual(calls, ["export", "import", "preview"]);
    await act(async () => root!.root.findAllByProps({ role: "tab" })[0].props.onClick());
    await act(async () => root!.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} }));
    await act(async () => root!.root.findAllByType("button").find(button => button.children.join("") === "Sign out")!.props.onClick());
    await act(async () => root!.root.findAllByType("button").find(button => button.children.join("") === "Back to workspace")!.props.onClick());
    await act(async () => root!.root.findAllByProps({ role: "tab" })[2].props.onClick());
    await act(async () => root!.root.findAllByType("button").find(button => button.children.join("") === "Delete account")!.props.onClick());
    assert.deepEqual(calls, ["export", "import", "preview", "password", "signout", "back", "delete"]);
    assert.equal(root!.root.findAllByType("button").some(button => button.children.join("") === "Schedule account deletion"), false);
    assert.equal(root!.root.findAllByProps({ id: "account-dialog-title" }).length, 1);
    assert.equal(root!.root.findAllByType("section")[0].props["aria-labelledby"], "account-tab-profile");
  } finally { await act(async () => root?.unmount()); }
});
