// Tiny IndexedDB blob cache (images by `<room>/<file>`). Every call tolerates IndexedDB being unavailable.

const DB = 'tok-cache-v1';
const STORE = 'blobs';
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return opening;
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  try {
    const db = await open();
    return await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result as Blob | undefined);
      q.onerror = () => rej(q.error);
    });
  } catch {
    return undefined;
  }
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // Cache only; ignore quota/private-mode failures.
  }
}
