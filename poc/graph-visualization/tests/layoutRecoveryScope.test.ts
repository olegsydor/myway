import assert from "node:assert/strict";
import test from "node:test";

import {
  layoutRecoveryScope,
} from "../src/react-flow/layoutRecoveryScope.ts";

test("creates stable scope for authenticated user", () => {
  assert.equal(layoutRecoveryScope(1), "myway:user:1");
  assert.equal(layoutRecoveryScope(123), "myway:user:123");
});

test("isolates different users", () => {
  assert.notEqual(
    layoutRecoveryScope(10),
    layoutRecoveryScope(20),
  );
});

test("rejects demonstration and invalid user IDs", () => {
  for (const userId of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(layoutRecoveryScope(userId), null);
  }
});
