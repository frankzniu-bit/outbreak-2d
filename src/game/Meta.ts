import { RARITY_WEIGHTS, type CharacterId, type Rarity, type CompanionSpecies } from './types';
import { META_STORAGE_KEY, SETTINGS_STORAGE_KEY } from './constants';
import { SPECIES_ORDER, COMPANION_LEVEL_CAP, newCompanionId, type CompanionSave } from './Companions';

export interface MetaState {
  essence: number;
  tokens: number;
  ultimatesUnlocked: Record<CharacterId, boolean>;
  classesUnlocked: Record<CharacterId, boolean>;
  skills: string[];
  companions: CompanionSave[];
  activeCompanionId: string | null;
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
    ultimatesUnlocked: { recon: false, brawler: false, medic: false, phantom: false, warden: false, revenant: false },
    classesUnlocked: { recon: true, brawler: true, medic: true, phantom: false, warden: false, revenant: false },
    skills: [],
    companions: [starter],
    activeCompanionId: starter.id,
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
    };
    // never leave the player with nothing selected
    if (!meta.companions.some((c) => c.id === meta.activeCompanionId)) {
      meta.activeCompanionId = meta.companions[0]?.id ?? null;
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

export function activeCompanion(meta: MetaState): CompanionSave | null {
  return meta.companions.find((c) => c.id === meta.activeCompanionId) ?? meta.companions[0] ?? null;
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

export function companionLevelCost(level: number): number | null {
  return level < COMPANION_LEVEL_CAP ? 140 + level * 110 : null;
}

export const COMPANION_BOX_BASE_COST = 260;
export const COMPANION_BOX_COST_STEP = 110;

export function companionBoxCost(pulls: number): number {
  return COMPANION_BOX_BASE_COST + pulls * COMPANION_BOX_COST_STEP;
}

function rollRarity(): Rarity {
  const total = RARITY_WEIGHTS.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITY_WEIGHTS) {
    if (roll < r.weight) return r.rarity;
    roll -= r.weight;
  }
  return 'common';
}

/** A box pull yields a brand-new companion: random species, weighted rarity. */
export function rollNewCompanion(): CompanionSave {
  const species: CompanionSpecies = SPECIES_ORDER[Math.floor(Math.random() * SPECIES_ORDER.length)];
  return { id: newCompanionId(), species, level: 0, rarity: rollRarity() };
}
