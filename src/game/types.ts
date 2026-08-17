export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#e8e8ea',
  uncommon: '#3ddc73',
  rare: '#3d9bdc',
  epic: '#a24ddc',
  legendary: '#ff9d2e',
};

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_WEIGHTS: { rarity: Rarity; weight: number }[] = [
  { rarity: 'common', weight: 45 },
  { rarity: 'uncommon', weight: 28 },
  { rarity: 'rare', weight: 16 },
  { rarity: 'epic', weight: 8 },
  { rarity: 'legendary', weight: 3 },
];

export interface Vec2 {
  x: number;
  y: number;
}

export type CharacterId = 'recon' | 'brawler' | 'medic' | 'phantom' | 'warden' | 'revenant' | 'harbinger';

/** Hidden until every other class, ultimate and skill has been bought. */
export const SECRET_CHARACTER: CharacterId = 'harbinger';

export type PowerUpKind = 'instakill' | 'doublepoints' | 'nuke' | 'maxammo';

export type BossType = 'brute' | 'titan' | 'hive' | 'screamer';

export type WeaponId =
  | 'sidewinder'
  | 'riot_shotgun'
  | 'auto_smg'
  | 'cryo_rifle'
  | 'flamethrower'
  | 'arc_caster'
  | 'rail_spike';

export interface WeaponRoll {
  weaponId: WeaponId;
  rarity: Rarity;
  fireRateMult: number;
  damageMult: number;
  perkLabel: string;
}

export type EnemyKind = 'runner' | 'fast' | 'tank' | 'spitter' | 'vampire' | 'explosive' | 'boss';

export type CompanionSpecies =
  | 'drone'
  | 'walker'
  | 'swarm'
  | 'wraith'
  | 'hound'
  | 'sentinel'
  | 'scarab'
  | 'seraph';

export type RoomContent = 'start' | 'mysterybox' | 'workbench' | 'treasure' | 'upgrade' | 'ammo' | 'empty';

export type StationKind = 'mysterybox' | 'workbench' | 'treasure' | 'upgrade' | 'ammo';

export type FieldUpgrade = 'vitality' | 'power' | 'haste' | 'reload';
