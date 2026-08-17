import type { Enemy } from './Entities';
import type { Projectile } from './Weapons';
import { RARITY_ORDER, type Rarity } from './types';

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

export function companionRarityMult(rarity: Rarity): number {
  return RARITY_MULT[rarity];
}

export class Companion {
  x: number;
  y: number;
  level: number;
  rarity: Rarity;
  fireCooldown = 0;
  followAngleOffset = Math.PI * 0.75;

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
    const followX = playerX + Math.cos(this.followAngleOffset) * 42;
    const followY = playerY + Math.sin(this.followAngleOffset) * 42;
    const dx = followX - this.x;
    const dy = followY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const speed = Math.min(dist * 4, 320);
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    const out: Projectile[] = [];
    if (this.fireCooldown <= 0) {
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
      if (nearest) {
        this.fireCooldown = 1 / this.fireRate;
        const angle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
        out.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * 620,
          vy: Math.sin(angle) * 620,
          damage: this.damage,
          color: '#9fe6ff',
          pierce: 0,
          knockback: 40,
          radius: 3,
          alive: true,
          distanceLeft: this.range + 40,
        });
      }
    }
    return out;
  }
}
