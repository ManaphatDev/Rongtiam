// Adding things to the table (ported from legacy addMaps/addChars/addToLib/placeSticker), now uploading images
// once and creating items through the op queue.
import { aabb, clamp } from '../lib/geometry';
import { uuid } from '../lib/rand';
import { COLORS } from '../lib/profile';
import type { RoomStore } from '../sync/room.svelte';
import type { ItemRow } from '../sync/types';
import { isImg, MAX, processImage } from './images';
import type { Stage } from './Stage';
import type { Ui } from './ui.svelte';

type Pos = { x: number; y: number };
let nextColor = 0;

export class TableActions {
  constructor(private store: RoomStore, private stage: Stage, private ui: Ui) {}

  private gridSize() {
    return this.store.settings.grid.size;
  }

  private jitter(i: number) {
    return { x: i * this.gridSize() * 0.7, y: i * this.gridSize() * 0.25 };
  }

  private fail(title: string, e: unknown) {
    this.ui.showToast(title, undefined, (e as Error)?.message ?? '');
  }

  private maps() {
    return this.store.state.all().filter((i) => i.kind === 'map');
  }

  /** Routes dropped/pasted images by the open tab, like the original app. */
  routeFiles(files: File[], pos?: Pos) {
    const imgs = files.filter(isImg);
    if (!imgs.length) return;
    if (this.ui.tab === 'map' && this.store.isGM) void this.addMaps(imgs, pos);
    else if (this.ui.tab === 'chars') void this.addChars(imgs, '', pos);
    else void this.addToLib(imgs, true, pos);
  }

  async addMaps(files: File[], pos?: Pos) {
    if (!this.store.isGM) return;
    let prev: ItemRow | null = null;
    let i = 0;
    for (const f of files.filter(isImg)) {
      try {
        this.ui.showToast('กำลังอัปโหลดแมพ…', f.name);
        const p = await processImage(f, { max: MAX.map, type: 'image/jpeg', quality: 0.88, bg: '#ffffff' });
        await this.store.storeImage(p, 'map');
        const existing = this.maps();
        const first = existing.length === 0;
        const sel = this.stage.selected();
        const ref = prev ?? (sel?.kind === 'map' ? sel : existing[existing.length - 1]);
        let size = p.w, x = 0, y = 0;
        if (ref) {
          // Same scale as the neighbour so tiles line up, placed to its right.
          size = p.w * ((ref.props.size as number) / ((ref.props.pw as number) || p.w));
          const rb = aabb({ kind: 'map', x: ref.props.x as number, y: ref.props.y as number, size: ref.props.size as number, aspect: ref.props.aspect as number, rot: ref.props.rot as number });
          x = rb.r + size / 2;
          y = ref.props.y as number;
        }
        if (pos && i === 0) ({ x, y } = pos);
        if (first) {
          const s = this.store.settings;
          void this.store.updateSettings({ ...s, grid: { ...s.grid, size: clamp(Math.round(size / 24), 30, 200) } });
        }
        const id = uuid();
        this.store.add({
          id, kind: 'map', z: this.store.topZ('map'),
          props: { img: p.file, pw: p.w, ph: p.h, aspect: p.h / p.w, x, y, size, rot: 0, flip: false, name: `แมพ ${existing.length + 1}` },
        });
        prev = this.store.item(id) ?? null;
        i++;
        this.ui.select(id);
        if (first) requestAnimationFrame(() => this.stage.fitView());
        else if (!this.stage.isOnScreen(id)) this.stage.centerOn(id);
        this.ui.toast = null;
      } catch (e) {
        this.fail('เพิ่มแมพไม่สำเร็จ', e);
      }
    }
  }

  async addChars(files: File[], typed: string, pos?: Pos) {
    let i = 0;
    for (const f of files.filter(isImg)) {
      try {
        const p = await processImage(f, { max: MAX.token, type: 'image/webp', quality: 0.9 });
        await this.store.storeImage(p, 'token');
        const base = pos ?? this.stage.viewCenter();
        const j = this.jitter(i);
        let name = typed.trim();
        if (!name || files.length > 1) {
          name = f.name.replace(/\.[^.]+$/, '').trim();
          if (!name || /^image$/i.test(name)) name = typed.trim() || 'ตัวละคร';
        }
        const id = uuid();
        this.store.add({
          id, kind: 'char', z: this.store.topZ('char'),
          props: {
            img: p.file, name: name.slice(0, 40), x: base.x + j.x, y: base.y + j.y, size: Math.round(this.gridSize() * 0.9),
            color: COLORS[nextColor++ % 8], zoom: 1, ox: 0, oy: 0, flip: false,
          },
        });
        this.ui.select(id);
        i++;
      } catch (e) {
        this.fail('เพิ่มรูปไม่สำเร็จ', e);
      }
    }
  }

  async addToLib(files: File[], place: boolean, pos?: Pos) {
    let i = 0;
    for (const f of files.filter(isImg)) {
      try {
        const p = await processImage(f, { max: MAX.sticker, type: 'image/webp', quality: 0.92 });
        await this.store.storeImage(p, 'sticker');
        if (place) this.placeSticker({ img: p.file }, pos ? { x: pos.x + this.jitter(i).x, y: pos.y } : undefined);
        i++;
      } catch (e) {
        this.fail('เพิ่มรูปไม่สำเร็จ', e);
      }
    }
  }

  placeSticker(src: { img?: string; emoji?: string }, pos?: Pos) {
    const c = pos ?? this.stage.viewCenter();
    const id = uuid();
    this.store.add({
      id, kind: 'sticker', z: this.store.topZ('sticker'),
      props: { ...(src.img ? { img: src.img } : { emoji: src.emoji }), x: c.x, y: c.y, size: Math.round(this.gridSize() * 1.2), rot: 0, flip: false },
    });
    this.ui.select(id);
  }

  async changeCharImage(id: string, f: File) {
    try {
      const p = await processImage(f, { max: MAX.token, type: 'image/webp', quality: 0.9 });
      await this.store.storeImage(p, 'token');
      this.store.patch(id, { props: { img: p.file, zoom: 1, ox: 0, oy: 0 } });
    } catch (e) {
      this.fail('เปลี่ยนรูปไม่สำเร็จ', e);
    }
  }

  duplicate(it: ItemRow) {
    const isMap = it.kind === 'map';
    const size = it.props.size as number;
    const id = uuid();
    const props = { ...it.props, x: (it.props.x as number) + size * (isMap ? 0.08 : 0.6), y: (it.props.y as number) + size * (isMap ? 0.08 : 0.3) };
    if (isMap) props.name = `${it.props.name ?? ''} (สำเนา)`;
    this.store.add({ id, kind: it.kind, z: isMap ? it.z + 0.5 : this.store.topZ(it.kind), props, meta: it.meta, locked: false, hidden: it.hidden });
    this.ui.select(id);
  }

  /** Swap stacking with the neighbouring map (dir -1 = back, +1 = forward). */
  moveMap(it: ItemRow, dir: -1 | 1) {
    const maps = this.maps().sort((a, b) => a.z - b.z);
    const i = maps.findIndex((m) => m.id === it.id);
    const other = maps[i + dir];
    if (!other) return;
    const za = it.z === other.z ? other.z + dir : other.z;
    this.store.patch(it.id, { z: za });
    this.store.patch(other.id, { z: it.z });
  }

  clearMaps() {
    for (const m of this.maps()) this.store.del(m.id);
    if (this.ui.selectedId && !this.store.item(this.ui.selectedId)) this.ui.select(null);
  }

  clearTable() {
    for (const it of this.store.state.all()) this.store.del(it.id);
    this.ui.select(null);
  }
}
