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
  hound: {
    id: 'hound',
    label: 'Hound',
    blurb: 'Cyber-mastiff — short leash, brutal close-range bite',
    tierNames: ['Stray Hound', 'Kennel Hound', 'War Hound', 'Ripper Hound', 'Dire Hound', 'Fenrir Hound'],
    baseDamage: 14, damagePerLevel: 6,
    baseFireRate: 1.5, fireRatePerLevel: 0.18,
    baseRange: 190, rangePerLevel: 10,
    pierce: 0, shotSpeed: 820, shotRadius: 4.5,
  },
  sentinel: {
    id: 'sentinel',
    label: 'Sentinel',
    blurb: 'Watching eye — long sight lines, patient shots',
    tierNames: ['Watch Eye', 'Guard Sentinel', 'Warden Sentinel', 'Oracle Sentinel', 'Aegis Sentinel', 'Eternal Sentinel'],
    baseDamage: 20, damagePerLevel: 9,
    baseFireRate: 0.55, fireRatePerLevel: 0.07,
    baseRange: 400, rangePerLevel: 22,
    pierce: 2, shotSpeed: 900, shotRadius: 3,
  },
  scarab: {
    id: 'scarab',
    label: 'Scarab',
    blurb: 'Armoured beetle — steady chip damage from behind a shell',
    tierNames: ['Grub Scarab', 'Shell Scarab', 'Iron Scarab', 'Carapace Scarab', 'Chitin Lord', 'Pharaoh Scarab'],
    baseDamage: 9, damagePerLevel: 4.5,
    baseFireRate: 2, fireRatePerLevel: 0.22,
    baseRange: 235, rangePerLevel: 13,
    pierce: 1, shotSpeed: 660, shotRadius: 3.2,
  },
  seraph: {
    id: 'seraph',
    label: 'Seraph',
    blurb: 'Winged construct — radiant volleys, wide reach',
    tierNames: ['Fledgling Seraph', 'Choir Seraph', 'Radiant Seraph', 'Zealot Seraph', 'Ascendant Seraph', 'Empyrean Seraph'],
    baseDamage: 13, damagePerLevel: 6,
    baseFireRate: 1.6, fireRatePerLevel: 0.2,
    baseRange: 300, rangePerLevel: 17,
    pierce: 1, shotSpeed: 700, shotRadius: 3.8,
  },
};

export const SPECIES_ORDER: CompanionSpecies[] = [
  'drone',
  'walker',
  'swarm',
  'wraith',
  'hound',
  'sentinel',
  'scarab',
  'seraph',
];

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
  const body = BODY_DRAWERS[species] ?? drawDroneBody;
  body(ctx, level, rIdx, accent, facing, phase);

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

type BodyDrawer = (
  ctx: CanvasRenderingContext2D,
  level: number,
  rIdx: number,
  accent: string,
  facing: number,
  phase: number,
) => void;

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

function drawHoundBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  // Faces its target: the whole silhouette flips so it never runs backwards.
  const flip = Math.cos(facing) < 0 ? -1 : 1;
  const gait = Math.sin(phase * 7);
  const len = 9 + level * 0.7;
  const tall = 6 + level * 0.35;

  ctx.save();
  ctx.scale(flip, 1);

  // far legs first, in a darker shade, so the body reads in front of them
  const drawLegs = (color: string, swingSign: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (const [hipX, dir] of [[-len * 0.62, -1], [len * 0.62, 1]] as [number, number][]) {
      const swing = gait * swingSign * dir;
      ctx.beginPath();
      ctx.moveTo(hipX, tall * 0.4);
      ctx.lineTo(hipX + swing * 2, tall + 4);
      ctx.lineTo(hipX + swing * 4.5, tall + 10);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };
  drawLegs('#2b313a', -1);

  // tail: a stiff aerial low down, a plated whip once it has grown
  ctx.strokeStyle = rIdx >= 1 ? accent : '#5a636f';
  ctx.lineWidth = level >= 3 ? 2.6 : 1.6;
  ctx.beginPath();
  ctx.moveTo(-len, -tall * 0.4);
  ctx.quadraticCurveTo(-len - 8, -tall - 2 + gait * 2, -len - 6, -tall - 11 + gait * 2.5);
  ctx.stroke();

  // torso: deep chest tapering to the hips
  ctx.fillStyle = level >= 3 ? '#3b4450' : '#2f353f';
  trim(ctx, rIdx, accent);
  ctx.beginPath();
  ctx.moveTo(-len, -tall * 0.5);
  ctx.quadraticCurveTo(0, -tall * 1.25, len * 0.75, -tall * 0.95);
  ctx.quadraticCurveTo(len, -tall * 0.2, len * 0.7, tall * 0.55);
  ctx.quadraticCurveTo(0, tall * 0.95, -len, tall * 0.4);
  ctx.quadraticCurveTo(-len - 2, -tall * 0.1, -len, -tall * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // dorsal spines from tier 2, doubling at tier 4
  if (level >= 2) {
    ctx.fillStyle = accent;
    const spines = level >= 4 ? 4 : 2;
    for (let i = 0; i < spines; i++) {
      const sx = -len * 0.55 + (i / Math.max(1, spines - 1)) * len * 1.05;
      const base = -tall * 1.05 - Math.cos((sx / len) * 1.2) * 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - 2.2, base + 1);
      ctx.lineTo(sx, base - 6 - level * 0.5);
      ctx.lineTo(sx + 2.2, base + 1);
      ctx.closePath();
      ctx.fill();
    }
  }

  // head: skull block plus a snout, sat forward of the chest
  const hx = len * 0.85;
  const hy = -tall * 1.05;
  ctx.fillStyle = level >= 3 ? '#454e5a' : '#39414c';
  ctx.beginPath();
  ctx.moveTo(hx - 4, hy - 4);
  ctx.lineTo(hx + 6, hy - 4.5);
  ctx.lineTo(hx + 7, hy + 3);
  ctx.lineTo(hx - 3, hy + 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // snout
  ctx.fillStyle = '#2a3038';
  ctx.beginPath();
  ctx.moveTo(hx + 5, hy - 2.5);
  ctx.lineTo(hx + 13, hy - 0.5);
  ctx.lineTo(hx + 13, hy + 3);
  ctx.lineTo(hx + 5, hy + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ears prick up
  ctx.fillStyle = rIdx >= 1 ? accent : '#5a636f';
  for (const ox of [-2.5, 2]) {
    ctx.beginPath();
    ctx.moveTo(hx + ox - 1.5, hy - 4);
    ctx.lineTo(hx + ox, hy - 11);
    ctx.lineTo(hx + ox + 2.5, hy - 4);
    ctx.closePath();
    ctx.fill();
  }

  // bared teeth once it has grown into a war hound
  if (level >= 3) {
    ctx.fillStyle = '#dfe6ef';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(hx + 6 + i * 2.4, hy + 2.6);
      ctx.lineTo(hx + 7 + i * 2.4, hy + 5.6);
      ctx.lineTo(hx + 8 + i * 2.4, hy + 2.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  // visor eye
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(hx + 2, hy - 0.5, 2.6, 1.7, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // near legs on top of the body
  drawLegs('#4a545f', 1);

  ctx.restore();
}

function drawSentinelBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const r = 7 + level * 0.7;
  const rings = 1 + Math.floor(level / 2);

  // gyroscopic rings, each on its own axis
  for (let i = 0; i < rings; i++) {
    const tilt = phase * (0.8 + i * 0.5) + i * 1.1;
    ctx.save();
    ctx.rotate(i * 0.7);
    ctx.strokeStyle = rIdx >= 1 ? accent : '#6a7482';
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r + 5 + i * 3, Math.abs(Math.cos(tilt)) * (r + 5 + i * 3), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // shell
  ctx.fillStyle = level >= 3 ? '#2b3340' : '#232a34';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  trim(ctx, rIdx, accent);
  ctx.stroke();

  // iris tracks the target
  ctx.save();
  ctx.rotate(facing);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(r * 0.35, 0, r * 0.5, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0c10';
  ctx.beginPath();
  ctx.ellipse(r * 0.45, 0, r * 0.2, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // focusing prongs grow out of the front at higher tiers
  if (level >= 2) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    const prongs = level >= 4 ? [-0.7, -0.3, 0.3, 0.7] : [-0.5, 0.5];
    for (const a of prongs) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
      ctx.stroke();
    }
  }
  ctx.restore();

  // lens flare sweep across the shell
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#dfe6ef';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.5, -2.4 + Math.sin(phase) * 0.4, -1.3 + Math.sin(phase) * 0.4);
  ctx.stroke();
  ctx.restore();
}

function drawScarabBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const w = 8 + level * 0.8;
  const h = 9 + level * 0.8;
  const scuttle = Math.sin(phase * 9) * 1.2;

  ctx.save();
  ctx.rotate(facing);

  // six legs in an alternating tripod gait, splayed out from under the shell
  ctx.strokeStyle = '#2e2418';
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const lx = -h * 0.45 + i * h * 0.5;
    const swing = i % 2 === 0 ? scuttle : -scuttle;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(lx, side * w * 0.4);
      ctx.lineTo(lx - 1.5 + swing, side * (w + 3));
      ctx.lineTo(lx - 4 + swing, side * (w + 6));
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';

  // flight wings peek out from under the shell once it splits open
  const split = level >= 4 ? 0.22 + Math.abs(Math.sin(phase * 4)) * 0.3 : 0;
  if (level >= 4) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#cfe7ff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-h * 0.15, side * w * 0.5, h * 0.75, w * 0.4, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // shell: one dome cut down the middle into two elytra that hinge outward
  ctx.fillStyle = level >= 3 ? '#63512d' : '#4b3c24';
  trim(ctx, rIdx, accent);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-h * 0.1, 0);
    ctx.rotate(side * split);
    ctx.beginPath();
    ctx.moveTo(-h * 0.72, 0);
    ctx.quadraticCurveTo(-h * 0.5, side * w, h * 0.5, side * w * 0.72);
    ctx.quadraticCurveTo(h * 0.85, side * w * 0.3, h * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // ridge line along each half
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-h * 0.4, side * w * 0.35);
    ctx.quadraticCurveTo(h * 0.1, side * w * 0.55, h * 0.6, side * w * 0.2);
    ctx.stroke();
    ctx.restore();
    trim(ctx, rIdx, accent);
  }

  // glowing seam where the halves meet
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-h * 0.8, 0);
  ctx.lineTo(h * 0.7, 0);
  ctx.stroke();
  ctx.restore();

  // pronotum shield and head at the front
  ctx.fillStyle = level >= 3 ? '#7a6436' : '#5b4a2c';
  ctx.beginPath();
  ctx.ellipse(h * 0.75, 0, h * 0.3, w * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2f2617';
  ctx.beginPath();
  ctx.ellipse(h * 1.05, 0, h * 0.22, w * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // horn from tier 2, longer with every tier
  if (level >= 2) {
    ctx.fillStyle = rIdx >= 1 ? accent : '#a08a5c';
    ctx.beginPath();
    ctx.moveTo(h * 1.15, -2.2);
    ctx.quadraticCurveTo(h * 1.5 + level, -3.5, h * 1.5 + level * 1.6, -6);
    ctx.quadraticCurveTo(h * 1.45 + level, 0, h * 1.15, 2.2);
    ctx.closePath();
    ctx.fill();
  }

  // eyes
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 9;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(h * 1.02, -w * 0.28, 1.4, 0, Math.PI * 2);
  ctx.arc(h * 1.02, w * 0.28, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawSeraphBody(ctx: CanvasRenderingContext2D, level: number, rIdx: number, accent: string, facing: number, phase: number) {
  const wingPairs = level >= 4 ? 3 : level >= 2 ? 2 : 1;
  const beat = Math.sin(phase * 5);
  const size = 7 + level * 0.6;

  // Wings sweep up and back from the shoulders. Back pairs are drawn first and
  // set slightly lower, so the stack reads as depth rather than as a collar.
  for (let i = wingPairs - 1; i >= 0; i--) {
    const span = 15 + i * 3.5;
    const rise = 12 + i * 2 + beat * 3;
    const anchorY = -size * 0.45 + i * 3;
    ctx.save();
    ctx.globalAlpha = 0.9 - i * 0.22;
    ctx.fillStyle = rIdx >= 2 ? accent : '#dbe4f2';
    ctx.strokeStyle = rIdx >= 1 ? accent : '#9aa8c0';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 2, anchorY);
      // leading edge, up and out
      ctx.quadraticCurveTo(side * span * 0.7, anchorY - rise, side * span, anchorY - rise * 0.5);
      // three feather scallops on the way back down
      ctx.quadraticCurveTo(side * span * 0.95, anchorY + 1, side * span * 0.7, anchorY - rise * 0.1);
      ctx.quadraticCurveTo(side * span * 0.7, anchorY + 4, side * span * 0.45, anchorY + 1.5);
      ctx.quadraticCurveTo(side * span * 0.4, anchorY + 6, side * span * 0.2, anchorY + 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // halo
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = accent;
  ctx.shadowBlur = rIdx >= 2 ? 12 : 6;
  ctx.beginPath();
  ctx.ellipse(0, -size - 8, 5.5 + level * 0.35, 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // hooded core body
  ctx.fillStyle = level >= 3 ? '#e8e3d5' : '#c8c4bb';
  trim(ctx, rIdx, accent);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.62, -size * 0.3, size * 0.5, size);
  ctx.quadraticCurveTo(0, size * 1.25, -size * 0.5, size);
  ctx.quadraticCurveTo(-size * 0.62, -size * 0.3, 0, -size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // sash across the robe from tier 3
  if (level >= 3) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.1);
    ctx.lineTo(size * 0.45, size * 0.35);
    ctx.stroke();
  }

  // sword motes circling the side it is aiming at
  const motes = 1 + Math.floor(level / 2);
  ctx.save();
  ctx.rotate(facing);
  for (let i = 0; i < motes; i++) {
    const a = phase * 3 + (i / motes) * Math.PI * 2;
    ctx.save();
    ctx.translate(11 + Math.cos(a) * 3, Math.sin(a) * 7);
    ctx.rotate(a * 0.5);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = accent;
    ctx.fillRect(-1, -4, 2, 8);
    ctx.restore();
  }
  // face slit
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillStyle = accent;
  ctx.fillRect(0.5, -size * 0.62, size * 0.42, 1.8);
  ctx.restore();
}

const BODY_DRAWERS: Record<CompanionSpecies, BodyDrawer> = {
  drone: drawDroneBody,
  walker: drawWalkerBody,
  swarm: drawSwarmBody,
  wraith: drawWraithBody,
  hound: drawHoundBody,
  sentinel: drawSentinelBody,
  scarab: drawScarabBody,
  seraph: drawSeraphBody,
};
