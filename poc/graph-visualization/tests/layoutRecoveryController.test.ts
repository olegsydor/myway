
import assert from "node:assert/strict";
import test from "node:test";

import {
  LayoutRecoveryController,
  type RecoveryStorage,
} from "../src/react-flow/layoutRecoveryController.ts";

import type {
  LayoutRecoveryRecord,
} from "../src/react-flow/layoutRecovery.ts";

function makeRecord(x = 10, layoutId = 7): LayoutRecoveryRecord {
  return {
    version: 1,
    scope: "test-scope",
    layoutId,
    savedAt: "2026-10-23T12:00:00.000Z",
    baseFingerprint: "base",
    nodeFingerprint: "[1]",
    positions: [{ node_id: 1, x, y: 20 }],
  };
}

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function memoryStorage() {
  const records = new Map<string, LayoutRecoveryRecord>();

  const key = (scope: string, layoutId: number | null) =>
    JSON.stringify([scope, layoutId]);

  const storage: RecoveryStorage = {
    async read(scope, layoutId) {
      return records.get(key(scope, layoutId)) ?? null;
    },

    async write(record) {
      records.set(key(record.scope, record.layoutId), record);
    },

    async delete(scope, layoutId) {
      records.delete(key(scope, layoutId));
    },
  };

  return { records, storage };
}

test("debounce retains only the latest snapshot", async () => {
  const { storage } = memoryStorage();
  const controller = new LayoutRecoveryController({
    storage,
    debounceMs: 1000,
  });

  controller.schedule(makeRecord(10));
  controller.schedule(makeRecord(20));
  controller.schedule(makeRecord(30));

  await controller.flush("test-scope", 7);

  const result = await controller.read("test-scope", 7);

  assert.deepEqual(result, makeRecord(30));

  controller.dispose();
});

test("clear cancels a pending debounce", async () => {
  const { storage } = memoryStorage();
  const controller = new LayoutRecoveryController({
    storage,
    debounceMs: 1000,
  });

  controller.schedule(makeRecord());

  await controller.clear("test-scope", 7);

  assert.equal(await controller.read("test-scope", 7), null);

  controller.dispose();
});

test("clear waits for an already-started write", async () => {
  const { storage } = memoryStorage();
  const gate = deferred();
  const started = deferred();
  const events: string[] = [];

  const controlled: RecoveryStorage = {
    ...storage,

    async write(record) {
      events.push("write-start");
      started.resolve();

      await gate.promise;

      await storage.write(record);
      events.push("write-end");
    },

    async delete(scope, layoutId) {
      events.push("delete");
      await storage.delete(scope, layoutId);
    },
  };

  const controller = new LayoutRecoveryController({
    storage: controlled,
  });

  controller.schedule(makeRecord());

  const writing = controller.flush("test-scope", 7);

  await started.promise;

  const clearing = controller.clear("test-scope", 7);

  assert.deepEqual(events, ["write-start"]);

  gate.resolve();

  await Promise.all([writing, clearing]);

  assert.deepEqual(events, [
    "write-start",
    "write-end",
    "delete",
  ]);

  assert.equal(await controller.read("test-scope", 7), null);

  controller.dispose();
});

test("different layouts have independent recovery", async () => {
  const { storage } = memoryStorage();
  const controller = new LayoutRecoveryController({ storage });

  controller.schedule(makeRecord(10, 7));
  controller.schedule(makeRecord(20, 8));

  await Promise.all([
    controller.flush("test-scope", 7),
    controller.flush("test-scope", 8),
  ]);

  await controller.clear("test-scope", 7);

  assert.equal(await controller.read("test-scope", 7), null);
  assert.deepEqual(
    await controller.read("test-scope", 8),
    makeRecord(20, 8),
  );

  controller.dispose();
});

test("failed write does not block later operations", async () => {
  const { storage } = memoryStorage();
  let fail = true;

  const controlled: RecoveryStorage = {
    ...storage,

    async write(record) {
      if (fail) {
        fail = false;
        throw new Error("Simulated IndexedDB failure");
      }

      await storage.write(record);
    },
  };

  const controller = new LayoutRecoveryController({
    storage: controlled,
  });

  controller.schedule(makeRecord(10));

  await assert.rejects(
    controller.flush("test-scope", 7),
    /Simulated IndexedDB failure/,
  );

  controller.schedule(makeRecord(20));
  await controller.flush("test-scope", 7);

  assert.deepEqual(
    await controller.read("test-scope", 7),
    makeRecord(20),
  );

  controller.dispose();
});

test("dispose cancels pending writes without deleting saved recovery", async () => {
  const { storage } = memoryStorage();
  const controller = new LayoutRecoveryController({
    storage,
    debounceMs: 1000,
  });

  controller.schedule(makeRecord(10));
  await controller.flush("test-scope", 7);

  controller.schedule(makeRecord(20));
  controller.dispose();

  assert.deepEqual(
    await storage.read("test-scope", 7),
    makeRecord(10),
  );

  assert.throws(
    () => controller.schedule(makeRecord(30)),
    /disposed/,
  );
});

test("read waits for an in-flight write", async () => {
  const { storage } = memoryStorage();
  const gate = deferred();
  const started = deferred();

  const controlled: RecoveryStorage = {
    ...storage,

    async write(record) {
      started.resolve();
      await gate.promise;
      await storage.write(record);
    },
  };

  const controller = new LayoutRecoveryController({
    storage: controlled,
  });

  controller.schedule(makeRecord(42));

  const writing = controller.flush("test-scope", 7);
  await started.promise;

  const reading = controller.read("test-scope", 7);

  gate.resolve();

  await writing;

  assert.deepEqual(await reading, makeRecord(42));

  controller.dispose();
});

test("old controller must not restore recovery after new controller clears it", async () => {
  const { storage } = memoryStorage();
  const gate = deferred();
  const started = deferred();

  const controlled: RecoveryStorage = {
    ...storage,

    async write(record) {
      started.resolve();
      await gate.promise;
      await storage.write(record);
    },
  };

  const oldController = new LayoutRecoveryController({
    storage: controlled,
  });

  oldController.schedule(makeRecord(10));

  const oldWrite = oldController.flush("test-scope", 7);

  await started.promise;

  oldController.dispose();

  const newController = new LayoutRecoveryController({
    storage: controlled,
  });

  const clearing = newController.clear("test-scope", 7);

  gate.resolve();

  await Promise.all([oldWrite, clearing]);

  assert.equal(
    await newController.read("test-scope", 7),
    null,
  );

  newController.dispose();
});

test("rejects a stale schedule after clear", async () => {
  const { storage } = memoryStorage();
  const controller = new LayoutRecoveryController({ storage });

  const generation = controller.getGeneration("test-scope", 7);

  await controller.clear("test-scope", 7);

  controller.schedule(makeRecord(10), generation);

  await controller.flush("test-scope", 7);

  assert.equal(
    await controller.read("test-scope", 7),
    null,
  );

  controller.dispose();
});

test("accepts a fresh generation after clear", async () => {
  const { storage } = memoryStorage();
  const controller = new LayoutRecoveryController({ storage });

  const oldGeneration = controller.getGeneration("test-scope", 7);

  await controller.clear("test-scope", 7);

  const newGeneration = controller.getGeneration("test-scope", 7);

  assert.notEqual(newGeneration, oldGeneration);

  controller.schedule(makeRecord(20), newGeneration);
  await controller.flush("test-scope", 7);

  assert.deepEqual(
    await controller.read("test-scope", 7),
    makeRecord(20),
  );

  controller.dispose();
});

test("clear invalidates a pending write in another controller", async () => {
  const { storage } = memoryStorage();

  const oldController = new LayoutRecoveryController({
    storage,
    debounceMs: 20,
  });

  const newController = new LayoutRecoveryController({
    storage,
    debounceMs: 20,
  });

  const generation = oldController.getGeneration("test-scope", 7);

  oldController.schedule(makeRecord(10), generation);

  await newController.clear("test-scope", 7);

  // Allow the old controller's debounce timer to fire.
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    await newController.read("test-scope", 7),
    null,
  );

  oldController.dispose();
  newController.dispose();
});