import type { CharacterDef } from './Characters';
import type { WeaponRoll, EnemyKind } from './types';
import type { SkillEffects } from './SkillTree';
import { WEAPON_DEFS } from './Weapons';
import { PLAYER_RADIUS, DASH_SPEED, DASH_DURATION, DASH_IFRAME, ENEMY_RADIUS, DOWN_BLEEDOUT } from './constants';

export interface OwnedWeapon {
  roll: WeaponRoll;
  ammoInMag: number;
  ammoReserve: number;
}

export class Player {
  /** 0 = host / local, 1 = the joined co-op partner. */
  index: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  aimAngle = 0;
  character: CharacterDef;
  effects: SkillEffects;

  dashTime = 0;
  dashCooldownTimer = 0;
  dashCooldownMax: number;
  dashDirX = 0;
  dashDirY = 0;
  iframeTimer = 0;
  iframeDuration: number;

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
  undyingTimer = 0;

  points = 0;
  alive = true;
  downed = false;
  downTimer = 0;
  reviveProgress = 0;
  reviveCharges: number;
  regenAccum = 0;
  shieldFrac = 0;
  shieldTimer = 0;
  damageResist: number;

  constructor(index: number, x: number, y: number, character: CharacterDef, effects: SkillEffects) {
    this.index = index;
    this.x = x;
    this.y = y;
    this.character = character;
    this.effects = effects;
    this.maxHp = Math.round(character.maxHp + effects.maxHpBonus);
    this.hp = this.maxHp;
    this.dashCooldownMax = character.dashCooldownBase * effects.dashCdMult;
    this.iframeDuration = DASH_IFRAME * effects.iframeMult;
    this.reviveCharges = effects.reviveCharges;
    this.damageResist = character.id === 'warden' ? 0.2 : 0;
    this.points = effects.startPoints;
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
    return this.iframeTimer > 0 || this.undyingTimer > 0;
  }

  /** Can act: alive and not bleeding out on the floor. */
  get active(): boolean {
    return this.alive && !this.downed;
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

  /** Returns 'none' | 'hit' | 'downed'. Death is never instant - players bleed out first. */
  takeDamage(amount: number): 'none' | 'hit' | 'downed' {
    if (!this.active) return 'none';
    if (this.undyingTimer > 0) return 'none';
    if (this.iframeTimer > 0) return 'none';
    const reduced = amount * (1 - this.shieldFrac) * (1 - this.damageResist);
    this.hp -= reduced;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downed = true;
      this.downTimer = DOWN_BLEEDOUT;
      this.reviveProgress = 0;
      return 'downed';
    }
    return 'hit';
  }

  reviveTo(fraction: number) {
    this.downed = false;
    this.downTimer = 0;
    this.reviveProgress = 0;
    this.hp = Math.max(1, Math.round(this.maxHp * fraction));
    this.iframeTimer = Math.max(this.iframeTimer, 1.2);
  }
}

const ENEMY_KIND_COLOR: Record<EnemyKind, string> = {
  runner: '#d64545',
  fast: '#ffd23d',
  tank: '#a9743c',
  spitter: '#6bcf5f',
  vampire: '#c94ba0',
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
  wobble = Math.random() * Math.PI * 2;

  rangedCooldown = 1.2;
  lifestealFrac = 0.35;
  armed = false;
  explodeTimer = 0;
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

/** Warden's deployable sentry. */
export interface Turret {
  x: number;
  y: number;
  life: number;
  fireCooldown: number;
  damage: number;
  range: number;
  spin: number;
}

export { PLAYER_RADIUS, DASH_SPEED, DASH_DURATION, DASH_IFRAME };
