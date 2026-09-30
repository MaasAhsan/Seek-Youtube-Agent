/* Seek — animated monochrome ASCII field.
 * A slow, drifting density map rendered as characters on a <canvas>.
 * Shared by the in-page panel and the toolbar popup. */
(() => {
  const NS = (globalThis.YTA = globalThis.YTA || {});

  // Sparse -> dense. Index 0 is blank.
  const RAMP = ' .,:;+x*#%@';
  const LEVELS = RAMP.length - 1;

  const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

  // Deterministic per-cell noise so the texture has grain but doesn't flicker.
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  class AsciiField {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {() => string} getRgb  returns "r,g,b" for the current theme
     * @param {{cellW?:number, cellH?:number, maxAlpha?:number, speed?:number, fps?:number}} [opts]
     */
    constructor(canvas, getRgb, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.getRgb = getRgb;
      this.cw = opts.cellW || 9;
      this.ch = opts.cellH || 14;
      this.maxAlpha = opts.maxAlpha ?? 0.2;
      this.speed = opts.speed ?? 1.5;
      this.frameMs = 1000 / (opts.fps || 20);
      this.t = Math.random() * 50;
      this.last = 0;
      this.raf = 0;
      this.running = false;
      this.w = 1;
      this.h = 1;
      this.cols = 0;
      this.rows = 0;
      this.levels = new Uint8Array(0);
      this.reduced = !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.tick = this.tick.bind(this);
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
      this.resize();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      this.w = Math.max(1, Math.round(rect.width));
      this.h = Math.max(1, Math.round(rect.height));
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cols = Math.ceil(this.w / this.cw);
      this.rows = Math.ceil(this.h / this.ch);
      this.levels = new Uint8Array(this.cols * this.rows);
      this.draw();
    }

    // Density in 0..1 for a cell at time t. Domain-warped sines give soft,
    // cloud-like clusters that slowly morph instead of scrolling in a line.
    density(col, row, t) {
      const x = col * 0.0585;
      const y = row * 0.091;
      const a = Math.sin(x * 1.2 + t * 0.42 + Math.sin(y * 1.6 - t * 0.27) * 1.7);
      const b = Math.sin(y * 1.05 - t * 0.33 + Math.cos(x * 1.4 + t * 0.21) * 1.5);
      const c = Math.sin((x + y) * 0.8 + t * 0.25 + Math.sin(x * 2.1 - y * 1.3 + t * 0.3) * 0.8);
      const v = (a + b + c) / 3 * 0.5 + 0.5;
      return clamp01((v - 0.32) / 0.42);
    }

    draw() {
      const { ctx, cols, rows, levels } = this;
      ctx.clearRect(0, 0, this.w, this.h);
      if (!cols || !rows) return;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const grain = (hash(c, r) - 0.5) * 0.09;
          const v = clamp01(this.density(c, r, this.t) + grain);
          levels[r * cols + c] = Math.floor(v * LEVELS);
        }
      }

      const rgb = this.getRgb();
      ctx.font = `${this.ch - 3}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
      ctx.textBaseline = 'top';

      // One pass per density level so fillStyle is set only LEVELS times per frame.
      for (let lv = 1; lv <= LEVELS; lv++) {
        const alpha = 0.03 + Math.pow(lv / LEVELS, 1.3) * this.maxAlpha;
        ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        const ch = RAMP[lv];
        for (let i = 0; i < levels.length; i++) {
          if (levels[i] !== lv) continue;
          ctx.fillText(ch, (i % cols) * this.cw, Math.floor(i / cols) * this.ch);
        }
      }
    }

    tick(now) {
      if (!this.running) return;
      this.raf = requestAnimationFrame(this.tick);
      const elapsed = now - this.last;
      if (elapsed < this.frameMs) return;
      this.last = now;
      this.t += Math.min(elapsed, 200) / 1000 * this.speed;
      this.draw();
    }

    start() {
      if (this.running) return;
      if (this.reduced) {
        // Respect the OS "reduce motion" setting: render one still frame.
        this.draw();
        return;
      }
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    clear() {
      this.ctx.clearRect(0, 0, this.w, this.h);
    }

    destroy() {
      this.stop();
      this.ro.disconnect();
    }
  }

  NS.AsciiField = AsciiField;
})();
