import { WEAPON_DEFS, rarityColor } from './Weapons';
import type { Player } from './Entities';
import type { Level } from './Level';
import type { Rarity } from './types';
import { VIEW_W, VIEW_H, DOWN_BLEEDOUT } from './constants';

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
  /** Wave size when it started, for the clear-progress bar. */
  waveTotal: number;
  killStreak: number;
  intermissionTimer: number;
  tutorialTimer: number;
  controlsHint: string;
  boss: { hp: number; maxHp: number; name: string; color: string } | null;
  powerUps: { label: string; color: string; secondsLeft: number }[];
  enemyPositions: { x: number; y: number; boss: boolean }[];
  companions: { name: string; rarity: Rarity }[];
  partner: HudPartner | null;
  muted: boolean;
  netStatus: string | null;
}

const STATION_COLOR: Record<string, string> = {
  mysterybox: '#a24ddc',
  workbench: '#ff9d2e',
  treasure: '#ffd23d',
  upgrade: '#6ee7d5',
  ammo: '#8dd6ff',
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


/** Small zombie head: square skull, sunken eyes, stitched mouth, one ragged ear. */
function zombieIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const half = s / 2;
  ctx.fillStyle = '#6aa84f';
  rr(ctx, cx - half, cy - half, s, s, s * 0.22);
  ctx.fill();
  // brow shadow, so the face reads at 20px
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(cx - half, cy - half, s, s * 0.26);
  // eyes
  ctx.fillStyle = '#12200f';
  ctx.fillRect(cx - s * 0.30, cy - s * 0.16, s * 0.20, s * 0.20);
  ctx.fillRect(cx + s * 0.10, cy - s * 0.16, s * 0.20, s * 0.20);
  ctx.fillStyle = '#c9403a';
  ctx.fillRect(cx + s * 0.14, cy - s * 0.12, s * 0.09, s * 0.09);
  // stitched mouth
  ctx.strokeStyle = '#12200f';
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.28, cy + s * 0.26);
  ctx.lineTo(cx + s * 0.28, cy + s * 0.26);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, s * 0.05);
  for (let i = -1; i <= 1; i++) {
    const sx = cx + i * s * 0.18;
    ctx.beginPath();
    ctx.moveTo(sx, cy + s * 0.16);
    ctx.lineTo(sx, cy + s * 0.36);
    ctx.stroke();
  }
  // ragged ear
  ctx.fillStyle = '#5b9142';
  ctx.fillRect(cx + half - s * 0.04, cy - s * 0.10, s * 0.16, s * 0.22);
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
  ctx.fillText(`DEPTH ${hud.depth}`, VIEW_W / 2, 52);

  // ---------- wave clear tracker ----------
  // How many kills stand between you and the end of the wave, which was
  // previously buried in the same grey line as the depth readout.
  const wbW = 300;
  const wbX = VIEW_W / 2 - wbW / 2;
  const wbY = 60;
  const wbH = 18;
  const intermission = hud.intermissionTimer > 0;
  const total = Math.max(1, hud.waveTotal);
  const cleared = Math.max(0, total - hud.enemiesRemaining);

  ctx.fillStyle = 'rgba(20,16,12,0.86)';
  rr(ctx, wbX, wbY, wbW, wbH, 5);
  ctx.fill();
  if (!intermission) {
    // fills left to right as the wave is cleared, and runs hot at the end
    const frac = Math.max(0, Math.min(1, cleared / total));
    const nearlyDone = hud.enemiesRemaining <= Math.max(1, Math.round(total * 0.2));
    ctx.fillStyle = nearlyDone ? '#ffb038' : '#e8455a';
    if (frac > 0) {
      rr(ctx, wbX + 1.5, wbY + 1.5, Math.max(3, (wbW - 3) * frac), wbH - 3, 4);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#6f5a3f';
  ctx.lineWidth = 1.5;
  rr(ctx, wbX, wbY, wbW, wbH, 5);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#f4efe6';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  const waveLabel = intermission
    ? `NEXT WAVE IN ${Math.ceil(hud.intermissionTimer)}s`
    : hud.enemiesRemaining <= 0
      ? 'WAVE CLEAR'
      : `${hud.enemiesRemaining} LEFT   ·   ${cleared}/${total} DOWN`;
  ctx.strokeText(waveLabel, VIEW_W / 2, wbY + 13);
  ctx.fillText(waveLabel, VIEW_W / 2, wbY + 13);

  if (hud.killStreak >= 3) {
    ctx.fillStyle = '#ffb038';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${hud.killStreak}x STREAK`, VIEW_W / 2, hud.boss ? wbY + 74 : wbY + 34);
  }

  if (hud.boss) {
    const bw = 360;
    const bx = VIEW_W / 2 - bw / 2;
    const by = 104;
    ctx.fillStyle = '#1a1410';
    rr(ctx, bx, by, bw, 12, 4);
    ctx.fill();
    ctx.fillStyle = hud.boss.color;
    rr(ctx, bx + 1.5, by + 1.5, Math.max(0, (bw - 3) * (hud.boss.hp / hud.boss.maxHp)), 9, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    rr(ctx, bx, by, bw, 12, 4);
    ctx.stroke();
    ctx.fillStyle = hud.boss.color;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(hud.boss.name, VIEW_W / 2, by - 4);
  }

  // ---------- minimap ----------
  // The facility branches in four directions now, so the map is a small plan
  // view of the cells around you rather than a strip of rooms.
  const boxSize = 26;
  const gap = 10;
  const span = 2; // cells shown either side of the player
  const cells = span * 2 + 1;
  const mmW = cells * boxSize + (cells - 1) * gap + 20;
  const mmH = mmW;
  const mmX = VIEW_W - mmW - 16;
  const mmY = 16;

  ctx.fillStyle = 'rgba(20,16,12,0.86)';
  rr(ctx, mmX, mmY, mmW, mmH, 7);
  ctx.fill();
  ctx.strokeStyle = '#6f5a3f';
  ctx.lineWidth = 2;
  rr(ctx, mmX, mmY, mmW, mmH, 7);
  ctx.stroke();

  const currentIdx = level.roomIndexAt(player.x, player.y);
  const current = level.rooms[currentIdx];
  const boxX = (col: number) => mmX + 10 + (col - current.col + span) * (boxSize + gap);
  const boxY = (row: number) => mmY + 10 + (row - current.row + span) * (boxSize + gap);
  const onMap = (col: number, row: number) =>
    Math.abs(col - current.col) <= span && Math.abs(row - current.row) <= span;

  // corridors first, so room boxes sit on top of them
  for (const door of level.doors) {
    const a = level.rooms[door.a];
    const b = level.rooms[door.b];
    if (!a || !b) continue;
    if (!a.reached && !b.reached) continue;
    if (!onMap(a.col, a.row) || !onMap(b.col, b.row)) continue;
    ctx.strokeStyle = door.open ? '#3ddc73' : 'rgba(255,210,61,0.5)';
    ctx.lineWidth = door.open ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(boxX(a.col) + boxSize / 2, boxY(a.row) + boxSize / 2);
    ctx.lineTo(boxX(b.col) + boxSize / 2, boxY(b.row) + boxSize / 2);
    ctx.stroke();
  }

  for (const room of level.rooms) {
    if (!onMap(room.col, room.row)) continue;
    // rooms you haven't opened up are only hinted at
    const known = room.reached;
    const bx = boxX(room.col);
    const by = boxY(room.row);
    const isCurrent = room.index === currentIdx;

    ctx.fillStyle = isCurrent ? 'rgba(255,255,255,0.18)' : known ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)';
    rr(ctx, bx, by, boxSize, boxSize, 4);
    ctx.fill();
    ctx.strokeStyle = isCurrent ? player.character.color : known ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = isCurrent ? 2 : 1;
    rr(ctx, bx, by, boxSize, boxSize, 4);
    ctx.stroke();
    if (!known) continue;

    const station = level.stations.find((s) => s.roomIndex === room.index && !s.collected);
    if (station) {
      ctx.fillStyle = STATION_COLOR[station.kind] ?? '#e8e8ea';
      ctx.fillRect(bx + 4, by + 4, 5, 5);
    }
    // enemy pips, placed within the room box so you can read where they are
    for (const en of hud.enemyPositions) {
      if (en.x < room.x || en.x > room.x + room.w || en.y < room.y || en.y > room.y + room.h) continue;
      const ex = bx + 2 + ((en.x - room.x) / room.w) * (boxSize - 4);
      const ey = by + 2 + ((en.y - room.y) / room.h) * (boxSize - 4);
      ctx.fillStyle = en.boss ? '#ff3b2f' : '#e8455a';
      ctx.beginPath();
      ctx.arc(ex, ey, en.boss ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isCurrent) {
      ctx.fillStyle = player.character.color;
      ctx.beginPath();
      ctx.arc(
        bx + 2 + ((player.x - room.x) / room.w) * (boxSize - 4),
        by + 2 + ((player.y - room.y) / room.h) * (boxSize - 4),
        3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }


  // ---------- zombies-left counter, tucked under the minimap ----------
  const zcH = 30;
  const zcY = mmY + mmH + 8;
  ctx.fillStyle = 'rgba(20,16,12,0.86)';
  rr(ctx, mmX, zcY, mmW, zcH, 7);
  ctx.fill();
  // runs hot once the wave is nearly out, matching the wave bar up top
  const zombiesLeft = hud.enemiesRemaining;
  const waveNearlyOut = zombiesLeft > 0 && zombiesLeft <= Math.max(1, Math.round(Math.max(1, hud.waveTotal) * 0.2));
  ctx.strokeStyle = zombiesLeft <= 0 ? '#3ddc73' : waveNearlyOut ? '#ffb038' : '#6f5a3f';
  ctx.lineWidth = 2;
  rr(ctx, mmX, zcY, mmW, zcH, 7);
  ctx.stroke();

  zombieIcon(ctx, mmX + 20, zcY + zcH / 2, 19);

  ctx.textAlign = 'left';
  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = zombiesLeft <= 0 ? '#3ddc73' : waveNearlyOut ? '#ffb038' : '#f4efe6';
  ctx.fillText(hud.intermissionTimer > 0 ? '—' : `${zombiesLeft}`, mmX + 36, zcY + zcH / 2 + 6);

  ctx.font = '9px monospace';
  ctx.fillStyle = '#8d97a5';
  ctx.textAlign = 'right';
  ctx.fillText(hud.intermissionTimer > 0 ? 'WAVE CLEAR' : 'LEFT IN WAVE', mmX + mmW - 10, zcY + zcH / 2 + 4);

  // ---------- status chips ----------
  const chips: { label: string; color: string }[] = [];
  if (player.shieldFrac > 0) chips.push({ label: 'SHIELD', color: '#9fd6ff' });
  if (player.undyingTimer > 0) chips.push({ label: 'UNDYING', color: '#ff9ec4' });
  if (player.character.id === 'brawler' && player.ultimateActiveTimer > 0) chips.push({ label: 'RAMPAGE', color: '#ff8a7a' });
  if (player.character.id === 'warden' && player.ultimateActiveTimer > 0) chips.push({ label: 'FORTRESS', color: '#ffd98a' });
  if (player.visionBoostTimer > 0) chips.push({ label: 'FLARE', color: '#8dffb0' });
  for (const pu of hud.powerUps) chips.push({ label: `${pu.label} ${Math.ceil(pu.secondsLeft)}s`, color: pu.color });
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
    ringFrac = 1 - player.reloadTimer / (def.reloadTime * player.effects.reloadMult);
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
  // Stacks upward so a full escort wing never pushes into the weapon card.
  hud.companions.forEach((c, i) => {
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = rarityColor(c.rarity);
    ctx.fillText(
      `${c.name.toUpperCase()} · ${c.rarity.toUpperCase()}`,
      cardX + cardW,
      cardY - 8 - (hud.companions.length - 1 - i) * 13,
    );
  });

  if (hud.netStatus) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#6ee7d5';
    ctx.fillText(hud.netStatus, VIEW_W - 16, mmY + mmH + 16);
  }

  // ---------- downed overlay (co-op only: solo has nobody to revive you) ----------
  if (player.downed && hud.partner) {
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
