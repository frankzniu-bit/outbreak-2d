import { WEAPON_DEFS, rarityColor } from './Weapons';
import type { Player } from './Entities';
import type { Level } from './Level';
import { companionTierName } from './Companion';
import type { Rarity } from './types';
import { VIEW_W, ROOM_W } from './constants';

export interface HudState {
  round: number;
  depth: number;
  enemiesRemaining: number;
  killStreak: number;
  intermissionTimer: number;
  tutorialTimer: number;
  controlsHint: string;
  boss: { hp: number; maxHp: number } | null;
  companion: { level: number; rarity: Rarity } | null;
}

const STATION_COLOR: Record<string, string> = {
  mysterybox: '#a24ddc',
  workbench: '#ff9d2e',
  treasure: '#ffd23d',
};

function roomLabel(content: string): string {
  switch (content) {
    case 'start':
      return 'FACILITY ENTRANCE';
    case 'mysterybox':
      return 'MYSTERY BOX';
    case 'workbench':
      return 'WORKBENCH';
    case 'treasure':
      return 'TREASURE VAULT';
    default:
      return 'OPEN AREA';
  }
}

export function drawHud(ctx: CanvasRenderingContext2D, player: Player, level: Level, hud: HudState) {
  // --- top center: round + enemies remaining ---
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8e8ea';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`ROUND ${hud.round}  ·  DEPTH ${hud.depth}`, VIEW_W / 2, 30);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#9aa0ac';
  const enemyLabel = hud.intermissionTimer > 0 ? 'Next round incoming...' : `${hud.enemiesRemaining} infected remaining`;
  ctx.fillText(enemyLabel, VIEW_W / 2, 50);

  if (hud.killStreak >= 3) {
    ctx.fillStyle = '#ff9d2e';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${hud.killStreak}x KILL STREAK`, VIEW_W / 2, 70);
  }

  if (hud.boss) {
    const bw = 320;
    const bx = VIEW_W / 2 - bw / 2;
    const by = 78;
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#c22f2f';
    ctx.fillRect(bx, by, bw * Math.max(0, hud.boss.hp / hud.boss.maxHp), 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(bx, by, bw, 10);
    ctx.fillStyle = '#ff8a7a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('BLACKROCK BRUTE', VIEW_W / 2, by - 4);
  }

  // --- minimap top right: discrete room boxes with connectors, since the facility is endless ---
  const mmW = 170;
  const boxSize = 28;
  const gap = 4;
  const roomsToShow = 5;
  const mmX = VIEW_W - mmW - 16;
  const mmY = 16;
  const mmH = boxSize + 10;

  ctx.fillStyle = 'rgba(10,12,16,0.78)';
  ctx.fillRect(mmX, mmY, mmW, mmH);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(mmX, mmY, mmW, mmH);

  const currentRoomIdx = Math.min(level.rooms.length - 1, Math.max(0, Math.floor(player.x / ROOM_W)));
  let startIdx = currentRoomIdx - 2;
  if (startIdx < 0) startIdx = 0;
  if (startIdx + roomsToShow > level.rooms.length) startIdx = Math.max(0, level.rooms.length - roomsToShow);
  const totalRoomsW = roomsToShow * boxSize + (roomsToShow - 1) * gap;
  const startX = mmX + (mmW - totalRoomsW) / 2;

  for (let i = 0; i < roomsToShow; i++) {
    const roomIdx = startIdx + i;
    const room = level.rooms[roomIdx];
    const bx = startX + i * (boxSize + gap);
    const by = mmY + 5;
    if (!room) continue;

    const isCurrent = roomIdx === currentRoomIdx;
    ctx.fillStyle = isCurrent ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(bx, by, boxSize, boxSize);
    ctx.strokeStyle = isCurrent ? player.character.color : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = isCurrent ? 2 : 1;
    ctx.strokeRect(bx, by, boxSize, boxSize);

    const station = level.stations.find((s) => s.roomIndex === roomIdx && !s.collected);
    if (station) {
      ctx.fillStyle = STATION_COLOR[station.kind] ?? '#e8e8ea';
      ctx.fillRect(bx + 3, by + 3, 6, 6);
    }

    if (i < roomsToShow - 1 && level.rooms[roomIdx + 1]) {
      const door = level.doors[roomIdx];
      const midY = by + boxSize / 2;
      ctx.strokeStyle = door && door.open ? '#3ddc73' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + boxSize, midY);
      ctx.lineTo(bx + boxSize + gap, midY);
      ctx.stroke();
    }
  }

  ctx.textAlign = 'center';
  ctx.font = '9px monospace';
  ctx.fillStyle = '#9aa0ac';
  ctx.fillText(roomLabel(level.rooms[currentRoomIdx]?.content ?? 'empty'), mmX + mmW / 2, mmY + mmH + 12);

  // --- bottom bar ---
  const barY = 600 - 70;

  // status effect chips, floating just above the bar
  const chips: { label: string; color: string }[] = [];
  if (player.shieldFrac > 0) chips.push({ label: 'SHIELD', color: '#9fd6ff' });
  if (player.character.id === 'brawler' && player.ultimateActiveTimer > 0) chips.push({ label: 'RAMPAGE', color: '#ff8a7a' });
  if (player.visionBoostTimer > 0) chips.push({ label: 'FLARE', color: '#8dffb0' });
  let chipX = 16;
  for (const chip of chips) {
    ctx.font = 'bold 10px monospace';
    const w = ctx.measureText(chip.label).width + 16;
    ctx.fillStyle = 'rgba(10,12,16,0.85)';
    ctx.fillRect(chipX, barY - 24, w, 18);
    ctx.strokeStyle = chip.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(chipX, barY - 24, w, 18);
    ctx.fillStyle = chip.color;
    ctx.textAlign = 'center';
    ctx.fillText(chip.label, chipX + w / 2, barY - 11);
    chipX += w + 6;
  }

  ctx.fillStyle = 'rgba(10,12,16,0.8)';
  ctx.fillRect(0, barY, VIEW_W, 70);

  // health
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#9aa0ac';
  ctx.fillText('HP', 16, barY + 16);
  const hpBarW = 140;
  ctx.fillStyle = '#2a1414';
  ctx.fillRect(16, barY + 22, hpBarW, 14);
  const hpFrac = Math.max(0, player.hp / player.maxHp);
  ctx.fillStyle = hpFrac > 0.35 ? '#3ddc73' : '#e04b3d';
  ctx.fillRect(16, barY + 22, hpBarW * hpFrac, 14);
  if (player.shieldFrac > 0) {
    ctx.strokeStyle = '#9fd6ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, barY + 22, hpBarW, 14);
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(16, barY + 22, hpBarW, 14);
  }
  ctx.fillStyle = '#e8e8ea';
  ctx.font = '11px monospace';
  ctx.fillText(`${Math.ceil(player.hp)}/${player.maxHp}`, 20, barY + 33);

  // weapon
  const weapon = player.currentWeapon;
  const def = WEAPON_DEFS[weapon.roll.weaponId];
  const color = rarityColor(weapon.roll.rarity);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = color;
  ctx.fillText(def.name, 175, barY + 20);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#9aa0ac';
  ctx.fillText(weapon.roll.perkLabel, 175, barY + 34);
  ctx.fillStyle = '#e8e8ea';
  ctx.font = 'bold 13px monospace';
  const ammoText = player.charging ? 'CHARGING...' : player.reloading ? 'RELOADING' : `${weapon.ammoInMag} / ${weapon.ammoReserve}`;
  ctx.fillText(ammoText, 175, barY + 50);

  // companion
  if (hud.companion) {
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = rarityColor(hud.companion.rarity);
    ctx.fillText(companionTierName(hud.companion.level).toUpperCase(), 345, barY + 20);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#9aa0ac';
    ctx.fillText(hud.companion.rarity.toUpperCase(), 345, barY + 33);
  }

  // points
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#ffd23d';
  ctx.fillText(`${player.points}`, VIEW_W - 16, barY + 24);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#9aa0ac';
  ctx.fillText('POINTS', VIEW_W - 16, barY + 38);

  // ability + ultimate cooldowns
  ctx.textAlign = 'right';
  const abilityFrac = player.abilityCooldown > 0 ? 1 - player.abilityCooldown / player.character.activeCooldown : 1;
  ctx.fillStyle = '#9aa0ac';
  ctx.font = '10px monospace';
  ctx.fillText('[E] ' + player.character.name.toUpperCase(), VIEW_W - 16, barY + 14);
  const abW = 100;
  ctx.fillStyle = '#1a1c22';
  ctx.fillRect(VIEW_W - 16 - abW, barY + 18, abW, 5);
  ctx.fillStyle = abilityFrac >= 1 ? player.character.color : '#555';
  ctx.fillRect(VIEW_W - 16 - abW, barY + 18, abW * Math.max(0, Math.min(1, abilityFrac)), 5);

  ctx.fillStyle = '#9aa0ac';
  ctx.font = '10px monospace';
  if (player.ultimateUnlocked) {
    const ultFrac = player.ultimateCooldown > 0 ? 1 - player.ultimateCooldown / player.character.ultimateCooldown : 1;
    ctx.fillText('[X] ULTIMATE', VIEW_W - 16, barY + 38);
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(VIEW_W - 16 - abW, barY + 42, abW, 5);
    ctx.fillStyle = ultFrac >= 1 ? player.character.ultimateColor : '#555';
    ctx.fillRect(VIEW_W - 16 - abW, barY + 42, abW * Math.max(0, Math.min(1, ultFrac)), 5);
  } else {
    ctx.fillStyle = '#555a66';
    ctx.fillText('[X] ULTIMATE — LOCKED', VIEW_W - 16, barY + 38);
  }

  // tutorial prompts
  if (hud.tutorialTimer > 0) {
    ctx.textAlign = 'center';
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(232,232,234,0.9)';
    ctx.fillText(hud.controlsHint, VIEW_W / 2, 96);
    ctx.fillText('Head to the orange door to spend points and push forward', VIEW_W / 2, 114);
  }
}
