import { VIEW_W } from './constants';

/**
 * Touch is a first-class input here, not a mouse emulation: phones have no
 * hover, no right button and no keyboard, so the run needs sticks and buttons
 * drawn into the frame.
 *
 * Layout follows the twin-stick convention players already know from Soul
 * Knight - move on the left thumb, aim-and-fire on the right - with the
 * one-shot actions as buttons above the right stick.
 */

export type TouchAction = 'dash' | 'interact' | 'melee' | 'reload' | 'swap' | 'ability' | 'ultimate' | 'pause';

interface Stick {
  /** Identifier of the touch driving this stick, or null when released. */
  id: number | null;
  originX: number;
  originY: number;
  curX: number;
  curY: number;
  /** How far the touch has travelled - a tap that never moves still fires. */
  moved: boolean;
}

export interface TouchButton {
  action: TouchAction;
  label: string;
  x: number;
  y: number;
  r: number;
  color: string;
}

const STICK_RADIUS = 78;
const STICK_DEAD_ZONE = 0.18;
/** Invisible padding around each button, in frame units. */
const TOUCH_SLOP = 18;

/** True for anything that reports a touchscreen, which is what decides whether the pads are drawn at all. */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0)
  );
}

export class TouchControls {
  /** Set once a real touch lands, so a desktop with a touchscreen doesn't get pads until used. */
  active = false;
  private move: Stick = { id: null, originX: 0, originY: 0, curX: 0, curY: 0, moved: false };
  private aim: Stick = { id: null, originX: 0, originY: 0, curX: 0, curY: 0, moved: false };
  private buttonTouches = new Map<number, TouchAction>();
  private pressed = new Set<TouchAction>();
  private held = new Set<TouchAction>();
  /** Taps outside the pads, forwarded to the menu screens as clicks. */
  pendingTap: { x: number; y: number } | null = null;

  private canvas: HTMLCanvasElement;
  private isPlaying: () => boolean;

  constructor(canvas: HTMLCanvasElement, isPlaying: () => boolean) {
    this.canvas = canvas;
    this.isPlaying = isPlaying;
    const opts = { passive: false } as AddEventListenerOptions;
    canvas.addEventListener('touchstart', (e) => this.onStart(e), opts);
    canvas.addEventListener('touchmove', (e) => this.onMove(e), opts);
    canvas.addEventListener('touchend', (e) => this.onEnd(e), opts);
    canvas.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
  }

  /** Canvas-space coordinates for a touch, matching how the mouse is mapped. */
  private toCanvas(t: Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (t.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (t.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  /**
   * The pad has to share the frame with the HUD: the weapon card owns the
   * bottom-right corner, the minimap and zombie counter own the top-right, and
   * the points readout owns the bottom-left. The cluster sits in the clear band
   * between them, arced so the right thumb can reach every button without
   * covering the aim stick below it.
   */
  buttons(): TouchButton[] {
    return [
      { action: 'interact', label: 'USE', x: 1198, y: 432, r: 40, color: '#ffd23d' },
      { action: 'dash', label: 'DASH', x: 1096, y: 506, r: 38, color: '#5fb8ff' },
      { action: 'melee', label: 'HIT', x: 1204, y: 550, r: 34, color: '#ff8a7a' },
      { action: 'reload', label: 'RELD', x: 1090, y: 396, r: 30, color: '#c3ccd8' },
      { action: 'ability', label: 'ABIL', x: 1214, y: 324, r: 34, color: '#a24ddc' },
      { action: 'ultimate', label: 'ULT', x: 1110, y: 292, r: 30, color: '#ff5b4a' },
      { action: 'swap', label: 'SWAP', x: 1006, y: 342, r: 28, color: '#6ee7d5' },
      { action: 'pause', label: '❚❚', x: 274, y: 38, r: 28, color: '#8d97a5' },
    ];
  }

  /**
   * Buttons take a generous invisible margin so they clear the 44pt touch
   * guideline once the 1280x720 frame is scaled down to a phone, and the
   * closest one wins - with that much slop the margins overlap, and a thumb
   * between two buttons should get the one it is nearest rather than whichever
   * happens to be first in the list.
   */
  private hitButton(x: number, y: number): TouchAction | null {
    let best: TouchAction | null = null;
    let bestDist = Infinity;
    for (const b of this.buttons()) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r + TOUCH_SLOP && d < bestDist) {
        bestDist = d;
        best = b.action;
      }
    }
    return best;
  }

  private onStart(e: TouchEvent) {
    e.preventDefault();
    this.active = true;
    for (const t of Array.from(e.changedTouches)) {
      const p = this.toCanvas(t);
      if (!this.isPlaying()) {
        // menus are canvas-drawn, so a tap just becomes a click
        this.pendingTap = p;
        continue;
      }
      const btn = this.hitButton(p.x, p.y);
      if (btn) {
        this.buttonTouches.set(t.identifier, btn);
        this.pressed.add(btn);
        this.held.add(btn);
        continue;
      }
      // Both sticks float: they spawn wherever the thumb lands, so there is no
      // fixed pad to find by feel.
      const stick = p.x < VIEW_W / 2 ? this.move : this.aim;
      if (stick.id !== null) continue;
      stick.id = t.identifier;
      stick.originX = p.x;
      stick.originY = p.y;
      stick.curX = p.x;
      stick.curY = p.y;
      stick.moved = false;
    }
  }

  private onMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const p = this.toCanvas(t);
      for (const stick of [this.move, this.aim]) {
        if (stick.id !== t.identifier) continue;
        stick.curX = p.x;
        stick.curY = p.y;
        if (Math.hypot(p.x - stick.originX, p.y - stick.originY) > 12) stick.moved = true;
      }
    }
  }

  private onEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const btn = this.buttonTouches.get(t.identifier);
      if (btn) {
        this.buttonTouches.delete(t.identifier);
        this.held.delete(btn);
      }
      for (const stick of [this.move, this.aim]) {
        if (stick.id === t.identifier) stick.id = null;
      }
    }
  }

  private vector(stick: Stick): { x: number; y: number; mag: number } {
    if (stick.id === null) return { x: 0, y: 0, mag: 0 };
    const dx = stick.curX - stick.originX;
    const dy = stick.curY - stick.originY;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return { x: 0, y: 0, mag: 0 };
    const mag = Math.min(1, dist / STICK_RADIUS);
    return { x: dx / dist, y: dy / dist, mag: mag < STICK_DEAD_ZONE ? 0 : mag };
  }

  /** Movement vector, already scaled by how far the thumb is pushed. */
  moveVector(): { x: number; y: number } {
    const v = this.vector(this.move);
    return { x: v.x * v.mag, y: v.y * v.mag };
  }

  /** Aim direction, or null when the right thumb is down but not pushed. */
  aimAngle(): number | null {
    const v = this.vector(this.aim);
    if (v.mag <= 0) return null;
    return Math.atan2(v.y, v.x);
  }

  /** Holding the right side fires - pushing it aims, tapping it shoots where you already face. */
  fireHeld(): boolean {
    return this.aim.id !== null;
  }

  wasPressed(action: TouchAction): boolean {
    return this.pressed.has(action);
  }

  isHeld(action: TouchAction): boolean {
    return this.held.has(action);
  }

  takeTap(): { x: number; y: number } | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    return tap;
  }

  endFrame() {
    this.pressed.clear();
  }

  /** Called when a run ends so a held stick doesn't leak into the menus. */
  reset() {
    this.move.id = null;
    this.aim.id = null;
    this.buttonTouches.clear();
    this.pressed.clear();
    this.held.clear();
  }

  // ---------------- drawing ----------------

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    ctx.save();
    this.drawStick(ctx, this.move, '#3ddc73');
    this.drawStick(ctx, this.aim, '#ff5b4a');
    for (const b of this.buttons()) {
      const down = this.held.has(b.action);
      ctx.globalAlpha = down ? 0.95 : 0.5;
      ctx.fillStyle = down ? b.color : 'rgba(20,16,12,0.72)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = down ? 1 : 0.85;
      ctx.fillStyle = down ? '#0a0c10' : b.color;
      ctx.font = `bold ${b.r < 30 ? 10 : 11}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x, b.y + 4);
    }
    ctx.restore();
  }

  private drawStick(ctx: CanvasRenderingContext2D, stick: Stick, color: string) {
    if (stick.id === null) return;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#0a0c10';
    ctx.beginPath();
    ctx.arc(stick.originX, stick.originY, STICK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const v = this.vector(stick);
    const knobX = stick.originX + v.x * v.mag * STICK_RADIUS;
    const knobY = stick.originY + v.y * v.mag * STICK_RADIUS;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(knobX, knobY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
