// Resolves asset file names to object URLs: memory → IndexedDB → storage download (each image fetched once).
import { getBlob, putBlob } from '../lib/idb';

export class AssetCache {
  private urls = new Map<string, string>();
  private loading = new Map<string, Promise<string>>();

  constructor(private roomId: string, private download: (file: string) => Promise<Blob>) {}

  peek(file: string): string | undefined {
    return this.urls.get(file);
  }

  url(file: string): Promise<string> {
    const hit = this.urls.get(file);
    if (hit) return Promise.resolve(hit);
    let p = this.loading.get(file);
    if (!p) {
      p = (async () => {
        const key = `${this.roomId}/${file}`;
        let blob = await getBlob(key);
        if (!blob) {
          blob = await this.download(file);
          void putBlob(key, blob);
        }
        return this.remember(file, blob);
      })();
      p.catch(() => this.loading.delete(file));
      this.loading.set(file, p);
    }
    return p;
  }

  /** Seed with a blob we just produced so it shows before the upload finishes. */
  put(file: string, blob: Blob): string {
    void putBlob(`${this.roomId}/${file}`, blob);
    return this.remember(file, blob);
  }

  private remember(file: string, blob: Blob) {
    const existing = this.urls.get(file);
    if (existing) return existing;
    const u = URL.createObjectURL(blob);
    this.urls.set(file, u);
    return u;
  }

  dispose() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.loading.clear();
  }
}
