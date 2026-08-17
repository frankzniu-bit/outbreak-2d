import type { CharacterId } from './types';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  color: string;
  passiveLabel: string;
  activeLabel: string;
  activeCooldown: number;
  visionMult: number;
  maxHp: number;
  moveSpeed: number;
  meleeDamageMult: number;
  dashCooldownBase: number;
  ultimateLabel: string;
  ultimateCooldown: number;
  ultimateColor: string;
  /** 0 = available from the start; otherwise the essence price to unlock. */
  unlockCost: number;
  tagline: string;
}

export const CHARACTER_DEFS: Record<CharacterId, CharacterDef> = {
  recon: {
    id: 'recon',
    name: 'Recon',
    color: '#3ddc73',
    passiveLabel: 'Wider vision, faster dash recovery',
    activeLabel: 'Flare — reveals & slows an area',
    activeCooldown: 8,
    visionMult: 1.45,
    maxHp: 82,
    moveSpeed: 248,
    meleeDamageMult: 0.9,
    dashCooldownBase: 0.72,
    ultimateLabel: 'Airstrike — devastating targeted blast',
    ultimateCooldown: 50,
    ultimateColor: '#8dffb0',
    unlockCost: 0,
    tagline: 'SCOUT',
  },
  brawler: {
    id: 'brawler',
    name: 'Brawler',
    color: '#e04b3d',
    passiveLabel: 'Melee kills heal, melee hits harder',
    activeLabel: 'Shockwave — knockback + damage',
    activeCooldown: 9,
    visionMult: 1,
    maxHp: 132,
    moveSpeed: 202,
    meleeDamageMult: 1.6,
    dashCooldownBase: 0.9,
    ultimateLabel: 'Rampage — huge melee & speed, lifesteal',
    ultimateCooldown: 55,
    ultimateColor: '#ff8a7a',
    unlockCost: 0,
    tagline: 'BRUISER',
  },
  medic: {
    id: 'medic',
    name: 'Medic',
    color: '#3d9bdc',
    passiveLabel: 'Passive regen, revives allies faster',
    activeLabel: 'Healing pulse — restore HP nearby',
    activeCooldown: 10,
    visionMult: 1.1,
    maxHp: 102,
    moveSpeed: 222,
    meleeDamageMult: 1,
    dashCooldownBase: 0.9,
    ultimateLabel: 'Overwatch — full heal + damage shield',
    ultimateCooldown: 50,
    ultimateColor: '#9fd6ff',
    unlockCost: 0,
    tagline: 'SUPPORT',
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    color: '#b06bff',
    passiveLabel: 'Very fast, dash leaves a damaging trail',
    activeLabel: 'Blink — teleport to your cursor',
    activeCooldown: 6,
    visionMult: 1.2,
    maxHp: 76,
    moveSpeed: 286,
    meleeDamageMult: 1.15,
    dashCooldownBase: 0.55,
    ultimateLabel: 'Time Fracture — near-freeze every enemy',
    ultimateCooldown: 52,
    ultimateColor: '#d9b3ff',
    unlockCost: 600,
    tagline: 'ASSASSIN',
  },
  warden: {
    id: 'warden',
    name: 'Warden',
    color: '#ffb038',
    passiveLabel: 'Heavily armoured — takes 20% less damage',
    activeLabel: 'Deploy Turret — auto-firing sentry',
    activeCooldown: 12,
    visionMult: 1.05,
    maxHp: 150,
    moveSpeed: 196,
    meleeDamageMult: 1.25,
    dashCooldownBase: 1,
    ultimateLabel: 'Fortress — invulnerable + triple turrets',
    ultimateCooldown: 60,
    ultimateColor: '#ffd98a',
    unlockCost: 900,
    tagline: 'ENGINEER',
  },
  revenant: {
    id: 'revenant',
    name: 'Revenant',
    color: '#ff4d8d',
    passiveLabel: 'All damage you deal heals you (lifesteal)',
    activeLabel: 'Soul Harvest — drain nearby enemies',
    activeCooldown: 9,
    visionMult: 1.15,
    maxHp: 108,
    moveSpeed: 232,
    meleeDamageMult: 1.35,
    dashCooldownBase: 0.8,
    ultimateLabel: 'Undying — cannot die for 10s, then erupt',
    ultimateCooldown: 58,
    ultimateColor: '#ff9ec4',
    unlockCost: 1200,
    tagline: 'REAPER',
  },
};

export const CHARACTER_ORDER: CharacterId[] = ['recon', 'brawler', 'medic', 'phantom', 'warden', 'revenant'];
