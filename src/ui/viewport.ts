import { fileIdOf, type PixelDoc } from '../engine/document';
import { clamp } from '../engine/math';

export const ZOOM_LEVELS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Canvas camera: zoom and pan in CSS pixels, per document. Device pixel ratio is handled by
 * rounding the on-screen pixel size so every art pixel covers a whole number of device pixels.
 */
class Viewport {
  zoom = 16;
  panX = 0;
  panY = 0;
  width = 0;
  height = 0;
  private gapRatio = 0;
  private left = 0;
  private top = 0;
  private windowW = 0;
  private windowH = 0;
  dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  private docId: string | null = null;
  /** The shown board's file and place in it: the camera follows the file, not the board. */
  private place: { file: string; x: number; y: number } | null = null;
  /** Each file's camera: the zoom, and where the file's (0, 0) was, in CSS px. */
  private saved = new Map<string, View>();
  /** Width hidden by the floating side panels at each edge, measured by the canvas view. */
  covered: () => { left: number; right: number } = () => ({ left: 0, right: 0 });
  /** Document waiting for the first layout to be fitted. */
  private pendingFit: PixelDoc | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Size of one art pixel on screen, in device pixels (the zoom). */
  get pixel(): number {
    return Math.max(1, Math.round(this.zoom * this.dpr));
  }

  /** Render gap between art pixels on screen, in device pixels (0 when not previewed). */
  get gap(): number {
    return this.gapRatio > 0 ? Math.max(1, Math.round(this.pixel * this.gapRatio)) : 0;
  }

  /**
   * Distance between two art pixels, in device pixels: pixel + gap. The gap spreads pixels
   * apart instead of shrinking them, like in the exported file.
   */
  get scale(): number {
    return this.pixel + this.gap;
  }

  /** Step between art pixels in CSS pixels, for pan and zoom math. */
  get effectiveZoom(): number {
    return this.scale / this.dpr;
  }

  /** Zoom shown to the user: the size of one art pixel, in CSS pixels. */
  get pixelZoom(): number {
    return this.pixel / this.dpr;
  }

  /** How much the gap stretches the step (1 without gap), for continuous gestures. */
  get stepFactor(): number {
    return 1 + this.gapRatio;
  }

  /**
   * Gap preview as a fraction of the pixel size (render gap / pixel size, 0 to hide it).
   * The drawing grows or shrinks around its center.
   */
  setGapRatio(ratio: number, docWidth: number, docHeight: number): void {
    if (ratio === this.gapRatio) return;
    const before = this.effectiveZoom;
    this.gapRatio = ratio;
    const after = this.effectiveZoom;
    this.panX += (docWidth * (before - after)) / 2;
    this.panY += (docHeight * (before - after)) / 2;
    this.emit();
  }

  get originX(): number {
    return Math.round(this.panX * this.dpr);
  }

  get originY(): number {
    return Math.round(this.panY * this.dpr);
  }

  /** Converts a position relative to the canvas element (CSS px) to an art pixel. */
  toPixel(x: number, y: number): { x: number; y: number } {
    const s = this.scale;
    return {
      x: Math.floor((x * this.dpr - this.originX) / s),
      y: Math.floor((y * this.dpr - this.originY) / s),
    };
  }

  /**
   * `left`/`top` are the workspace position in the window. Panels shown, hidden or resized never
   * move the drawing on screen; resizing the window keeps it in place relative to the window center.
   */
  setSize(width: number, height: number, left = 0, top = 0): void {
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;
    if (this.width !== 0) {
      this.panX += this.left - left + (windowW - this.windowW) / 2;
      this.panY += this.top - top + (windowH - this.windowH) / 2;
    }
    this.width = width;
    this.height = height;
    this.left = left;
    this.top = top;
    this.windowW = windowW;
    this.windowH = windowH;
    this.dpr = window.devicePixelRatio || 1;
    if (this.pendingFit && width > 0) {
      const doc = this.pendingFit;
      this.pendingFit = null;
      this.fit(doc);
      return;
    }
    this.emit();
  }

  private insets() {
    const small = this.width < 600;
    return { x: small ? 24 : 64, top: small ? 76 : 44, bottom: small ? 72 : 84 };
  }

  fit(doc: PixelDoc): void {
    if (!this.width) {
      this.pendingFit = doc;
      return;
    }
    const { x, top, bottom } = this.insets();
    const covered = this.covered();
    const free = this.width - covered.left - covered.right;
    let z = 1;
    for (const level of ZOOM_LEVELS)
      if (
        doc.width * level * this.stepFactor <= free - x &&
        doc.height * level * this.stepFactor <= this.height - top - bottom
      )
        z = level;
    this.zoom = z;
    const ez = this.effectiveZoom;
    this.panX = Math.round(covered.left + (free - doc.width * ez) / 2);
    this.panY = Math.round(top + (this.height - top - bottom - doc.height * ez) / 2);
    this.emit();
  }

  /** Zooms keeping the point (cx, cy) fixed on screen. Defaults to the center. */
  zoomTo(zoom: number, cx = this.width / 2, cy = this.height / 2): void {
    const before = this.effectiveZoom;
    const px = (cx - this.panX) / before;
    const py = (cy - this.panY) / before;
    this.zoom = clamp(zoom, 1, 96);
    const after = this.effectiveZoom;
    this.panX = cx - px * after;
    this.panY = cy - py * after;
    this.emit();
  }

  /**
   * One zoom level in or out, from the level being reached if a step is still animating (quick
   * wheel notches add up), gliding there in a short ease unless `animate` is false.
   */
  step(direction: 1 | -1, cx?: number, cy?: number, animate = true): void {
    const z = this.glide?.to ?? this.zoom;
    const next =
      (direction > 0
        ? ZOOM_LEVELS.find((v) => v > z + 0.001)
        : [...ZOOM_LEVELS].reverse().find((v) => v < z - 0.001)) ?? (direction > 0 ? 96 : 1);
    if (animate) this.glideTo(next, cx, cy);
    else {
      this.stopGlide();
      this.zoomTo(next, cx, cy);
    }
  }

  /** A zoom gliding to a level: where to, and the frame that moves it. */
  private glide: { to: number; frame: number } | null = null;

  private stopGlide(): void {
    if (this.glide) cancelAnimationFrame(this.glide.frame);
    this.glide = null;
  }

  /** Zooms to `zoom` in about 120 ms, keeping (cx, cy) fixed, easing out. */
  glideTo(zoom: number, cx = this.width / 2, cy = this.height / 2, ms = 120): void {
    this.stopGlide();
    const from = this.zoom;
    const to = clamp(zoom, 1, 96);
    // Through the zoom's logarithm, so zooming in and out feel the same.
    const a = Math.log(from);
    const b = Math.log(to);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      this.zoomTo(t >= 1 ? to : Math.exp(a + (b - a) * eased), cx, cy);
      if (t < 1 && this.glide) this.glide.frame = requestAnimationFrame(tick);
      else this.glide = null;
    };
    this.glide = { to, frame: requestAnimationFrame(tick) };
  }

  /**
   * A continuous zoom by a factor (a pinch on a trackpad), keeping (cx, cy) fixed. Call `settle`
   * when the gesture ends to land on a whole zoom, where pixels are crisp.
   */
  zoomBy(factor: number, cx: number, cy: number): void {
    this.stopGlide();
    this.zoomTo(this.zoom * factor, cx, cy);
  }

  /** The part of the drawing in view (not under the side panels), in art pixels. */
  visibleArea(): { x0: number; y0: number; x1: number; y1: number } {
    const ez = this.effectiveZoom;
    const c = this.covered();
    return {
      x0: (c.left - this.panX) / ez,
      y0: (0 - this.panY) / ez,
      x1: (this.width - c.right - this.panX) / ez,
      y1: (this.height - this.panY) / ez,
    };
  }

  /** Brings the art point (x, y) to the middle of the free part of the workspace. */
  centerOn(x: number, y: number): void {
    const ez = this.effectiveZoom;
    const c = this.covered();
    this.panX = Math.round(c.left + (this.width - c.left - c.right) / 2 - x * ez);
    this.panY = Math.round(this.height / 2 - y * ez);
    this.emit();
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.emit();
  }

  /** Continuous zoom (pinch). Call `settle` when the gesture ends to snap to a whole zoom. */
  set(view: View): void {
    Object.assign(this, view);
    this.emit();
  }

  settle(cx: number, cy: number, animate = false): void {
    const whole = Math.max(1, Math.round(this.zoom));
    if (whole === this.zoom) return;
    if (animate) this.glideTo(whole, cx, cy, 100);
    else this.zoomTo(whole, cx, cy);
  }

  /**
   * Shows a board, the camera remembered per file. `originX/Y` stay the shown board's (0, 0), so
   * everything drawn and clicked keeps working in its pixels; going to another board of the same
   * file, or moving the board, shifts them by the board's move so the file stays still on screen.
   */
  showDocument(doc: PixelDoc): void {
    const file = fileIdOf(doc);
    const x = doc.board?.x ?? 0;
    const y = doc.board?.y ?? 0;
    const was = this.place;
    if (this.docId === doc.id && was && was.x === x && was.y === y) return;
    const ez = this.effectiveZoom;
    if (was?.file === file) {
      this.docId = doc.id;
      this.place = { file, x, y };
      this.panBy((x - was.x) * ez, (y - was.y) * ez);
      return;
    }
    if (was)
      this.saved.set(was.file, {
        zoom: this.zoom,
        panX: this.panX - was.x * ez,
        panY: this.panY - was.y * ez,
      });
    this.docId = doc.id;
    this.place = { file, x, y };
    const view = this.saved.get(file);
    if (!view) return this.fit(doc);
    this.zoom = view.zoom;
    const z = this.effectiveZoom;
    this.set({ zoom: view.zoom, panX: view.panX + x * z, panY: view.panY + y * z });
  }
}

export const viewport = new Viewport();
