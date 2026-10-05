// Throttled sender for ephemeral messages (drag previews, pointers).
// Supabase's free tier allows ~100 realtime messages/s per project, counting each delivery, so the send rate
// shrinks as more people are online: hz = clamp(floor(35 / online), 3, 10).

export const budgetHz = (online: number) => Math.max(3, Math.min(10, Math.floor(35 / Math.max(1, online))));

export class EphemeralBus {
  private slots = new Map<string, { event: string; payload: unknown }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sentWindow: number[] = [];
  paused = false;

  constructor(
    private send: (event: string, payload: unknown) => void,
    private online: () => number,
    private now: () => number = () => Date.now(),
  ) {}

  /** Latest value per key wins; values are sent at most once per tick. */
  put(key: string, event: string, payload: unknown) {
    this.slots.set(key, { event, payload });
    if (!this.timer && !this.paused) this.timer = setTimeout(() => this.flush(), 1000 / budgetHz(this.online()));
  }

  /** One-shot messages (pings, sync view) bypass the throttle. */
  immediate(event: string, payload: unknown) {
    this.count();
    this.send(event, payload);
  }

  drop(key: string) {
    this.slots.delete(key);
  }

  flush() {
    this.timer = null;
    if (this.paused) return;
    for (const { event, payload } of this.slots.values()) {
      this.count();
      this.send(event, payload);
    }
    this.slots.clear();
  }

  /** Estimated deliveries per second over the last second (sends × people online). */
  rate(): number {
    const t = this.now();
    this.sentWindow = this.sentWindow.filter((x) => t - x < 1000);
    return this.sentWindow.length * Math.max(1, this.online());
  }

  private count() {
    this.sentWindow.push(this.now());
    if (this.sentWindow.length > 200) this.sentWindow.splice(0, 100);
    if (import.meta.env?.DEV && this.rate() > 60) console.warn('[realtime] high message rate', this.rate());
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.slots.clear();
  }
}
