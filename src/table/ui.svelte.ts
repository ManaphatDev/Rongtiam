// Per-viewer UI state (never synced).
export type Tool = 'select' | 'hand' | 'ping' | 'fog';
export type Tab = 'map' | 'fog' | 'chars' | 'stickers' | 'dice' | 'players';
export type FogTool = 'rect' | 'poly' | 'brush' | 'pick';
export type FogMode = 'add' | 'cut';

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
  /** The character sheet open in the sheet panel. */
  sheetOpen = $state<string | null>(null);
  /** Initiative tracker expanded. */
  initOpen = $state(false);
  /** GM: the custom ruleset's template editor. */
  templateOpen = $state(false);
  /** The ruleset's character builder is open over the table. */
  builderOpen = $state(false);
  tab = $state<Tab>('map');
  tool = $state<Tool>('select');
  sideHidden = $state(false);
  toolsHidden = $state(false);
  /** Map edge snapping while dragging (a personal preference). */
  snap = $state(load('pref:snap', true));
  /** Fog drawing: which shape tool, whether it adds or cuts fog, and the brush width in world units. */
  fogTool = $state<FogTool>('rect');
  fogMode = $state<FogMode>('add');
  brushWidth = $state(load('pref:brush', 90));
  /** Local undo depth of the fog tool (the stack itself lives in FogTool). */
  fogUndo = $state(0);
  /** GM preview of what players see: opaque fog and no hidden items. */
  playerView = $state(false);
  toast = $state.raw<{ t1?: string; t2?: string | number; t3?: string; id: number } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  select(id: string | null) {
    this.selectedId = id;
  }

  setSnap(v: boolean) {
    this.snap = v;
    store('pref:snap', v);
  }

  setBrush(v: number) {
    this.brushWidth = v;
    store('pref:brush', v);
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
