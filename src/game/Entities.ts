import type { CharacterDef } from './Characters';
import type { WeaponRoll, EnemyKind } from './types';
import { WEAPON_DEFS } from './Weapons';
import { PLAYER_RADIUS, DASH_SPEED, DASH_DURATION, DASH_IFRAME, ENEMY_RADIUS } from './constants';

export interface OwnedWeapon {
  roll: WeaponRoll;
  ammoInMag: number;
  ammoReserve: number;
}

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  maxHp: number;
  aimAngle = 0;
  character: CharacterDef;

  dashTime = 0;
  dashCooldownTimer = 0;
  dashCooldownMax: number;
  dashDirX = 0;
  dashDirY = 0;
  iframeTimer = 0;

  weapons: OwnedWeapon[] = [];
  currentWeaponIndex = 0;
  fireCooldown = 0;
  reloadTimer = 0;
  reloading = false;
  chargeTime = 0;
  charging = false;

  meleeCooldown = 0;
  abilityCooldown = 0;

  ultimateUnlocked = false;
  ultimateCooldown = 0;
  ultimateActiveTimer = 0;
  visionBoostTimer = 0;

  points = 0;
  alive = true;
  regenAccum = 0;
  shieldFrac = 0; // 0..1 fraction of incoming damage blocked (medic ultimate)
  shieldTimer = 0;

  constructor(x: number, y: number, character: CharacterDef, dashCooldownMult: number, startingPoints: number, maxHpBonus = 0) {
    this.x = x;
    this.y = y;
    this.character = character;
    this.maxHp = character.maxHp + maxHpBonus;
    this.hp = this.maxHp;
    this.dashCooldownMax = character.dashCooldownBase * dashCooldownMult;
    this.points = startingPoints;
    const starter: OwnedWeapon = {
      roll: { weaponId: 'sidewinder', rarity: 'common', fireRateMult: 1, damageMult: 1, perkLabel: 'no perk roll' },
      ammoInMag: WEAPON_DEFS.sidewinder.magSize,
      ammoReserve: WEAPON_DEFS.sidewinder.reserveMax,
    };
    this.weapons.push(starter);
  }

  get currentWeapon(): OwnedWeapon {
    return this.weapons[this.currentWeaponIndex];
  }

  get isDashing(): boolean {
    return this.dashTime > 0;
  }

  get isInvincible(): boolean {
    return this.iframeTimer > 0;
  }

  addWeapon(roll: WeaponRoll) {
    const def = WEAPON_DEFS[roll.weaponId];
    const owned: OwnedWeapon = { roll, ammoInMag: def.magSize, ammoReserve: def.reserveMax };
    if (this.weapons.length < 2) {
      this.weapons.push(owned);
      this.currentWeaponIndex = this.weapons.length - 1;
    } else {
      this.weapons[this.currentWeaponIndex] = owned;
    }
  }

  takeDamage(amount: number): boolean {
    if (this.isInvincible || !this.alive) return false;
    const reduced = amount * (1 - this.shieldFrac);
    this.hp -= reduced;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }
}

const ENEMY_KIND_COLOR: Record<EnemyKind, string> = {
  runner: '#d64545',
  fast: '#ffd23d',
  tank: '#7a5236',
  spitter: '#6bcf5f',
  vampire: '#b13d8a',
  explosive: '#ff9d2e',
  boss: '#c22f2f',
};

export function enemyColor(kind: EnemyKind): string {
  return ENEMY_KIND_COLOR[kind];
}

export class Enemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  baseSpeed: number;
  damage: number;
  kind: EnemyKind;
  alive = true;
  slowTimer = 0;
  slowFactor = 1;
  hitFlash = 0;
  attackCooldown = 0;
  knockX = 0;
  knockY = 0;
  burnTimer = 0;
  burnDps = 0;
  burnTick = 0;

  // spitter
  rangedCooldown = 1.2;
  // vampire
  lifestealFrac = 0.35;
  // explosive
  armed = false;
  exploding = false;
  explodeTimer = 0;
  // boss
  bossState: 'approach' | 'windup' | 'lunge' | 'cooldown' = 'approach';
  bossTimer = 1.5;
  lungeDirX = 0;
  lungeDirY = 0;

  constructor(x: number, y: number, kind: EnemyKind, hp: number, speed: number, damage: number, radiusMult = 1) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.maxHp = hp;
    this.hp = hp;
    this.speed = speed;
    this.baseSpeed = speed;
    this.damage = damage;
    this.radius = ENEMY_RADIUS * radiusMult;
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }
}

export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  alive: boolean;
  distanceLeft: number;
}

export { PLAYER_RADIUS, DASH_SPEED, DASH_DURATION, DASH_IFRAME };
