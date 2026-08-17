export type SkillBranch = 'survival' | 'offense' | 'mobility' | 'fortune';

export interface SkillNode {
  id: string;
  label: string;
  desc: string;
  branch: SkillBranch;
  col: number;
  row: number;
  cost: number;
  requires: string[];
}

export const BRANCH_COLOR: Record<SkillBranch, string> = {
  survival: '#3ddc73',
  offense: '#e04b3d',
  mobility: '#5fb8ff',
  fortune: '#ffd23d',
};

export const BRANCH_LABEL: Record<SkillBranch, string> = {
  survival: 'SURVIVAL',
  offense: 'OFFENSE',
  mobility: 'MOBILITY',
  fortune: 'FORTUNE',
};

export const SKILL_NODES: SkillNode[] = [
  // --- survival ---
  { id: 'vit1', label: 'Vitality I', desc: '+15 max health', branch: 'survival', col: 0, row: 0, cost: 120, requires: [] },
  { id: 'vit2', label: 'Vitality II', desc: '+20 max health', branch: 'survival', col: 0, row: 1, cost: 240, requires: ['vit1'] },
  { id: 'regen', label: 'Field Kit', desc: 'Regenerate 1 HP every 2s', branch: 'survival', col: 0, row: 2, cost: 320, requires: ['vit1'] },
  { id: 'secondwind', label: 'Second Wind', desc: '+1 self-revive when downed', branch: 'survival', col: 0, row: 3, cost: 520, requires: ['vit2'] },

  // --- offense ---
  { id: 'dmg1', label: 'Hollow Points', desc: '+10% weapon damage', branch: 'offense', col: 1, row: 0, cost: 120, requires: [] },
  { id: 'dmg2', label: 'Overcharge', desc: '+12% weapon damage', branch: 'offense', col: 1, row: 1, cost: 260, requires: ['dmg1'] },
  { id: 'rof', label: 'Trigger Discipline', desc: '+10% fire rate', branch: 'offense', col: 1, row: 2, cost: 300, requires: ['dmg1'] },
  { id: 'execute', label: 'Executioner', desc: '+40% damage to enemies under 30% HP', branch: 'offense', col: 1, row: 3, cost: 520, requires: ['dmg2'] },

  // --- mobility ---
  { id: 'dash1', label: 'Light Step', desc: '-10% dash cooldown', branch: 'mobility', col: 2, row: 0, cost: 120, requires: [] },
  { id: 'spd1', label: 'Adrenaline', desc: '+6% move speed', branch: 'mobility', col: 2, row: 1, cost: 220, requires: ['dash1'] },
  { id: 'iframe', label: 'Ghost Roll', desc: '+60% dash invulnerability', branch: 'mobility', col: 2, row: 2, cost: 320, requires: ['dash1'] },
  { id: 'phase', label: 'Phase Drive', desc: '-15% dash cooldown', branch: 'mobility', col: 2, row: 3, cost: 480, requires: ['iframe'] },

  // --- fortune ---
  { id: 'pts1', label: 'Scavenger', desc: '+150 starting points', branch: 'fortune', col: 3, row: 0, cost: 120, requires: [] },
  { id: 'gain1', label: 'Bounty Hunter', desc: '+15% points from kills', branch: 'fortune', col: 3, row: 1, cost: 240, requires: ['pts1'] },
  { id: 'vault', label: 'Vault Cracker', desc: 'Treasure caches pay double', branch: 'fortune', col: 3, row: 2, cost: 300, requires: ['pts1'] },
  { id: 'tokens', label: 'Salvager', desc: '+30% tokens earned per run', branch: 'fortune', col: 3, row: 3, cost: 460, requires: ['gain1'] },
];

export interface SkillEffects {
  maxHpBonus: number;
  regenPerSec: number;
  reviveCharges: number;
  damageMult: number;
  fireRateMult: number;
  executionerBonus: number;
  dashCdMult: number;
  moveSpeedMult: number;
  /** Multiplier on reload duration - lowered by in-run field upgrades. */
  reloadMult: number;
  iframeMult: number;
  startPoints: number;
  pointGainMult: number;
  treasureMult: number;
  tokenMult: number;
}

export function computeEffects(owned: string[]): SkillEffects {
  const has = (id: string) => owned.includes(id);
  return {
    maxHpBonus: (has('vit1') ? 15 : 0) + (has('vit2') ? 20 : 0),
    regenPerSec: has('regen') ? 0.5 : 0,
    reviveCharges: has('secondwind') ? 1 : 0,
    damageMult: 1 + (has('dmg1') ? 0.1 : 0) + (has('dmg2') ? 0.12 : 0),
    fireRateMult: 1 + (has('rof') ? 0.1 : 0),
    executionerBonus: has('execute') ? 0.4 : 0,
    dashCdMult: Math.max(0.4, 1 - (has('dash1') ? 0.1 : 0) - (has('phase') ? 0.15 : 0)),
    moveSpeedMult: 1 + (has('spd1') ? 0.06 : 0),
    reloadMult: 1,
    iframeMult: 1 + (has('iframe') ? 0.6 : 0),
    startPoints: has('pts1') ? 150 : 0,
    pointGainMult: 1 + (has('gain1') ? 0.15 : 0),
    treasureMult: has('vault') ? 2 : 1,
    tokenMult: 1 + (has('tokens') ? 0.3 : 0),
  };
}

export function isUnlockable(node: SkillNode, owned: string[]): boolean {
  return !owned.includes(node.id) && node.requires.every((r) => owned.includes(r));
}
