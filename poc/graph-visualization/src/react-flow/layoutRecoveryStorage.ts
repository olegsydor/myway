
import type { LayoutRecoveryRecord } from "./layoutRecovery";

const DB_NAME = "myway-layout-recovery";
const DB_VERSION = 1;
const STORE_NAME = "recoveries";

interface StoredRecovery {
  key: string;
  record: LayoutRecoveryRecord;
}

function recoveryKey(
  scope: string,
  layoutId: number | null,
): string {
  if (!scope.trim()) {
    throw new Error("Recovery scope is required");
  }

  if (
    layoutId !== null &&
    (!Number.isSafeInteger(layoutId) || layoutId <= 0)
  ) {
    throw new Error("Invalid recovery layout ID");
  }

  return JSON.stringify([scope, layoutId]);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "key",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed"));
    };

    request.onblocked = () => {
      reject(new Error("IndexedDB upgrade blocked"));
    };
  });
}

export async function readLayoutRecovery(
  scope: string,
  layoutId: number | null,
): Promise<unknown | null> {
  const key = recoveryKey(scope, layoutId);
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);

      let result: unknown = null;

      request.onsuccess = () => {
        const stored = request.result as StoredRecovery | undefined;
        result = stored?.record ?? null;
      };

      transaction.oncomplete = () => resolve(result);

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Recovery read failed"));
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Recovery read aborted"));
      };
    });
  } finally {
    db.close();
  }
}

export async function writeLayoutRecovery(
  record: LayoutRecoveryRecord,
): Promise<void> {
  const key = recoveryKey(record.scope, record.layoutId);
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).put({
        key,
        record,
      } satisfies StoredRecovery);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Recovery write failed"));
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Recovery write aborted"));
      };
    });
  } finally {
    db.close();
  }
}

export async function deleteLayoutRecovery(
  scope: string,
  layoutId: number | null,
): Promise<void> {
  const key = recoveryKey(scope, layoutId);
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).delete(key);

      transaction.oncomplete = () => resolve();

      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Recovery delete failed"));
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Recovery delete aborted"));
      };
    });
  } finally {
    db.close();
  }
}
