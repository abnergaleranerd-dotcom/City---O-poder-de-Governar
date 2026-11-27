export interface ScheduledChannel {
  interval: number;
  elapsed: number;
}

/**
 * Staggers non-frame-critical updates (Utility AI needs, schedules, zoning checks,
 * statistics) across ticks so large citizen counts never stall frame time.
 */
export class SimulationScheduler {
  private channels = new Map<string, ScheduledChannel>();

  public register(name: string, intervalSeconds: number): void {
    this.channels.set(name, { interval: Math.max(0.05, intervalSeconds), elapsed: 0 });
  }

  public advance(dt: number): Set<string> {
    const due = new Set<string>();
    if (dt <= 0) return due;
    for (const [name, ch] of this.channels.entries()) {
      ch.elapsed += dt;
      if (ch.elapsed >= ch.interval) {
        ch.elapsed %= ch.interval;
        due.add(name);
      }
    }
    return due;
  }

  public reset(): void {
    for (const ch of this.channels.values()) {
      ch.elapsed = 0;
    }
  }
}

export function getBatchSlice<T>(items: T[], batchCursor: number, batchSize: number): {
  slice: T[];
  nextCursor: number;
} {
  if (items.length === 0) return { slice: [], nextCursor: 0 };
  const start = batchCursor % items.length;
  const count = Math.min(items.length, Math.max(1, batchSize));
  const slice: T[] = [];
  for (let i = 0; i < count; i++) {
    slice.push(items[(start + i) % items.length]);
  }
  return {
    slice,
    nextCursor: (start + count) % items.length,
  };
}
