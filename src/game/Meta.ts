import { RARITY_WEIGHTS, SECRET_CHARACTER, type CharacterId, type Rarity, type CompanionSpecies } from './types';
import { META_STORAGE_KEY, SETTINGS_STORAGE_KEY } from './constants';
import { SPECIES_ORDER, COMPANION_LEVEL_CAP, newCompanionId, type CompanionSave } from './Companions';

export interface MetaState {
  essence: number;
  tokens: number;
  ultimatesUnlocked: Record<CharacterId, boolean>;
  classesUnlocked: Record<CharacterId, boolean>;
  skills: string[];
  companions: CompanionSave[];
  /** Every companion currently deployed. Length is capped by the Pack Bond skills. */
  activeCompanionIds: string[];
  extraSlots: number; // 0..2 purchased beyond the base three
  companionBoxPulls: number;
}

export const BASE_COMPANION_SLOTS = 3;
export const MAX_COMPANION_SLOTS = 5;
/** Cost in tokens of the 4th and then the 5th slot. */
export const SLOT_COSTS = [900, 2400];

function starterCompanion(): CompanionSave {
  return { id: newCompanionId(), species: 'drone', level: 0, rarity: 'common' };
}

function defaultMeta(): MetaState {
  const starter = starterCompanion();
  return {
    essence: 0,
    tokens: 0,
    ultimatesUnlocked: { recon: false, brawler: false, medic: false, phantom: false, warden: false, revenant: false, harbinger: false },
    classesUnlocked: { recon: true, brawler: true, medic: true, phantom: false, warden: false, revenant: false, harbinger: false },
    skills: [],
    companions: [starter],
    activeCompanionIds: [starter.id],
    extraSlots: 0,
    companionBoxPulls: 0,
  };
}

export function loadMeta(): MetaState {
  const base = defaultMeta();
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const meta: MetaState = {
      ...base,
      ...parsed,
      ultimatesUnlocked: { ...base.ultimatesUnlocked, ...parsed.ultimatesUnlocked },
      classesUnlocked: { ...base.classesUnlocked, ...parsed.classesUnlocked },
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      companions: Array.isArray(parsed.companions) && parsed.companions.length ? parsed.companions : base.companions,
      activeCompanionIds: Array.isArray(parsed.activeCompanionIds)
        ? parsed.activeCompanionIds
        // saves from before multi-deploy stored a single id
        : parsed.activeCompanionId
          ? [parsed.activeCompanionId]
          : [],
    };
    // drop ids for companions that no longer exist, and never leave the player
    // with nothing deployed
    meta.activeCompanionIds = meta.activeCompanionIds.filter((id) => meta.companions.some((c) => c.id === id));
    if (!meta.activeCompanionIds.length && meta.companions[0]) {
      meta.activeCompanionIds = [meta.companions[0].id];
    }
    return meta;
  } catch {
    return base;
  }
}

export function saveMeta(meta: MetaState) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // localStorage unavailable (private browsing, quota) - progress just won't persist
  }
}

export function companionSlots(meta: MetaState): number {
  return BASE_COMPANION_SLOTS + meta.extraSlots;
}

export function nextSlotCost(meta: MetaState): number | null {
  return meta.extraSlots < SLOT_COSTS.length ? SLOT_COSTS[meta.extraSlots] : null;
}

/** Every deployed companion, in roster order, trimmed to the deploy limit. */
export function activeCompanions(meta: MetaState, deployLimit: number): CompanionSave[] {
  const deployed = meta.companions.filter((c) => meta.activeCompanionIds.includes(c.id));
  if (!deployed.length && meta.companions[0]) return [meta.companions[0]];
  return deployed.slice(0, Math.max(1, deployLimit));
}

export interface AudioSettings {
  muted: boolean;
  volume: number; // 0..1
}

export function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { muted: false, volume: 0.6 };
    const parsed = JSON.parse(raw);
    return { muted: !!parsed.muted, volume: typeof parsed.volume === 'number' ? parsed.volume : 0.6 };
  } catch {
    return { muted: false, volume: 0.6 };
  }
}

export function saveSettings(s: AudioSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // non-fatal
  }
}

export function essenceForRun(roundsSurvived: number, kills: number, depth: number): number {
  return 25 + roundsSurvived * 20 + kills * 3 + depth * 8;
}

/** Deliberately lean: tokens are the scarce currency that gates the companion box. */
export function tokensForRun(roundsSurvived: number, kills: number, tokenMult: number): number {
  return Math.round((4 + roundsSurvived * 3 + kills) * tokenMult);
}

export const ULTIMATE_UNLOCK_COST = 400;

/**
 * The secret class stays completely hidden until the player has bought
 * everything else: every other class, every other ultimate, and every skill.
 */
export function secretRevealed(meta: MetaState, allSkillIds: string[]): boolean {
  for (const id of Object.keys(meta.classesUnlocked) as CharacterId[]) {
    if (id === SECRET_CHARACTER) continue;
    if (!meta.classesUnlocked[id]) return false;
    if (!meta.ultimatesUnlocked[id]) return false;
  }
  return allSkillIds.every((s) => meta.skills.includes(s));
}

export function companionLevelCost(level: number): number | null {
  return level < COMPANION_LEVEL_CAP ? 140 + level * 110 : null;
}

export const COMPANION_BOX_BASE_COST = 260;
export const COMPANION_BOX_COST_STEP = 110;

export function companionBoxCost(pulls: number): number {
  return COMPANION_BOX_BASE_COST + pulls * COMPANION_BOX_COST_STEP;
}

// ---------------------------------------------------------------- the box
//
// Opening the box is a Brawl-Stars-style ritual rather than a single click:
// you whack it a fixed number of times, and every hit has a small chance to
// promote the box to a better tier before it finally cracks open.

export type BoxTier = 'standard' | 'reinforced' | 'gilded' | 'prismatic';

export interface BoxTierDef {
  id: BoxTier;
  label: string;
  color: string;
  /** Rarity weights used when this tier finally opens. */
  weights: { rarity: Rarity; weight: number }[];
  /** Extra starting tiers granted to whatever companion pops out. */
  bonusLevels: number;
}

export const BOX_TIER_ORDER: BoxTier[] = ['standard', 'reinforced', 'gilded', 'prismatic'];

export const BOX_TIER_DEFS: Record<BoxTier, BoxTierDef> = {
  standard: {
    id: 'standard',
    label: 'STANDARD CRATE',
    color: '#9aa3b0',
    weights: RARITY_WEIGHTS,
    bonusLevels: 0,
  },
  reinforced: {
    id: 'reinforced',
    label: 'REINFORCED CRATE',
    color: '#3ddc73',
    weights: [
      { rarity: 'common', weight: 22 },
      { rarity: 'uncommon', weight: 34 },
      { rarity: 'rare', weight: 25 },
      { rarity: 'epic', weight: 13 },
      { rarity: 'legendary', weight: 6 },
    ],
    bonusLevels: 0,
  },
  gilded: {
    id: 'gilded',
    label: 'GILDED CRATE',
    color: '#a24ddc',
    weights: [
      { rarity: 'common', weight: 6 },
      { rarity: 'uncommon', weight: 20 },
      { rarity: 'rare', weight: 33 },
      { rarity: 'epic', weight: 26 },
      { rarity: 'legendary', weight: 15 },
    ],
    bonusLevels: 1,
  },
  prismatic: {
    id: 'prismatic',
    label: 'PRISMATIC CRATE',
    color: '#ff9d2e',
    weights: [
      { rarity: 'rare', weight: 24 },
      { rarity: 'epic', weight: 43 },
      { rarity: 'legendary', weight: 33 },
    ],
    bonusLevels: 2,
  },
};

/** How many hits the box takes before it pops. */
export const BOX_HITS_REQUIRED = 5;
/** Chance per hit that the box promotes itself one tier. */
export const BOX_UPGRADE_CHANCE = 0.12;

export function nextBoxTier(tier: BoxTier): BoxTier | null {
  const i = BOX_TIER_ORDER.indexOf(tier);
  return i >= 0 && i < BOX_TIER_ORDER.length - 1 ? BOX_TIER_ORDER[i + 1] : null;
}

function rollRarity(weights: { rarity: Rarity; weight: number }[]): Rarity {
  const total = weights.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of weights) {
    if (roll < r.weight) return r.rarity;
    roll -= r.weight;
  }
  return weights[0]?.rarity ?? 'common';
}

/** A box pull yields a brand-new companion: random species, tier-weighted rarity. */
export function rollNewCompanion(tier: BoxTier = 'standard'): CompanionSave {
  const def = BOX_TIER_DEFS[tier];
  const species: CompanionSpecies = SPECIES_ORDER[Math.floor(Math.random() * SPECIES_ORDER.length)];
  return {
    id: newCompanionId(),
    species,
    level: Math.min(COMPANION_LEVEL_CAP, def.bonusLevels),
    rarity: rollRarity(def.weights),
  };
}
