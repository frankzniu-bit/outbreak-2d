import { WEAPON_DEFS, rarityColor } from './Weapons';
import type { Player } from './Entities';
import type { Level } from './Level';
import type { Rarity } from './types';
import { VIEW_W, VIEW_H, ROOM_W, DOWN_BLEEDOUT } from './constants';

export interface HudPartner {
  name: string;
  color: string;
  hp: number;
  maxHp: number;
  downed: boolean;
  downTimer: number;
}

export interface HudState {
  round: number;
  depth: number;
  enemiesRemaining: number;
  killStreak: number;
  intermissionTimer: number;
  tutorialTimer: number;
  controlsHint: string;
  boss: { hp: number; maxHp: number } | null;
  companion: { name: string; rarity: Rarity } | null;
  partner: HudPartner | null;
  muted: boolean;
  netStatus: string | null;
}

const STATION_COLOR: Record<string, string> = {
  mysterybox: '#a24ddc',
  workbench: '#ff9d2e',
  treasure: '#ffd23d',
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function heartIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.75);
  ctx.bezierCurveTo(cx - s * 1.3, cy - s * 0.15, cx - s * 0.5, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 1.1, cx + s * 1.3, cy - s * 0.15, cx, cy + s * 0.75);
  ctx.closePath();
  ctx.fill();
}

function shieldIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.8, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.8, cy + s * 0.25);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s * 0.8, cy + s * 0.25);
  ctx.lineTo(cx - s * 0.8, cy - s * 0.5);
  ctx.closePath();
  ctx.fill();
}

function diamondIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s, cy);
  ctx.closePath();
  ctx.fill();
}

/** Soul Knight style stat row: icon, chunky segmented bar, numeric readout. */
function statRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  icon: 'heart' | 'shield' | 'diamond',
  fillColor: string,
  frac: number,
  label: string,
) {
  const h = 15;
  const iconX = x + 11;
  if (icon === 'heart') heartIcon(ctx, iconX, y + h / 2, 7, '#e8455a');
  else if (icon === 'shield') shieldIcon(ctx, iconX, y + h / 2, 7, '#c3ccd8');
  else diamondIcon(ctx, iconX, y + h / 2, 7, '#4aa8ff');

  const barX = x + 24;
  const barW = w - 30;
  ctx.fillStyle = '#1a1410';
  rr(ctx, barX, y, barW, h, 3);
  ctx.fill();
  ctx.fillStyle = fillColor;
  const clamped = Math.max(0, Math.min(1, frac));
  if (clamped > 0) {
    rr(ctx, barX + 1.5, y + 1.5, Math.max(3, (barW - 3) * clamped), h - 3, 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  rr(ctx, barX, y, barW, h, 3);
  ctx.stroke();

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4efe6';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(label, barX + barW / 2, y + h - 4);
  ctx.fillText(label, barX + barW / 2, y + h - 4);
}

export function drawHud(ctx: CanvasRenderingContext2D, player: Player, level: Level, hud: HudState) {
  // ---------- top-left stat plate ----------
  const px = 14;
  const py = 14;
  const pw = 224;
  const ph = 63;
  ctx.fillStyle = 'rgba(38,30,22,0.92)';
  rr(ctx, px, py, pw, ph, 8);
  ctx.fill();
  ctx.strokeStyle = '#6f5a3f';
  ctx.lineWidth = 2.5;
  rr(ctx, px, py, pw, ph, 8);
  ctx.stroke();

  statRow(ctx, px + 6, py + 5, pw - 12, 'heart', '#e8455a', player.hp / player.maxHp, `${Math.ceil(player.hp)}/${player.maxHp}`);

  const maxCharges = Math.max(1, player.effects.reviveCharges);
  statRow(
    ctx,
    px + 6,
    py + 23,
    pw - 12,
    'shield',
    player.shieldFrac > 0 ? '#9fd6ff' : '#8d97a5',
    player.effects.reviveCharges > 0 ? player.reviveCharges / maxCharges : player.shieldFrac,
    player.effects.reviveCharges > 0 ? `${player.reviveCharges}/${player.effects.reviveCharges}` : player.shieldFrac > 0 ? 'SHIELDED' : '—',
  );

  const abilityFrac = player.abilityCooldown > 0 ? 1 - player.abilityCooldown / player.character.activeCooldown : 1;
  const energyNow = Math.round(abilityFrac * 100);
  statRow(ctx, px + 6, py + 41, pw - 12, 'diamond', '#3d7fe0', abilityFrac, `${energyNow}/100`);

  // ---------- partner strip (co-op) ----------
  if (hud.partner) {
    const qy = py + ph + 8;
    ctx.fillStyle = 'rgba(38,30,22,0.9)';
    rr(ctx, px, qy, pw, 30, 8);
    ctx.fill();
    ctx.strokeStyle = '#6f5a3f';
    ctx.lineWidth = 2;
    rr(ctx, px, qy, pw, 30, 8);
    ctx.stroke();

    ctx.fillStyle = hud.partner.color;
    ctx.beginPath();
    ctx.arc(px + 16, qy + 15, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#f4efe6';
    ctx.fillText(hud.partner.name.toUpperCase(), px + 29, qy + 12);

    const bw = pw - 40;
    ctx.fillStyle = '#1a1410';
    rr(ctx, px + 29, qy + 16, bw, 8, 3);
    ctx.fill();
    if (hud.partner.downed) {
      ctx.fillStyle = '#ff9d2e';
      rr(ctx, px + 29, qy + 16, bw * Math.max(0, hud.partner.downTimer / DOWN_BLEEDOUT), 8, 3);
      ctx.fill();
      ctx.fillStyle = '#ff9d2e';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('DOWNED', px + pw - 8, qy + 12);
    } else {
      ctx.fillStyle = '#e8455a';
      rr(ctx, px + 29, qy + 16, bw * Math.max(0, hud.partner.hp / hud.partner.maxHp), 8, 3);
      ctx.fill();
    }
  }

  // ---------- top centre: round / enemies ----------
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ff5b4a';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 4;
  ctx.strokeText(`ROUND ${hud.round}`, VIEW_W / 2, 34);
  ctx.fillText(`ROUND ${hud.round}`, VIEW_W / 2, 34);

  ctx.font = '12px monospace';
  ctx.fillStyle = '#a4adb8';
  const enemyLabel = hud.intermissionTimer > 0 ? 'NEXT WAVE INCOMING' : `${hud.enemiesRemaining} REMAINING`;
  ctx.fillText(`${enemyLabel}   ·   DEPTH ${hud.depth}`, VIEW_W / 2, 52);

  if (hud.killStreak >= 3) {
    ctx.fillStyle = '#ffb038';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${hud.killStreak}x STREAK`, VIEW_W / 2, 70);
  }

  if (hud.boss) {
    const bw = 360;
    const bx = VIEW_W / 2 - bw / 2;
    const by = 80;
    ctx.fillStyle = '#1a1410';
    rr(ctx, bx, by, bw, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#c22f2f';
    rr(ctx, bx + 1.5, by + 1.5, Math.max(0, (bw - 3) * (hud.boss.hp / hud.boss.maxHp)), 9, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    rr(ctx, bx, by, bw, 12, 4);
    ctx.stroke();
    ctx.fillStyle = '#ff8a7a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('BLACKROCK BRUTE', VIEW_W / 2, by - 4);
  }

  // ---------- minimap ----------
  const boxSize = 30;
  const gap = 5;
  const roomsToShow = 5;
  const mmW = roomsToShow * boxSize + (roomsToShow - 1) * gap + 20;
  const mmH = boxSize + 12;
  const mmX = VIEW_W - mmW - 16;
  const mmY = 16;

  ctx.fillStyle = 'rgba(20,16,12,0.86)';
  rr(ctx, mmX, mmY, mmW, mmH, 7);
  ctx.fill();
  ctx.strokeStyle = '#6f5a3f';
  ctx.lineWidth = 2;
  rr(ctx, mmX, mmY, mmW, mmH, 7);
  ctx.stroke();

  const currentRoomIdx = Math.min(level.rooms.length - 1, Math.max(0, Math.floor(player.x / ROOM_W)));
  let startIdx = currentRoomIdx - 2;
  if (startIdx < 0) startIdx = 0;
  if (startIdx + roomsToShow > level.rooms.length) startIdx = Math.max(0, level.rooms.length - roomsToShow);
  const firstX = mmX + 10;

  for (let i = 0; i < roomsToShow; i++) {
    const roomIdx = startIdx + i;
    const room = level.rooms[roomIdx];
    if (!room) continue;
    const bx = firstX + i * (boxSize + gap);
    const by = mmY + 6;
    const isCurrent = roomIdx === currentRoomIdx;

    ctx.fillStyle = isCurrent ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
    rr(ctx, bx, by, boxSize, boxSize, 4);
    ctx.fill();
    ctx.strokeStyle = isCurrent ? player.character.color : 'rgba(255,255,255,0.26)';
    ctx.lineWidth = isCurrent ? 2 : 1;
    rr(ctx, bx, by, boxSize, boxSize, 4);
    ctx.stroke();

    const station = level.stations.find((s) => s.roomIndex === roomIdx && !s.collected);
    if (station) {
      ctx.fillStyle = STATION_COLOR[station.kind] ?? '#e8e8ea';
      ctx.fillRect(bx + 4, by + 4, 6, 6);
    }
    if (isCurrent) {
      ctx.fillStyle = player.character.color;
      ctx.beginPath();
      ctx.arc(bx + boxSize / 2, by + boxSize / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (i < roomsToShow - 1 && level.rooms[roomIdx + 1]) {
      const door = level.doors[roomIdx];
      ctx.strokeStyle = door && door.open ? '#3ddc73' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + boxSize, by + boxSize / 2);
      ctx.lineTo(bx + boxSize + gap, by + boxSize / 2);
      ctx.stroke();
    }
  }

  // ---------- status chips ----------
  const chips: { label: string; color: string }[] = [];
  if (player.shieldFrac > 0) chips.push({ label: 'SHIELD', color: '#9fd6ff' });
  if (player.undyingTimer > 0) chips.push({ label: 'UNDYING', color: '#ff9ec4' });
  if (player.character.id === 'brawler' && player.ultimateActiveTimer > 0) chips.push({ label: 'RAMPAGE', color: '#ff8a7a' });
  if (player.character.id === 'warden' && player.ultimateActiveTimer > 0) chips.push({ label: 'FORTRESS', color: '#ffd98a' });
  if (player.visionBoostTimer > 0) chips.push({ label: 'FLARE', color: '#8dffb0' });
  if (hud.muted) chips.push({ label: 'MUTED', color: '#8d97a5' });
  let chipX = 16;
  const chipY = VIEW_H - 34;
  for (const chip of chips) {
    ctx.font = 'bold 10px monospace';
    const w = ctx.measureText(chip.label).width + 18;
    ctx.fillStyle = 'rgba(20,16,12,0.9)';
    rr(ctx, chipX, chipY, w, 20, 5);
    ctx.fill();
    ctx.strokeStyle = chip.color;
    ctx.lineWidth = 1.5;
    rr(ctx, chipX, chipY, w, 20, 5);
    ctx.stroke();
    ctx.fillStyle = chip.color;
    ctx.textAlign = 'center';
    ctx.fillText(chip.label, chipX + w / 2, chipY + 14);
    chipX += w + 6;
  }

  // ---------- points, bottom-left ----------
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px monospace';
  ctx.fillStyle = '#ffd23d';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 4;
  ctx.strokeText(`${player.points}`, 16, VIEW_H - 46);
  ctx.fillText(`${player.points}`, 16, VIEW_H - 46);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#8d97a5';
  ctx.fillText('POINTS', 18, VIEW_H - 60);

  // ---------- weapon card, bottom-right ----------
  const weapon = player.currentWeapon;
  const def = WEAPON_DEFS[weapon.roll.weaponId];
  const wcColor = rarityColor(weapon.roll.rarity);
  const cardW = 250;
  const cardH = 78;
  const cardX = VIEW_W - cardW - 16;
  const cardY = VIEW_H - cardH - 16;

  ctx.fillStyle = 'rgba(20,16,12,0.9)';
  rr(ctx, cardX, cardY, cardW, cardH, 9);
  ctx.fill();
  ctx.strokeStyle = wcColor;
  ctx.lineWidth = 2.5;
  rr(ctx, cardX, cardY, cardW, cardH, 9);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = wcColor;
  ctx.fillText(def.name.toUpperCase(), cardX + 12, cardY + 21);
  ctx.font = '9px monospace';
  ctx.fillStyle = '#8d97a5';
  ctx.fillText(weapon.roll.perkLabel, cardX + 12, cardY + 34);

  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = player.reloading ? '#ff9d2e' : '#f4efe6';
  const ammoMain = player.charging ? 'CHG' : player.reloading ? '···' : `${weapon.ammoInMag}`;
  ctx.fillText(ammoMain, cardX + 12, cardY + 64);
  // measure while the big font is still active, otherwise the reserve creeps
  // left and collides with the magazine count
  const mainWidth = ctx.measureText(ammoMain).width;
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8d97a5';
  ctx.fillText(`/ ${weapon.ammoReserve}`, cardX + 20 + mainWidth, cardY + 64);

  // circular reload / charge ring on the right of the card
  const ringX = cardX + cardW - 34;
  const ringY = cardY + cardH / 2;
  const ringR = 21;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
  ctx.stroke();

  let ringFrac = 1;
  let ringColor = wcColor;
  if (player.reloading) {
    ringFrac = 1 - player.reloadTimer / def.reloadTime;
    ringColor = '#ff9d2e';
  } else if (player.charging && def.chargeTime) {
    ringFrac = Math.min(1, player.chargeTime / def.chargeTime);
    ringColor = '#8dffb0';
  } else {
    ringFrac = weapon.ammoInMag / def.magSize;
  }
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, ringFrac)));
  ctx.stroke();

  // ultimate pip inside the ring
  if (player.ultimateUnlocked) {
    const ultReady = player.ultimateCooldown <= 0;
    ctx.fillStyle = ultReady ? player.character.ultimateColor : '#3a3f47';
    ctx.beginPath();
    ctx.arc(ringX, ringY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ultReady ? '#14100c' : '#6b6f78';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('X', ringX, ringY + 4);
  } else {
    ctx.fillStyle = '#3a3f47';
    ctx.beginPath();
    ctx.arc(ringX, ringY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b6f78';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🔒', ringX, ringY + 3);
  }

  // ---------- companion readout ----------
  if (hud.companion) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = rarityColor(hud.companion.rarity);
    ctx.fillText(`${hud.companion.name.toUpperCase()} · ${hud.companion.rarity.toUpperCase()}`, cardX + cardW, cardY - 8);
  }

  if (hud.netStatus) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#6ee7d5';
    ctx.fillText(hud.netStatus, VIEW_W - 16, mmY + mmH + 16);
  }

  // ---------- downed overlay ----------
  if (player.downed) {
    ctx.fillStyle = 'rgba(120,0,0,0.22)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px monospace';
    ctx.fillStyle = '#ff5b4a';
    ctx.fillText('DOWNED', VIEW_W / 2, VIEW_H / 2 - 24);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#f4efe6';
    ctx.fillText(`Bleeding out — ${player.downTimer.toFixed(1)}s`, VIEW_W / 2, VIEW_H / 2);

    const bw = 260;
    ctx.fillStyle = '#1a1410';
    rr(ctx, VIEW_W / 2 - bw / 2, VIEW_H / 2 + 14, bw, 10, 4);
    ctx.fill();
    ctx.fillStyle = player.reviveProgress > 0 ? '#3ddc73' : '#ff9d2e';
    const frac = player.reviveProgress > 0 ? player.reviveProgress : player.downTimer / DOWN_BLEEDOUT;
    rr(ctx, VIEW_W / 2 - bw / 2 + 1.5, VIEW_H / 2 + 15.5, Math.max(0, (bw - 3) * frac), 7, 3);
    ctx.fill();

    ctx.font = '11px monospace';
    ctx.fillStyle = '#a4adb8';
    const hint = player.reviveCharges > 0 ? 'Second Wind will catch you' : hud.partner ? 'Teammate must reach you' : 'No revives left';
    ctx.fillText(hint, VIEW_W / 2, VIEW_H / 2 + 42);
  }

  // ---------- tutorial ----------
  if (hud.tutorialTimer > 0) {
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(232,232,234,0.85)';
    ctx.fillText(hud.controlsHint, VIEW_W / 2, 104);
    ctx.fillText('Buy doors to push deeper — each room is generated as you go', VIEW_W / 2, 122);
  }
}
