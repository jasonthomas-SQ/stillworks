// The in-game stats overlay. This is the profiling method for the whole
// project: I cannot open DevTools, so every milestone's budget is measured
// here. Toggled with backtick, hidden by default.

import type * as THREE from 'three';
import { CONFIG } from '../../config';

const SAMPLES = 120;

export class StatsOverlay {
  private readonly el: HTMLDivElement;
  private readonly frames: number[] = [];
  private last = performance.now();
  private visible = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'padding:8px 10px',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#D7DCD6',
      'background:rgba(22,34,42,0.82)',
      'border-radius:6px',
      'white-space:pre',
      'pointer-events:none',
      'display:none',
      'z-index:10',
    ].join(';');
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  sample(
    renderer: THREE.WebGLRenderer,
    extra: Record<string, string | number> = {},
  ): void {
    const now = performance.now();
    this.frames.push(now - this.last);
    this.last = now;
    if (this.frames.length > SAMPLES) this.frames.shift();
    if (!this.visible) return;

    const sorted = [...this.frames].sort((a, b) => a - b);
    const p = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

    const calls = renderer.info.render.calls;
    const tris = renderer.info.render.triangles;
    const budgetCalls = CONFIG.budget.drawCallsM1;
    const budgetTris = CONFIG.budget.trianglesM1;

    const mark = (value: number, ceiling: number): string =>
      value <= ceiling ? 'ok ' : 'OVER';

    const lines = [
      `draw calls  ${String(calls).padStart(6)} / ${budgetCalls}   ${mark(calls, budgetCalls)}`,
      `triangles   ${String(tris).padStart(6)} / ${budgetTris}  ${mark(tris, budgetTris)}`,
      `frame ms    p50 ${p(0.5).toFixed(1)}  p95 ${p(0.95).toFixed(1)}`,
      `dpr         ${renderer.getPixelRatio().toFixed(2)} (cap ${CONFIG.render.dprCap})`,
      `programs    ${renderer.info.programs?.length ?? 0}`,
    ];
    for (const [k, v] of Object.entries(extra)) {
      lines.push(`${k.padEnd(12)}${v}`);
    }

    this.el.textContent = lines.join('\n');
  }

  dispose(): void {
    this.el.remove();
  }
}
