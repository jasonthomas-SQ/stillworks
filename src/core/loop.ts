// requestAnimationFrame loop. dt is clamped so a tab that was backgrounded, or a
// long GC pause, cannot teleport the hero through a cliff on the frame it returns.

const MAX_DT = 1 / 30;

export type LoopOptions = {
  /** Keep stepping while the tab is hidden. Set by ?debug=1. */
  ignoreHidden?: boolean;
};

export function startLoop(step: (dt: number) => void, opts: LoopOptions = {}): () => void {
  let last = performance.now();
  let handle = 0;
  let stopped = false;

  // Draw one frame immediately, before any visibility check can skip it.
  //
  // Without this, opening the link in a background tab left the canvas blank:
  // the loop paused before it had ever rendered, so there was nothing to show
  // when the tab came forward. Pausing an already-drawn scene is the intent;
  // never drawing one is not.
  step(0);

  const frame = (now: number): void => {
    if (stopped) return;
    handle = requestAnimationFrame(frame);
    if (document.hidden && !opts.ignoreHidden) {
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
