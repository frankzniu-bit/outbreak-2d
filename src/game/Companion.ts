import type { Enemy } from './Entities';
import type { Projectile } from './Weapons';
import { RARITY_ORDER, RARITY_COLOR, type Rarity } from './types';

const TIER_NAMES = ['Newbie Drone', 'Trained Drone', 'Trained Drone', 'Veteran Drone', 'Veteran Drone', 'Elite Drone'];

export function companionTierName(level: number): string {
  return TIER_NAMES[Math.min(level, TIER_NAMES.length - 1)];
}

const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.2,
  rare: 1.45,
  epic: 1.75,
  legendary: 2.15,
};

export class Companion {
  x: number;
  y: number;
  level: number;
  rarity: Rarity;
  fireCooldown = 0;
  followAngleOffset = Math.PI * 0.75;
  /** Drives rotor spin + hover bob. */
  animPhase = 0;
  facing = 0;

  constructor(x: number, y: number, level: number, rarity: Rarity = 'common') {
    this.x = x;
    this.y = y;
    this.level = level;
    this.rarity = rarity;
  }

  get damage(): number {
    return (8 + this.level * 4) * RARITY_MULT[this.rarity];
  }

  get fireRate(): number {
    return (1.3 + this.level * 0.15) * (0.85 + RARITY_MULT[this.rarity] * 0.15);
  }

  get range(): number {
    return 250 + this.level * 15 + RARITY_ORDER.indexOf(this.rarity) * 12;
  }

  get name(): string {
    return companionTierName(this.level);
  }

  update(dt: number, playerX: number, playerY: number, enemies: Enemy[]): Projectile[] {
    this.animPhase += dt;
    const followX = playerX + Math.cos(this.followAngleOffset) * 46;
    const followY = playerY + Math.sin(this.followAngleOffset) * 46;
    const dx = followX - this.x;
    const dy = followY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const speed = Math.min(dist * 4, 340);
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    const out: Projectile[] = [];
    let nearest: Enemy | null = null;
    let bestDist = this.range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = e;
      }
    }
    if (nearest) this.facing = Math.atan2(nearest.y - this.y, nearest.x - this.x);

    if (this.fireCooldown <= 0 && nearest) {
      this.fireCooldown = 1 / this.fireRate;
      out.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(this.facing) * 640,
        vy: Math.sin(this.facing) * 640,
        damage: this.damage,
        color: RARITY_COLOR[this.rarity],
        pierce: 0,
        knockback: 40,
        radius: 3.5,
        alive: true,
        distanceLeft: this.range + 40,
      });
    }
    return out;
  }
}

/** Draws an actual quad-style drone: chassis, spinning rotors, scanner eye, antenna. */
export function drawDrone(ctx: CanvasRenderingContext2D, c: Companion) {
  const accent = RARITY_COLOR[c.rarity];
  const bob = Math.sin(c.animPhase * 3.4) * 2.2;
  const x = c.x;
  const y = c.y + bob;

  // ground shadow, unaffected by the bob so the hover reads
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 13, 9, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);

  // rotor arms
  ctx.strokeStyle = '#4a525e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-11, -3);
  ctx.lineTo(11, -3);
  ctx.stroke();

  // spinning rotor discs - width oscillates to fake rotation
  const spin = Math.abs(Math.cos(c.animPhase * 22));
  ctx.fillStyle = 'rgba(200,225,255,0.42)';
  for (const rx of [-11, 11]) {
    ctx.beginPath();
    ctx.ellipse(rx, -3, 6.5 * (0.35 + spin * 0.65), 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#39414c';
  for (const rx of [-11, 11]) {
    ctx.beginPath();
    ctx.arc(rx, -3, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // chassis
  ctx.fillStyle = '#2c333d';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-7, -2);
  ctx.lineTo(7, -2);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // antenna with blinking tip
  ctx.strokeStyle = '#5a636f';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -9);
  ctx.stroke();
  const blink = (Math.sin(c.animPhase * 6) + 1) / 2;
  ctx.fillStyle = `rgba(255,90,90,${0.35 + blink * 0.65})`;
  ctx.beginPath();
  ctx.arc(0, -10, 1.7, 0, Math.PI * 2);
  ctx.fill();

  // scanner eye, aimed at whatever the drone is tracking
  ctx.save();
  ctx.rotate(c.facing);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(2.5, 2, 3.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}
