import { RARITY_WEIGHTS, RARITY_COLOR, RARITY_ORDER, type Rarity, type WeaponId, type WeaponRoll } from './types';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  fireRate: number; // shots per second
  damage: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  bulletSpeed: number;
  spread: number; // radians, full cone
  pellets: number; // shots per trigger pull
  knockback: number;
  pierce: number;
  range: number;
  slow?: number; // fraction speed reduction applied on hit
  burn?: number; // damage per second for 3s
  chain?: number; // number of additional nearby enemies lightning chains to
  chargeTime?: number; // seconds to fully charge before firing (rail spike)
  auto: boolean; // full auto if held
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  sidewinder: {
    id: 'sidewinder',
    name: 'Sidewinder .45',
    fireRate: 4,
    damage: 18,
    magSize: 12,
    reserveMax: 96,
    reloadTime: 0.9,
    bulletSpeed: 620,
    spread: 0.03,
    pellets: 1,
    knockback: 60,
    pierce: 0,
    range: 900,
    auto: false,
  },
  riot_shotgun: {
    id: 'riot_shotgun',
    name: 'Riot Shotgun',
    fireRate: 1.1,
    damage: 12,
    magSize: 6,
    reserveMax: 36,
    reloadTime: 1.6,
    bulletSpeed: 560,
    spread: 0.45,
    pellets: 7,
    knockback: 260,
    pierce: 0,
    range: 900,
    auto: false,
  },
  auto_smg: {
    id: 'auto_smg',
    name: 'Auto-SMG',
    fireRate: 11,
    damage: 7,
    magSize: 32,
    reserveMax: 160,
    reloadTime: 1.3,
    bulletSpeed: 700,
    spread: 0.09,
    pellets: 1,
    knockback: 30,
    pierce: 0,
    range: 900,
    auto: true,
  },
  cryo_rifle: {
    id: 'cryo_rifle',
    name: 'Cryo Rifle',
    fireRate: 3.2,
    damage: 10,
    magSize: 14,
    reserveMax: 84,
    reloadTime: 1.2,
    bulletSpeed: 540,
    spread: 0.05,
    pellets: 1,
    knockback: 80,
    pierce: 1,
    range: 900,
    slow: 0.5,
    auto: true,
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    fireRate: 16,
    damage: 4,
    magSize: 80,
    reserveMax: 240,
    reloadTime: 2.2,
    bulletSpeed: 380,
    spread: 0.5,
    pellets: 2,
    knockback: 20,
    pierce: 1,
    range: 260,
    burn: 6,
    auto: true,
  },
  arc_caster: {
    id: 'arc_caster',
    name: 'Arc Caster',
    fireRate: 2.6,
    damage: 14,
    magSize: 10,
    reserveMax: 60,
    reloadTime: 1.4,
    bulletSpeed: 620,
    spread: 0.04,
    pellets: 1,
    knockback: 40,
    pierce: 0,
    range: 700,
    chain: 3,
    auto: true,
  },
  rail_spike: {
    id: 'rail_spike',
    name: 'Rail Spike',
    fireRate: 0.9,
    damage: 85,
    magSize: 4,
    reserveMax: 20,
    reloadTime: 2.4,
    bulletSpeed: 1100,
    spread: 0,
    pellets: 1,
    knockback: 300,
    pierce: 5,
    range: 1200,
    chargeTime: 0.85,
    auto: false,
  },
};

export const MYSTERY_BOX_POOL: WeaponId[] = ['riot_shotgun', 'auto_smg', 'cryo_rifle', 'flamethrower', 'arc_caster', 'rail_spike'];

const PERK_ROLLS = [
  '+20% fire rate',
  '+15% damage',
  'shots pierce one target',
  '10% chance kills drop bonus points',
  '+25% reload speed',
  'no perk roll',
];

function pickWeighted(): Rarity {
  const total = RARITY_WEIGHTS.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITY_WEIGHTS) {
    if (roll < r.weight) return r.rarity;
    roll -= r.weight;
  }
  return 'common';
}

function multsForRarity(rarity: Rarity): { fireRateMult: number; damageMult: number } {
  const rarityIndex = RARITY_ORDER.indexOf(rarity);
  return { fireRateMult: 1 + rarityIndex * 0.08, damageMult: 1 + rarityIndex * 0.12 };
}

export function rollWeapon(pool: WeaponId[]): WeaponRoll {
  const weaponId = pool[Math.floor(Math.random() * pool.length)];
  const rarity = pickWeighted();
  const perkLabel = PERK_ROLLS[Math.floor(Math.random() * PERK_ROLLS.length)];
  return { weaponId, rarity, perkLabel, ...multsForRarity(rarity) };
}

/** Pack-a-Punch style workbench upgrade: bump one rarity tier and reroll the perk. */
export function upgradeWeaponRoll(roll: WeaponRoll): WeaponRoll {
  const currentIndex = RARITY_ORDER.indexOf(roll.rarity);
  const nextRarity = RARITY_ORDER[Math.min(currentIndex + 1, RARITY_ORDER.length - 1)];
  const perkLabel = PERK_ROLLS[Math.floor(Math.random() * PERK_ROLLS.length)];
  return { weaponId: roll.weaponId, rarity: nextRarity, perkLabel, ...multsForRarity(nextRarity) };
}

export function canUpgrade(roll: WeaponRoll): boolean {
  return RARITY_ORDER.indexOf(roll.rarity) < RARITY_ORDER.length - 1;
}

export function rarityColor(rarity: Rarity): string {
  return RARITY_COLOR[rarity];
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  pierce: number;
  knockback: number;
  slow?: number;
  burn?: number;
  chain?: number;
  radius: number;
  alive: boolean;
  distanceLeft: number;
}

export function spawnProjectiles(
  weapon: WeaponDef,
  roll: WeaponRoll,
  x: number,
  y: number,
  aimAngle: number,
  color: string,
): Projectile[] {
  const out: Projectile[] = [];
  for (let i = 0; i < weapon.pellets; i++) {
    const spread = (Math.random() - 0.5) * weapon.spread;
    const angle = aimAngle + spread;
    out.push({
      x,
      y,
      vx: Math.cos(angle) * weapon.bulletSpeed,
      vy: Math.sin(angle) * weapon.bulletSpeed,
      damage: weapon.damage * roll.damageMult,
      color,
      pierce: weapon.pierce,
      knockback: weapon.knockback,
      slow: weapon.slow,
      burn: weapon.burn,
      chain: weapon.chain,
      radius: 4,
      alive: true,
      distanceLeft: weapon.range,
    });
  }
  return out;
}
