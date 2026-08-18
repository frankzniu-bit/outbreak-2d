/**
 * Icons for the touch pad, drawn as chunky shapes rather than glyphs or text.
 *
 * The pad is the whole interface on a phone: a label like "RELD" means nothing
 * mid-fight, and a thumb covers it anyway. These read as silhouettes at a
 * glance the way an action-game button should, and they scale with the button
 * so the same drawing works for the big attack disc and the small skills.
 *
 * Every icon draws inside a box of `s` centred on (cx, cy) and paints in the
 * colour already set on the context, so a button can tint its own icon.
 */

export type IconName =
  | 'sword'
  | 'boot'
  | 'hand'
  | 'reload'
  | 'spark'
  | 'star'
  | 'swap'
  | 'menu';

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Melee: a blade on the diagonal with a crossguard, the classic attack glyph. */
function sword(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  const u = s / 16;
  // blade
  ctx.fillRect(-1.6 * u, -7 * u, 3.2 * u, 9.5 * u);
  // tip
  ctx.beginPath();
  ctx.moveTo(-1.6 * u, -7 * u);
  ctx.lineTo(0, -9.5 * u);
  ctx.lineTo(1.6 * u, -7 * u);
  ctx.closePath();
  ctx.fill();
  // crossguard
  ctx.fillRect(-5 * u, 2.5 * u, 10 * u, 2 * u);
  // grip and pommel
  ctx.fillRect(-1.2 * u, 4.5 * u, 2.4 * u, 3.5 * u);
  ctx.fillRect(-2.2 * u, 8 * u, 4.4 * u, 1.8 * u);
  ctx.restore();
}

/**
 * Dash: a boot mid-stride with two short speed lines. The lines stay short
 * deliberately - drawn long they read as three stacked bars, which is the menu
 * icon, and two controls must never share a silhouette.
 */
function boot(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  const ox = 1.5 * u;
  ctx.beginPath();
  ctx.moveTo(cx - 2.5 * u + ox, cy - 8 * u);
  ctx.lineTo(cx + 2.5 * u + ox, cy - 8 * u);
  ctx.lineTo(cx + 2.5 * u + ox, cy + 1.5 * u);
  ctx.lineTo(cx + 7.5 * u + ox, cy + 4.5 * u);
  ctx.lineTo(cx + 7.5 * u + ox, cy + 8 * u);
  ctx.lineTo(cx - 2.5 * u + ox, cy + 8 * u);
  ctx.closePath();
  ctx.fill();
  // sole highlight, so the boot reads as a boot and not a block
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  px(ctx, cx - 2.5 * u + ox, cy + 5.2 * u, 10 * u, 1.2 * u);
  ctx.restore();
  px(ctx, cx - 7.5 * u, cy - 3.4 * u, 3.4 * u, 1.8 * u);
  px(ctx, cx - 8 * u, cy + 1.2 * u, 4.2 * u, 1.8 * u);
}

/** Interact: an open hand reaching, for doors, boxes and revives. */
function hand(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  // palm
  ctx.beginPath();
  ctx.moveTo(cx - 4.5 * u, cy - 1 * u);
  ctx.lineTo(cx + 4.5 * u, cy - 1 * u);
  ctx.lineTo(cx + 4.5 * u, cy + 5 * u);
  ctx.quadraticCurveTo(cx, cy + 8.5 * u, cx - 4.5 * u, cy + 5 * u);
  ctx.closePath();
  ctx.fill();
  // fingers
  for (let i = 0; i < 3; i++) {
    px(ctx, cx - 4.2 * u + i * 3 * u, cy - 7 * u, 2.4 * u, 6.5 * u);
  }
  // thumb
  px(ctx, cx + 4.2 * u, cy - 3.5 * u, 2.4 * u, 4 * u);
}

/** Reload: a ring of arrows chasing each other. */
function reload(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  ctx.lineWidth = 2.4 * u;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.arc(cx, cy, 5.2 * u, Math.PI * 0.35, Math.PI * 1.75);
  ctx.stroke();
  // arrowhead on the open end
  ctx.beginPath();
  const a = Math.PI * 0.35;
  const hx = cx + Math.cos(a) * 5.2 * u;
  const hy = cy + Math.sin(a) * 5.2 * u;
  ctx.moveTo(hx + 3 * u, hy - 1 * u);
  ctx.lineTo(hx - 2.2 * u, hy + 1.6 * u);
  ctx.lineTo(hx + 1 * u, hy + 4 * u);
  ctx.closePath();
  ctx.fill();
}

/** Ability: a four-point spark, the universal "skill" mark. */
function spark(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  const arm = (len: number, wide: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.quadraticCurveTo(wide, -wide, len, 0);
    ctx.quadraticCurveTo(wide, wide, 0, len);
    ctx.quadraticCurveTo(-wide, wide, -len, 0);
    ctx.quadraticCurveTo(-wide, -wide, 0, -len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  arm(8 * u, 1.6 * u, 0);
  arm(4.6 * u, 1.1 * u, Math.PI / 4);
}

/** Ultimate: a filled star, reserved for the big one. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 8 * u : 3.4 * u;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Swap weapon: two arrows trading places. */
function swap(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  const arrow = (y: number, dir: number) => {
    px(ctx, cx - 5 * u, y - 1 * u, 8 * u, 2 * u);
    ctx.beginPath();
    const tipX = cx + dir * 6.5 * u;
    ctx.moveTo(tipX, y);
    ctx.lineTo(tipX - dir * 3.4 * u, y - 3.2 * u);
    ctx.lineTo(tipX - dir * 3.4 * u, y + 3.2 * u);
    ctx.closePath();
    ctx.fill();
  };
  arrow(cy - 3.6 * u, 1);
  ctx.save();
  ctx.translate(2 * u, 0);
  arrow(cy + 3.6 * u, -1);
  ctx.restore();
}

/** Pause / menu: three bars, which reads as "menu" on any phone. */
function menu(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const u = s / 16;
  for (let i = -1; i <= 1; i++) {
    px(ctx, cx - 6 * u, cy + i * 4.4 * u - 1.1 * u, 12 * u, 2.2 * u);
  }
}

const ICONS: Record<IconName, (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void> = {
  sword, boot, hand, reload, spark, star, swap, menu,
};

export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ICONS[name](ctx, cx, cy, size);
  ctx.restore();
}

/**
 * The button face itself: a bevelled stone ring around a domed disc, the look
 * the reference art uses to make a control read as a physical button rather
 * than a flat circle.
 */
export function drawPadButton(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  pressed: boolean,
  disabled = false,
) {
  ctx.save();
  const scale = pressed ? 0.94 : 1;
  const rr = r * scale;

  // drop shadow grounds the button against the floor
  ctx.globalAlpha = disabled ? 0.25 : 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy + rr * 0.09, rr, 0, Math.PI * 2);
  ctx.fill();

  // outer ring
  ctx.globalAlpha = disabled ? 0.4 : 0.95;
  ctx.fillStyle = '#3a3128';
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0d0b09';
  ctx.lineWidth = Math.max(1.5, rr * 0.06);
  ctx.stroke();

  // lit top edge of the ring
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(1.2, rr * 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 0.92, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  // domed inner face
  const inner = rr * 0.78;
  const grad = ctx.createLinearGradient(cx, cy - inner, cx, cy + inner);
  if (pressed) {
    grad.addColorStop(0, shade(color, -0.35));
    grad.addColorStop(1, shade(color, 0.1));
  } else {
    grad.addColorStop(0, shade(color, 0.24));
    grad.addColorStop(1, shade(color, -0.34));
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();

  // gloss
  if (!pressed) {
    ctx.globalAlpha = disabled ? 0.08 : 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - inner * 0.42, inner * 0.62, inner * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Lighten (amount > 0) or darken a hex colour, for the button dome. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const ch = (shift: number) => {
    const v = (n >> shift) & 0xff;
    return Math.round(v + (to - v) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
