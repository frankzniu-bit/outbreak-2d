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
}

export const CHARACTER_DEFS: Record<CharacterId, CharacterDef> = {
  recon: {
    id: 'recon',
    name: 'Recon',
    color: '#3ddc73',
    passiveLabel: 'Wider vision radius, faster dash recovery',
    activeLabel: 'Flare — reveals & slows an area',
    activeCooldown: 8,
    visionMult: 1.45,
    maxHp: 82,
    moveSpeed: 248,
    meleeDamageMult: 0.9,
    dashCooldownBase: 0.72,
    ultimateLabel: 'Airstrike Marker — calls down a devastating blast',
    ultimateCooldown: 50,
    ultimateColor: '#8dffb0',
  },
  brawler: {
    id: 'brawler',
    name: 'Brawler',
    color: '#e04b3d',
    passiveLabel: 'Melee kills restore health, hits harder',
    activeLabel: 'Shockwave — knockback + damage nearby',
    activeCooldown: 9,
    visionMult: 1,
    maxHp: 132,
    moveSpeed: 202,
    meleeDamageMult: 1.6,
    dashCooldownBase: 0.9,
    ultimateLabel: 'Rampage — massive melee & speed buff, lifesteal',
    ultimateCooldown: 55,
    ultimateColor: '#ff8a7a',
  },
  medic: {
    id: 'medic',
    name: 'Medic',
    color: '#3d9bdc',
    passiveLabel: 'Slow passive health regen',
    activeLabel: 'Healing pulse — restore HP in an area',
    activeCooldown: 10,
    visionMult: 1.1,
    maxHp: 102,
    moveSpeed: 222,
    meleeDamageMult: 1,
    dashCooldownBase: 0.9,
    ultimateLabel: 'Overwatch Pulse — full heal + damage-reducing shield',
    ultimateCooldown: 50,
    ultimateColor: '#9fd6ff',
  },
};

export const CHARACTER_ORDER: CharacterId[] = ['recon', 'brawler', 'medic'];
