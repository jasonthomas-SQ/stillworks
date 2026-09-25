// requestAnimationFrame loop. dt is clamped so a tab that was backgrounded, or a
// long GC pause, cannot teleport the hero through a cliff on the frame it returns.

const MAX_DT = 1 / 30;

export function startLoop(step: (dt: number) => void): () => void {
  let last = performance.now();
  let handle = 0;
  let stopped = false;

  const frame = (now: number): void => {
    if (stopped) return;
    handle = requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    step(dt);
  };

  const onVisibility = (): void => {
    if (!document.hidden) last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);

  handle = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
