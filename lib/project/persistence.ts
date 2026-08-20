import { migrateProject, projectToPersistentValue } from "./migration";
import type { ProjectV2 } from "./types";

const DATABASE_NAME = "camee-projects";
const STORE_NAME = "projects";
const CURRENT_PROJECT_KEY = "current-project";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("このブラウザではIndexedDBを使用できません。"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("保存領域を開けませんでした。"));
  });
}

export async function readCurrentProject() {
  const database = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_PROJECT_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("保存データを読み込めませんでした。"));
    });
    return value === undefined ? null : migrateProject(value);
  } finally {
    database.close();
  }
}

export async function writeCurrentProject(project: ProjectV2) {
  const database = await openDatabase();
  try {
    const safeProject = projectToPersistentValue(project);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(safeProject, CURRENT_PROJECT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存できませんでした。"));
      transaction.onabort = () => reject(transaction.error ?? new Error("保存が中断されました。"));
    });
  } finally {
    database.close();
  }
}
