import type { Enemy } from './Entities';
import type { Projectile } from './Weapons';
import { RARITY_ORDER, RARITY_COLOR, type Rarity, type CompanionSpecies } from './types';

export interface SpeciesDef {
  id: CompanionSpecies;
  label: string;
  blurb: string;
  tierNames: string[]; // index by level 0..5
  baseDamage: number;
  damagePerLevel: number;
  baseFireRate: number;
  fireRatePerLevel: number;
  baseRange: number;
  rangePerLevel: number;
  pierce: number;
  shotSpeed: number;
  shotRadius: number;
}

export const SPECIES_DEFS: Record<CompanionSpecies, SpeciesDef> = {
  drone: {
    id: 'drone',
    label: 'Drone',
    blurb: 'Balanced quadrotor escort',
    tierNames: ['Scout Drone', 'Recon Drone', 'Tactical Drone', 'Vanguard Drone', 'Apex Drone', 'Sovereign Drone'],
    baseDamage: 8, damagePerLevel: 4,
    baseFireRate: 1.3, fireRatePerLevel: 0.15,
    baseRange: 250, rangePerLevel: 15,
    pierce: 0, shotSpeed: 640, shotRadius: 3.5,
  },
  walker: {
    id: 'walker',
    label: 'Walker',
    blurb: 'Heavy legged gun platform — slow, hits hard',
    tierNames: ['Sentry Walker', 'Guard Walker', 'Siege Walker', 'Bastion Walker', 'Titan Walker', 'Colossus Walker'],
    baseDamage: 17, damagePerLevel: 8,
    baseFireRate: 0.68, fireRatePerLevel: 0.08,
    baseRange: 305, rangePerLevel: 18,
    pierce: 1, shotSpeed: 720, shotRadius: 5,
  },
  swarm: {
    id: 'swarm',
    label: 'Swarm',
    blurb: 'Nanite cluster — rapid, low damage per hit',
    tierNames: ['Nano Swarm', 'Hive Swarm', 'Vortex Swarm', 'Locust Swarm', 'Devour Swarm', 'Singularity Swarm'],
    baseDamage: 4, damagePerLevel: 2,
    baseFireRate: 3, fireRatePerLevel: 0.4,
    baseRange: 210, rangePerLevel: 12,
    pierce: 0, shotSpeed: 600, shotRadius: 2.6,
  },
  wraith: {
    id: 'wraith',
    label: 'Wraith',
    blurb: 'Bound infected spirit — piercing spectral bolts',
    tierNames: ['Bound Wisp', 'Bound Wraith', 'Hollow Wraith', 'Dread Wraith', 'Void Wraith', 'Revenant Wraith'],
    baseDamage: 11, damagePerLevel: 5,
    baseFireRate: 1.1, fireRatePerLevel: 0.13,
    baseRange: 280, rangePerLevel: 16,
    pierce: 2, shotSpeed: 560, shotRadius: 4,
  },
};

export const SPECIES_ORDER: CompanionSpecies[] = ['drone', 'walker', 'swarm', 'wraith'];

export const COMPANION_LEVEL_CAP = 5;

const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.2,
  rare: 1.45,
  epic: 1.75,
  legendary: 2.15,
};

/** A companion as stored in the player's roster. Each one levels independently. */
export interface CompanionSave {
  id: string;
  species: CompanionSpecies;
  level: number;
  rarity: Rarity;
}

export function companionName(save: CompanionSave): string {
  const def = SPECIES_DEFS[save.species];
  return def.tierNames[Math.min(save.level, def.tierNames.length - 1)];
}

export function companionStats(save: CompanionSave) {
  const def = SPECIES_DEFS[save.species];
  const rm = RARITY_MULT[save.rarity];
  return {
    damage: (def.baseDamage + save.level * def.damagePerLevel) * rm,
    fireRate: (def.baseFireRate + save.level * def.fireRatePerLevel) * (0.85 + rm * 0.15),
    range: def.baseRange + save.level * def.rangePerLevel + RARITY_ORDER.indexOf(save.rarity) * 12,
  };
}

export function newCompanionId(): string {
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ---------------------------------------------------------------- runtime

export class Companion {
  save: CompanionSave;
  x: number;
  y: number;
  fireCooldown = 0;
  followAngleOffset = Math.PI * 0.75;
  animPhase = 0;
  facing = 0;

  constructor(x: number, y: number, save: CompanionSave) {
    this.x = x;
    this.y = y;
    this.save = save;
  }

  get species(): CompanionSpecies {
    return this.save.species;
  }

  get level(): number {
    return this.save.level;
  }

  get rarity(): Rarity {
    return this.save.rarity;
  }

  get name(): string {
    return companionName(this.save);
  }

  update(dt: number, playerX: number, playerY: number, enemies: Enemy[]): Projectile[] {
    this.animPhase += dt;
    const def = SPECIES_DEFS[this.save.species];
    const stats = companionStats(this.save);

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

    let nearest: Enemy | null = null;
    let bestDist = stats.range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = e;
      }
    }
    if (nearest) this.facing = Math.atan2(nearest.y - this.y, nearest.x - this.x);

    const out: Projectile[] = [];
    if (this.fireCooldown <= 0 && nearest) {
      this.fireCooldown = 1 / stats.fireRate;
      out.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(this.facing) * def.shotSpeed,
        vy: Math.sin(this.facing) * def.shotSpeed,
        damage: stats.damage,
        color: RARITY_COLOR[this.save.rarity],
        pierce: def.pierce,
        knockback: 40,
        radius: def.shotRadius,
        alive: true,
        distanceLeft: stats.range + 40,
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------- sprites

/**
 * Draws a companion. The silhouette gains real parts as `level` rises (extra
 * rotors, legs, barrels, nanites, horns) and `rarity` layers on trim, orbiting
 * sparks, an aura and finally a crown, so both axes read at a glance.
 */
export function drawCompanion(
  ctx: CanvasRenderingContext2D,
  species: CompanionSpecies,
  level: number,
  rarity: Rarity,
  x: number,
  y: number,
  facing: number,
  phase: number,
  scale = 1,
) {
  const accent = RARITY_COLOR[rarity];
  const rIdx = RARITY_ORDER.indexOf(rarity);
  const bob = Math.sin(phase * 3.4) * 2.2;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // grounded shadow (does not bob, so the hover reads)
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 14, 10 + level, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // rarity aura behind the body
  if (rIdx >= 3) {
    const pulse = (Math.sin(phase * 3) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.14 + pulse * 0.12;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, bob, 20 + rIdx * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.translate(0, bob);
  if (species === 'drone') drawDroneBody(ctx, level, rIdx, accent, facing, phase);
  else if (species === 'walker') drawWalkerBody(ctx, level, rIdx, accent, facing, phase);
  else if (species === 'swarm') drawSwarmBody(ctx, level, rIdx, accent, facing, phase);
  else drawWraithBody(ctx, level, rIdx, accent, facing, phase);

  // orbiting rarity sparks
  const sparks = rIdx >= 4 ? 6 : rIdx >= 3 ? 4 : rIdx >= 2 ? 2 : 0;
  for (let i = 0; i < sparks; i++) {
    const a = phase * 2.2 + (i / sparks) * Math.PI * 2;
    const rad = 19 + rIdx;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rad, Math.sin(a) * rad * 0.55, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // legendary crown
  if (rIdx >= 4) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-7, -17);
    ctx.lineTo(-4.5, -22);
    ctx.lineTo(-2, -18);
    ctx.lineTo(0, -24);
    ctx.lineTo(2, -18);
    ctx.lineTo(4.5, -22);
    ctx.lineTo(7, -17);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function trim(ctx: CanvasRenderingContext2D, rIdx: number, accent: string) {
  ctx.strokeStyle = rIdx >= 1 ? accent : '#5a636f';
  ctx.lineWidth = rIdx >= 1 ? 1.8 : 1.3;
}

function drawDroneBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const rotors = level >= 2 ? 4 : 2;
  const armSpan = 11 + level * 0.9;
  const spin = Math.abs(Math.cos(phase * 22));

  // arms
  ctx.strokeStyle = '#4a525e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-armSpan, -3);
  ctx.lineTo(armSpan, -3);
  if (rotors === 4) {
    ctx.moveTo(-armSpan * 0.8, 4);
    ctx.lineTo(armSpan * 0.8, 4);
  }
  ctx.stroke();

  const rotorPos: [number, number][] = rotors === 4
    ? [[-armSpan, -3], [armSpan, -3], [-armSpan * 0.8, 4], [armSpan * 0.8, 4]]
    : [[-armSpan, -3], [armSpan, -3]];

  ctx.fillStyle = 'rgba(200,225,255,0.42)';
  for (const [rx, ry] of rotorPos) {
    ctx.beginPath();
    ctx.ellipse(rx, ry, (6.5 + level * 0.3) * (0.35 + spin * 0.65), 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#39414c';
  for (const [rx, ry] of rotorPos) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // chassis, thicker at higher tiers
  const w = 7 + level * 0.6;
  ctx.fillStyle = level >= 3 ? '#39424f' : '#2c333d';
  trim(ctx, rIdx, accent);
  ctx.beginPath();
  ctx.moveTo(-w, -2);
  ctx.lineTo(w, -2);
  ctx.lineTo(w - 1.5, 6);
  ctx.lineTo(-w + 1.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // side pods from tier 3
  if (level >= 3) {
    ctx.fillStyle = '#39414c';
    ctx.fillRect(-w - 3, -1, 3, 5);
    ctx.fillRect(w, -1, 3, 5);
  }
  // underslung cannon from tier 4
  if (level >= 4) {
    ctx.fillStyle = '#222831';
    ctx.fillRect(-1.6, 6, 3.2, 5);
  }

  // antennae
  ctx.strokeStyle = '#5a636f';
  ctx.lineWidth = 1.2;
  const ants = level >= 3 ? [-3, 3] : [0];
  for (const ax of ants) {
    ctx.beginPath();
    ctx.moveTo(ax, -2);
    ctx.lineTo(ax, -9);
    ctx.stroke();
  }
  const blink = (Math.sin(phase * 6) + 1) / 2;
  ctx.fillStyle = `rgba(255,90,90,${0.35 + blink * 0.65})`;
  for (const ax of ants) {
    ctx.beginPath();
    ctx.arc(ax, -10, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // scanner eye(s)
  ctx.save();
  ctx.rotate(facing);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  if (level >= 3) {
    ctx.beginPath();
    ctx.ellipse(2.5, -0.5, 2.6, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(2.5, 3.5, 2.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(2.5, 2, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWalkerBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const legs = level >= 2 ? 4 : 2;
  const step = Math.sin(phase * 5) * 1.6;
  const bodyW = 9 + level * 0.9;

  // legs
  ctx.strokeStyle = '#3b434f';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < legs; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const offset = i < 2 ? -2 : 3;
    const kneeX = side * (bodyW + 3);
    const footY = 12 + (i % 2 === 0 ? step : -step);
    ctx.beginPath();
    ctx.moveTo(side * 3, offset);
    ctx.lineTo(kneeX, offset + 4);
    ctx.lineTo(kneeX + side * 1.5, footY);
    ctx.stroke();
  }

  // hull
  ctx.fillStyle = level >= 3 ? '#4a4335' : '#3a3a33';
  trim(ctx, rIdx, accent);
  ctx.beginPath();
  ctx.moveTo(-bodyW, -6);
  ctx.lineTo(bodyW, -6);
  ctx.lineTo(bodyW - 2, 5);
  ctx.lineTo(-bodyW + 2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // armour plates from tier 2
  if (level >= 2) {
    ctx.fillStyle = '#565040';
    ctx.fillRect(-bodyW + 1.5, -5, bodyW * 2 - 3, 3);
  }
  // shoulder spikes at max tier
  if (level >= 5) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-bodyW, -6);
    ctx.lineTo(-bodyW - 4, -12);
    ctx.lineTo(-bodyW + 2, -7);
    ctx.closePath();
    ctx.moveTo(bodyW, -6);
    ctx.lineTo(bodyW + 4, -12);
    ctx.lineTo(bodyW - 2, -7);
    ctx.closePath();
    ctx.fill();
  }

  // turret + barrels
  ctx.save();
  ctx.rotate(facing);
  ctx.fillStyle = '#2a2f38';
  ctx.beginPath();
  ctx.arc(0, -2, 4.5 + level * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const barrels = level >= 5 ? [-3, -1, 1, 3] : level >= 3 ? [-2, 2] : [0];
  ctx.fillStyle = '#1e232b';
  for (const by of barrels) {
    ctx.fillRect(4, by - 0.9, 10 + level * 0.6, 1.8);
  }
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(2, -2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSwarmBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const count = 3 + level * 2;

  // outer dust halo at max tier
  if (level >= 5) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // counter-rotating inner ring from tier 3
  if (level >= 3) {
    for (let i = 0; i < 5; i++) {
      const a = -phase * 3 + (i / 5) * Math.PI * 2;
      ctx.fillStyle = 'rgba(180,210,255,0.5)';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // orbiting nanites
  for (let i = 0; i < count; i++) {
    const a = phase * 2 + (i / count) * Math.PI * 2;
    const rad = 11 + (i % 2) * 2.5;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = rIdx >= 2 ? 8 : 4;
    ctx.fillStyle = i % 3 === 0 ? accent : '#9fd0ff';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rad, Math.sin(a) * rad, 1.6 + level * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // core
  ctx.save();
  ctx.rotate(facing);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#1d2530';
  ctx.beginPath();
  ctx.arc(0, 0, 4 + level * 0.35, 0, Math.PI * 2);
  ctx.fill();
  trim(ctx, rIdx, accent);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(1.5, 0, 1.8 + level * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWraithBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const size = 8 + level * 1.1;
  const sway = Math.sin(phase * 2.4) * 1.4;

  // trailing tendrils
  ctx.strokeStyle = rIdx >= 1 ? accent : '#5a4a6a';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.6;
  const tendrils = 3 + Math.floor(level / 2);
  for (let i = 0; i < tendrils; i++) {
    const tx = -size + (i / Math.max(1, tendrils - 1)) * size * 2;
    ctx.beginPath();
    ctx.moveTo(tx * 0.7, size * 0.4);
    ctx.quadraticCurveTo(tx * 0.7 + sway, size * 0.9, tx * 0.5 + sway * 2, size * 1.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // cloak
  ctx.fillStyle = level >= 3 ? '#2b1f3a' : '#26202e';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size, -size * 0.5, size * 0.85, size * 0.5);
  ctx.quadraticCurveTo(0, size * 0.15, -size * 0.85, size * 0.5);
  ctx.quadraticCurveTo(-size, -size * 0.5, 0, -size);
  ctx.closePath();
  ctx.fill();
  trim(ctx, rIdx, accent);
  ctx.stroke();

  // horns from tier 2
  if (level >= 2) {
    ctx.fillStyle = rIdx >= 1 ? accent : '#7a6a8a';
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.62);
    ctx.lineTo(-size * 0.95, -size * 1.35);
    ctx.lineTo(-size * 0.25, -size * 0.78);
    ctx.closePath();
    ctx.moveTo(size * 0.55, -size * 0.62);
    ctx.lineTo(size * 0.95, -size * 1.35);
    ctx.lineTo(size * 0.25, -size * 0.78);
    ctx.closePath();
    ctx.fill();
  }

  // eyes track the target
  ctx.save();
  ctx.rotate(facing * 0.25);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillStyle = accent;
  const eyeGap = size * 0.3;
  ctx.beginPath();
  ctx.ellipse(-eyeGap, -size * 0.15, 1.9, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeGap, -size * 0.15, 1.9, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
