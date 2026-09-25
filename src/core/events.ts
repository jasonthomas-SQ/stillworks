// Typed event emitter. Systems talk to each other through this rather than
// holding references to one another; game.ts is the only place they meet.

type Handler<T> = (payload: T) => void;

export class Emitter<EventMap extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  /** Returns an unsubscribe function. */
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => {
      this.handlers.get(event)?.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) (handler as Handler<EventMap[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type GameEvents = {
  footstep: { inWater: boolean; speed: number };
  zoneChanged: { zone: string | null };
};
