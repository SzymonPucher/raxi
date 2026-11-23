export interface LoopCallbacks {
  fixedUpdate(dt: number, realDt: number): void;
  render(alpha: number, realDt: number): void;
}

/**
 * Fixed timestep game loop (60 Hz) with render interpolation and bullet-time scale.
 */
export class Loop {
  public readonly fixedDt = 1 / 60;
  public readonly maxStepsPerFrame = 5;
  public timeScale = 1.0;

  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  public fps = 60;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);

      const rawDt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      this.fpsAccumulator += rawDt;
      this.fpsFrames++;
      if (this.fpsAccumulator >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsAccumulator);
        this.fpsAccumulator = 0;
        this.fpsFrames = 0;
      }

      this.accumulator += rawDt;
      let steps = 0;
      while (this.accumulator >= this.fixedDt && steps < this.maxStepsPerFrame) {
        this.callbacks.fixedUpdate(this.fixedDt * this.timeScale, this.fixedDt);
        this.accumulator -= this.fixedDt;
        steps++;
      }
      if (steps >= this.maxStepsPerFrame) {
        this.accumulator = 0;
      }

      const alpha = this.accumulator / this.fixedDt;
      this.callbacks.render(alpha, rawDt);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}
