import type { EnemyKind } from './types';
import { Enemy } from './Entities';

interface KindDef {
  hpMult: number;
  speedMult: number;
  dmgMult: number;
  radiusMult: number;
}

const KIND_DEFS: Record<Exclude<EnemyKind, 'boss'>, KindDef> = {
  runner: { hpMult: 1, speedMult: 1, dmgMult: 1, radiusMult: 1 },
  fast: { hpMult: 0.5, speedMult: 1.75, dmgMult: 0.65, radiusMult: 0.75 },
  tank: { hpMult: 3.4, speedMult: 0.55, dmgMult: 1.8, radiusMult: 1.4 },
  spitter: { hpMult: 0.7, speedMult: 0.68, dmgMult: 0.5, radiusMult: 0.9 },
  vampire: { hpMult: 1.3, speedMult: 1.05, dmgMult: 1.1, radiusMult: 1.05 },
  explosive: { hpMult: 0.6, speedMult: 1.15, dmgMult: 0, radiusMult: 0.95 },
};

interface WeightEntry {
  kind: Exclude<EnemyKind, 'boss'>;
  weight: number;
}

function weightsForRound(round: number): WeightEntry[] {
  const w: WeightEntry[] = [{ kind: 'runner', weight: 55 }, { kind: 'fast', weight: 25 }];
  if (round >= 3) {
    w.push({ kind: 'tank', weight: 14 }, { kind: 'spitter', weight: 12 });
  }
  if (round >= 5) {
    w.push({ kind: 'vampire', weight: 10 }, { kind: 'explosive', weight: 9 });
  }
  return w;
}

export function pickEnemyKind(round: number): Exclude<EnemyKind, 'boss'> {
  const weights = weightsForRound(round);
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weights) {
    if (roll < w.weight) return w.kind;
    roll -= w.weight;
  }
  return 'runner';
}

export function createEnemy(x: number, y: number, kind: Exclude<EnemyKind, 'boss'>, round: number): Enemy {
  const def = KIND_DEFS[kind];
  const baseHp = 32 + round * 6;
  const baseSpeed = 105 + Math.min(round * 3, 60);
  const baseDamage = 10;
  return new Enemy(x, y, kind, baseHp * def.hpMult, baseSpeed * def.speedMult, baseDamage * def.dmgMult, def.radiusMult);
}

export function createBoss(x: number, y: number, round: number): Enemy {
  const baseHp = 32 + round * 6;
  const boss = new Enemy(x, y, 'boss', baseHp * 16, 95, 26 + round * 1.5, 2.2);
  boss.bossState = 'approach';
  boss.bossTimer = 1.5;
  return boss;
}
