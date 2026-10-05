// Per-viewer UI state (never synced).
export type Tool = 'select' | 'hand' | 'ping';
export type Tab = 'map' | 'chars' | 'stickers' | 'dice' | 'players';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // ignore (private mode / quota)
  }
}

export class Ui {
  selectedId = $state<string | null>(null);
  tab = $state<Tab>('map');
  tool = $state<Tool>('select');
  sideHidden = $state(false);
  toolsHidden = $state(false);
  /** Map edge snapping while dragging (a personal preference). */
  snap = $state(load('pref:snap', true));
  toast = $state.raw<{ t1?: string; t2?: string | number; t3?: string; id: number } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  select(id: string | null) {
    this.selectedId = id;
  }

  setSnap(v: boolean) {
    this.snap = v;
    store('pref:snap', v);
  }

  showToast(t1?: string, t2?: string | number, t3?: string) {
    this.toast = { t1, t2, t3, id: Date.now() };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 4500);
  }

  toggleAll() {
    const allHidden = this.sideHidden && this.toolsHidden;
    this.sideHidden = !allHidden;
    this.toolsHidden = !allHidden;
  }
}

export const prefs = { load, store };
