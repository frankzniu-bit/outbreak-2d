import { RARITY_WEIGHTS, RARITY_ORDER, type CharacterId, type Rarity } from './types';
import { META_STORAGE_KEY, SETTINGS_STORAGE_KEY } from './constants';

export interface MetaState {
  essence: number;
  tokens: number;
  ultimatesUnlocked: Record<CharacterId, boolean>;
  classesUnlocked: Record<CharacterId, boolean>;
  skills: string[];
  companionLevel: number;
  companionRarity: Rarity;
  companionBoxPulls: number;
}

function defaultMeta(): MetaState {
  return {
    essence: 0,
    tokens: 0,
    ultimatesUnlocked: { recon: false, brawler: false, medic: false, phantom: false, warden: false, revenant: false },
    classesUnlocked: { recon: true, brawler: true, medic: true, phantom: false, warden: false, revenant: false },
    skills: [],
    companionLevel: 0,
    companionRarity: 'common',
    companionBoxPulls: 0,
  };
}

export function loadMeta(): MetaState {
  const base = defaultMeta();
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      ...base,
      ...parsed,
      ultimatesUnlocked: { ...base.ultimatesUnlocked, ...parsed.ultimatesUnlocked },
      classesUnlocked: { ...base.classesUnlocked, ...parsed.classesUnlocked },
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    };
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

export function tokensForRun(roundsSurvived: number, kills: number, tokenMult: number): number {
  return Math.round((8 + roundsSurvived * 4 + kills * 2) * tokenMult);
}

export const ULTIMATE_UNLOCK_COST = 400;

export const COMPANION_LEVEL_CAP = 5;

export function companionLevelCost(level: number): number | null {
  return level < COMPANION_LEVEL_CAP ? 120 + level * 90 : null;
}

export const COMPANION_BOX_BASE_COST = 100;
export const COMPANION_BOX_COST_STEP = 55;

export function companionBoxCost(pulls: number): number {
  return COMPANION_BOX_BASE_COST + pulls * COMPANION_BOX_COST_STEP;
}

/** Rolls a fresh rarity weighted like weapon drops, but never downgrades - a box pull is never a loss. */
export function rollCompanionRarity(current: Rarity): Rarity {
  const total = RARITY_WEIGHTS.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  let picked: Rarity = 'common';
  for (const r of RARITY_WEIGHTS) {
    if (roll < r.weight) {
      picked = r.rarity;
      break;
    }
    roll -= r.weight;
  }
  return RARITY_ORDER.indexOf(picked) > RARITY_ORDER.indexOf(current) ? picked : current;
}
