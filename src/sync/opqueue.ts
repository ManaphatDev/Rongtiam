// Batches item ops for apply_ops: coalesces repeated patches to the same item, sends one batch at a time
// (so the server applies them in order), retries network failures and rolls back refused batches.

import { mergePatch, type RoomState } from './state';
import { FORBIDDEN, type ItemRow, type NewItem, type Op, type PatchFields } from './types';

interface Queued {
  op: Op;
  seq: number;
  due: number;
}

export interface SendError {
  code?: string;
  message?: string;
}

export interface OpQueueOptions {
  send: (ops: Op[]) => Promise<ItemRow[]>;
  onRejected?: (err: SendError, ids: string[]) => void;
  now?: () => number;
  /** Retry delays for network errors (ms). */
  backoff?: number[];
}

/** Errors that will fail again if retried: permission, validation, constraint and "not found". */
export const isPermanent = (e: SendError) =>
  !!e.code && (e.code === FORBIDDEN || /^(22|23|P0|42)/.test(e.code));

export class OpQueue {
  private queue: Queued[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly backoff: number[];

  constructor(private state: RoomState, private opts: OpQueueOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.backoff = opts.backoff ?? [500, 1000, 2000, 4000, 8000];
  }

  add(item: NewItem, delay = 0) {
    const seq = this.state.localAdd(item);
    this.push({ t: 'add', item }, seq, delay);
  }

  /** `delay` lets rapid changes (sliders, typing) collapse into one write. */
  patch(id: string, fields: PatchFields, delay = 0) {
    const seq = this.state.localPatch(id, fields);
    const due = this.now() + delay;
    // Fold into the latest queued op for this id if nothing else touches it afterwards.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (opId(q.op) !== id) continue;
      if (q.op.t === 'patch') {
        const { t: _t, id: _id, ...prev } = q.op;
        q.op = { t: 'patch', id, ...mergePatch(prev, fields) };
        q.seq = seq;
        q.due = Math.min(q.due, due);
        this.schedule();
        return;
      }
      if (q.op.t === 'add') {
        q.op = { t: 'add', item: foldIntoAdd(q.op.item, fields) };
        q.seq = seq;
        this.schedule();
        return;
      }
      break;
    }
    this.push({ t: 'patch', id, ...fields }, seq, delay);
  }

  del(id: string) {
    const seq = this.state.localDel(id);
    this.push({ t: 'del', id }, seq, 0);
  }

  /** Resolves once everything queued so far has been sent (used by tests and before navigation). */
  async drain() {
    while (this.queue.length || this.inflight) {
      if (this.inflight) await this.inflight;
      else await this.flush();
    }
  }

  private push(op: Op, seq: number, delay: number) {
    this.queue.push({ op, seq, due: this.now() + delay });
    this.schedule();
  }

  private schedule() {
    if (this.inflight || !this.queue.length) return;
    const due = Math.min(...this.queue.map((q) => q.due));
    const wait = Math.max(0, due - this.now());
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  private async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight || !this.queue.length) return;
    const batch = this.queue.splice(0, 200);
    this.inflight = this.sendBatch(batch);
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
      this.schedule();
    }
  }

  private async sendBatch(batch: Queued[]) {
    const ops = batch.map((b) => b.op);
    const sent = batch.map((b) => ({ id: opId(b.op), seq: b.seq, t: b.op.t }));
    for (let attempt = 0; ; attempt++) {
      try {
        const rows = await this.opts.send(ops);
        this.state.ack(sent, rows);
        return;
      } catch (err) {
        const e = (err ?? {}) as SendError;
        if (isPermanent(e) || attempt >= this.backoff.length) {
          const ids = [...new Set(sent.map((s) => s.id))];
          this.state.reject(ids);
          this.opts.onRejected?.(e, ids);
          return;
        }
        await new Promise((r) => setTimeout(r, this.backoff[attempt]));
      }
    }
  }
}

const opId = (op: Op) => (op.t === 'add' ? op.item.id : op.id);

function foldIntoAdd(item: NewItem, f: PatchFields): NewItem {
  const props = { ...item.props };
  if (f.props) {
    for (const [k, v] of Object.entries(f.props)) {
      if (v === null) delete props[k];
      else props[k] = v;
    }
  }
  const meta = { ...(item.meta ?? {}) };
  if (f.meta) for (const [ns, v] of Object.entries(f.meta)) meta[ns] = { ...(meta[ns] ?? {}), ...v };
  return {
    ...item,
    props,
    meta,
    z: f.z ?? item.z,
    locked: f.locked ?? item.locked,
    hidden: f.hidden ?? item.hidden,
  };
}
