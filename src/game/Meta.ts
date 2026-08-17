import { RARITY_WEIGHTS, RARITY_ORDER, type CharacterId, type Rarity } from './types';
import { META_STORAGE_KEY } from './constants';

export interface MetaState {
  essence: number;
  tokens: number;
  ultimatesUnlocked: Record<CharacterId, boolean>;
  maxHpBoostTier: number;
  startPointsBoostTier: number;
  dashCooldownBoostTier: number;
  companionLevel: number;
  companionRarity: Rarity;
  companionBoxPulls: number;
}

function defaultMeta(): MetaState {
  return {
    essence: 0,
    tokens: 0,
    ultimatesUnlocked: { recon: false, brawler: false, medic: false },
    maxHpBoostTier: 0,
    startPointsBoostTier: 0,
    dashCooldownBoostTier: 0,
    companionLevel: 0,
    companionRarity: 'common',
    companionBoxPulls: 0,
  };
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return defaultMeta();
    const parsed = JSON.parse(raw);
    return { ...defaultMeta(), ...parsed, ultimatesUnlocked: { ...defaultMeta().ultimatesUnlocked, ...parsed.ultimatesUnlocked } };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta: MetaState) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // localStorage unavailable (private browsing, quota) - progress just won't persist
  }
}

export function essenceForRun(roundsSurvived: number, kills: number, depth: number): number {
  return 25 + roundsSurvived * 20 + kills * 3 + depth * 8;
}

export function tokensForRun(roundsSurvived: number, kills: number): number {
  return 8 + roundsSurvived * 4 + kills * 2;
}

export const ULTIMATE_UNLOCK_COST = 400;
export const MAX_HP_BOOST_COST = [150, 300, 500];
export const START_POINTS_BOOST_COST = [150, 300, 500];
export const DASH_COOLDOWN_BOOST_COST = [200, 400];

export const MAX_HP_BOOST_AMOUNT = 12; // per tier
export const START_POINTS_BOOST_AMOUNT = 150; // per tier
export const DASH_COOLDOWN_BOOST_AMOUNT = 0.08; // fraction reduction per tier

export function nextCost(costTable: number[], currentTier: number): number | null {
  return currentTier < costTable.length ? costTable[currentTier] : null;
}

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
