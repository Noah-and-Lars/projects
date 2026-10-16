// requestAnimationFrame loop with a clamped delta time.

export interface FrameInfo {
  /** Seconds since the previous frame, clamped so a tab switch can't explode physics. */
  dt: number;
  /** Seconds since the loop started. */
  time: number;
  frame: number;
}

export function startLoop(tick: (f: FrameInfo) => void): () => void {
  let last = performance.now();
  const start = last;
  let frame = 0;
  let handle = 0;
  const step = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    tick({ dt, time: (now - start) / 1000, frame: frame++ });
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);
  return () => cancelAnimationFrame(handle);
}
