import { Input } from './Input';
import { Camera } from './Camera';
import { Particles, PointFlyers } from './Particles';
import { Sfx } from './Audio';
import { Level, resolveWallCollisions, circleRectCollide, type Station } from './Level';
import { Player, Enemy, enemyColor, PLAYER_RADIUS, type EnemyProjectile } from './Entities';
import { Companion, companionTierName } from './Companion';
import { CHARACTER_DEFS, CHARACTER_ORDER, type CharacterDef } from './Characters';
import { pickEnemyKind, createEnemy, createBoss } from './Enemies';
import {
  WEAPON_DEFS,
  rollWeapon,
  upgradeWeaponRoll,
  canUpgrade,
  rarityColor,
  spawnProjectiles,
  MYSTERY_BOX_POOL,
  type Projectile,
  type WeaponDef,
} from './Weapons';
import { MysteryBox } from './Economy';
import { drawHud, type HudState } from './HUD';
import {
  loadMeta,
  saveMeta,
  essenceForRun,
  tokensForRun,
  ULTIMATE_UNLOCK_COST,
  MAX_HP_BOOST_COST,
  START_POINTS_BOOST_COST,
  DASH_COOLDOWN_BOOST_COST,
  MAX_HP_BOOST_AMOUNT,
  START_POINTS_BOOST_AMOUNT,
  DASH_COOLDOWN_BOOST_AMOUNT,
  nextCost,
  companionLevelCost,
  COMPANION_LEVEL_CAP,
  companionBoxCost,
  rollCompanionRarity,
  type MetaState,
} from './Meta';
import {
  DEFAULT_BINDINGS,
  ACTION_ORDER,
  ACTION_LABELS,
  loadBindings,
  saveBindings,
  formatKeyCode,
  type ActionId,
} from './Keybinds';
import { RARITY_ORDER, type EnemyKind } from './types';
import {
  WORLD_H,
  VIEW_W,
  VIEW_H,
  FIXED_DT,
  DASH_SPEED,
  DASH_DURATION,
  DASH_IFRAME,
  MELEE_RANGE,
  MELEE_ARC,
  MELEE_DAMAGE,
  ROUND_INTERMISSION,
  BOSS_ROUND_INTERVAL,
  WORKBENCH_BASE_COST,
  WORKBENCH_COST_STEP,
  TREASURE_BASE_BONUS,
  BASE_VISION_RADIUS,
  AMBIENT_LIGHT,
} from './constants';

type Scene = 'select' | 'hub' | 'controls' | 'playing' | 'results';

interface RunStats {
  kills: number;
  roundsSurvived: number;
  points: number;
}

interface SpawnTicket {
  x: number;
  y: number;
  delay: number;
  kind: EnemyKind;
}

interface HubRow {
  label: string;
  accent: string;
  currency: 'essence' | 'tokens';
  statusText: string;
  cost: number | null;
  buyable: boolean;
  onBuy: () => void;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private camera = new Camera();
  private particles = new Particles();
  private pointFlyers: PointFlyers;
  private sfx = new Sfx();
  private level = new Level();
  private mysteryBox = new MysteryBox();
  private meta: MetaState;
  private keybinds: Record<ActionId, string>;

  private scene: Scene = 'select';
  private selectedCharacterIndex = 0;
  private listeningForAction: ActionId | null = null;
  private paused = false;

  private player!: Player;
  private companion: Companion | null = null;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private pendingAirstrike: { x: number; y: number; timer: number } | null = null;

  private round = 0;
  private enemiesToSpawn: SpawnTicket[] = [];
  private intermissionTimer = 0;
  private tutorialTimer = 8;
  private killStreak = 0;
  private killStreakTimer = 0;
  private hitStopTimer = 0;
  private flickerPhase = 0;
  private runBonusEssence = 0;
  private lastEssenceEarned = 0;
  private lastTokensEarned = 0;
  private stats: RunStats = { kills: 0, roundsSurvived: 0, points: 0 };

  private lightMaskCanvas: HTMLCanvasElement;
  private lightMaskCtx: CanvasRenderingContext2D;

  private lastTime = 0;
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d')!;
    this.lightMaskCanvas = document.createElement('canvas');
    this.lightMaskCanvas.width = VIEW_W;
    this.lightMaskCanvas.height = VIEW_H;
    this.lightMaskCtx = this.lightMaskCanvas.getContext('2d')!;
    this.meta = loadMeta();
    this.keybinds = loadBindings();
    this.input = new Input(canvas, () => this.sfx.unlock());
    this.pointFlyers = new PointFlyers((amount) => {
      this.player.points += amount;
      this.stats.points += amount;
    });
    requestAnimationFrame(this.loop);
  }

  private actionDown(a: ActionId): boolean {
    return this.input.isDown(this.keybinds[a]);
  }

  private actionPressed(a: ActionId): boolean {
    return this.input.wasPressed(this.keybinds[a]);
  }

  private loop = (time: number) => {
    if (!this.lastTime) this.lastTime = time;
    let frameDt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    frameDt = Math.min(frameDt, 0.1);
    this.accumulator += frameDt;

    while (this.accumulator >= FIXED_DT) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      this.input.endFrame();
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  private fixedUpdate(dt: number) {
    this.flickerPhase += dt;

    if (this.scene === 'select') return this.updateSelect();
    if (this.scene === 'hub') return this.updateHub();
    if (this.scene === 'controls') return this.updateControls();
    if (this.scene === 'results') return this.updateResults();

    if (this.actionPressed('pause')) this.paused = !this.paused;
    if (this.paused) return;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }
    this.updatePlaying(dt);
  }

  // ---------------- SELECT SCENE ----------------

  private updateSelect() {
    if (this.input.wasPressed('Digit1')) this.selectedCharacterIndex = 0;
    if (this.input.wasPressed('Digit2')) this.selectedCharacterIndex = 1;
    if (this.input.wasPressed('Digit3')) this.selectedCharacterIndex = 2;
    if (this.input.wasPressed('ArrowLeft')) this.selectedCharacterIndex = (this.selectedCharacterIndex + 2) % 3;
    if (this.input.wasPressed('ArrowRight')) this.selectedCharacterIndex = (this.selectedCharacterIndex + 1) % 3;
    if (this.actionPressed('upgradesMenu')) this.scene = 'hub';
    if (this.input.wasPressed('KeyC')) this.scene = 'controls';

    if (this.input.wasMousePressed()) {
      const idx = this.hitTestCharacterCard(this.input.mouseX, this.input.mouseY);
      if (idx >= 0) this.selectedCharacterIndex = idx;
      const btn = this.hitTestSelectButtons(this.input.mouseX, this.input.mouseY);
      if (btn === 'drop') this.startRun();
      if (btn === 'upgrades') this.scene = 'hub';
      if (btn === 'controls') this.scene = 'controls';
    }

    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space')) this.startRun();
  }

  private hitTestCharacterCard(mx: number, my: number): number {
    const cardW = 220;
    const cardH = 268;
    const gap = 30;
    const totalW = cardW * 3 + gap * 2;
    const startX = VIEW_W / 2 - totalW / 2;
    const y = 132;
    for (let i = 0; i < 3; i++) {
      const x = startX + i * (cardW + gap);
      if (mx >= x && mx <= x + cardW && my >= y && my <= y + cardH) return i;
    }
    return -1;
  }

  private hitTestSelectButtons(mx: number, my: number): 'drop' | 'upgrades' | 'controls' | null {
    const btnW = 176;
    const btnH = 50;
    const gap = 16;
    const totalW = btnW * 3 + gap * 2;
    const startX = VIEW_W / 2 - totalW / 2;
    const y = 452;
    if (my < y || my > y + btnH) return null;
    if (mx >= startX && mx <= startX + btnW) return 'drop';
    if (mx >= startX + btnW + gap && mx <= startX + btnW * 2 + gap) return 'upgrades';
    if (mx >= startX + (btnW + gap) * 2 && mx <= startX + btnW * 3 + gap * 2) return 'controls';
    return null;
  }

  private startRun() {
    const charId = CHARACTER_ORDER[this.selectedCharacterIndex];
    this.beginNewRun(CHARACTER_DEFS[charId]);
  }

  private beginNewRun(def: CharacterDef) {
    this.level = new Level();
    this.mysteryBox = new MysteryBox();
    const dashMult = Math.max(0.5, 1 - this.meta.dashCooldownBoostTier * DASH_COOLDOWN_BOOST_AMOUNT);
    const maxHpBonus = this.meta.maxHpBoostTier * MAX_HP_BOOST_AMOUNT;
    const startingPoints = this.meta.startPointsBoostTier * START_POINTS_BOOST_AMOUNT;
    this.player = new Player(120, WORLD_H / 2, def, dashMult, startingPoints, maxHpBonus);
    this.player.ultimateUnlocked = this.meta.ultimatesUnlocked[def.id];
    this.companion = new Companion(90, WORLD_H / 2 + 50, this.meta.companionLevel, this.meta.companionRarity);
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.pendingAirstrike = null;
    this.round = 0;
    this.enemiesToSpawn = [];
    this.intermissionTimer = ROUND_INTERMISSION * 0.5;
    this.tutorialTimer = 8;
    this.killStreak = 0;
    this.killStreakTimer = 0;
    this.hitStopTimer = 0;
    this.paused = false;
    this.runBonusEssence = 0;
    this.stats = { kills: 0, roundsSurvived: 0, points: 0 };
    this.scene = 'playing';
  }

  // ---------------- HUB SCENE ----------------

  private getHubRows(): HubRow[] {
    const rows: HubRow[] = [];
    for (const id of CHARACTER_ORDER) {
      const def = CHARACTER_DEFS[id];
      const unlocked = this.meta.ultimatesUnlocked[id];
      rows.push({
        label: `${def.name} Ultimate — ${def.ultimateLabel}`,
        accent: def.color,
        currency: 'essence',
        statusText: unlocked ? 'UNLOCKED' : `${ULTIMATE_UNLOCK_COST}`,
        cost: unlocked ? null : ULTIMATE_UNLOCK_COST,
        buyable: !unlocked && this.meta.essence >= ULTIMATE_UNLOCK_COST,
        onBuy: () => {
          this.meta.essence -= ULTIMATE_UNLOCK_COST;
          this.meta.ultimatesUnlocked[id] = true;
          saveMeta(this.meta);
        },
      });
    }

    const hpCost = nextCost(MAX_HP_BOOST_COST, this.meta.maxHpBoostTier);
    rows.push({
      label: `Max Health +${MAX_HP_BOOST_AMOUNT} (tier ${this.meta.maxHpBoostTier}/${MAX_HP_BOOST_COST.length})`,
      accent: '#3ddc73',
      currency: 'essence',
      statusText: hpCost === null ? 'MAX' : `${hpCost}`,
      cost: hpCost,
      buyable: hpCost !== null && this.meta.essence >= hpCost,
      onBuy: () => {
        this.meta.essence -= hpCost!;
        this.meta.maxHpBoostTier++;
        saveMeta(this.meta);
      },
    });

    const ptsCost = nextCost(START_POINTS_BOOST_COST, this.meta.startPointsBoostTier);
    rows.push({
      label: `Starting Points +${START_POINTS_BOOST_AMOUNT} (tier ${this.meta.startPointsBoostTier}/${START_POINTS_BOOST_COST.length})`,
      accent: '#ffd23d',
      currency: 'essence',
      statusText: ptsCost === null ? 'MAX' : `${ptsCost}`,
      cost: ptsCost,
      buyable: ptsCost !== null && this.meta.essence >= ptsCost,
      onBuy: () => {
        this.meta.essence -= ptsCost!;
        this.meta.startPointsBoostTier++;
        saveMeta(this.meta);
      },
    });

    const dashCost = nextCost(DASH_COOLDOWN_BOOST_COST, this.meta.dashCooldownBoostTier);
    rows.push({
      label: `Dash Cooldown -${Math.round(DASH_COOLDOWN_BOOST_AMOUNT * 100)}% (tier ${this.meta.dashCooldownBoostTier}/${DASH_COOLDOWN_BOOST_COST.length})`,
      accent: '#8dd6ff',
      currency: 'essence',
      statusText: dashCost === null ? 'MAX' : `${dashCost}`,
      cost: dashCost,
      buyable: dashCost !== null && this.meta.essence >= dashCost,
      onBuy: () => {
        this.meta.essence -= dashCost!;
        this.meta.dashCooldownBoostTier++;
        saveMeta(this.meta);
      },
    });

    const compCost = companionLevelCost(this.meta.companionLevel);
    rows.push({
      label: `Evolve: ${companionTierName(this.meta.companionLevel)} → next tier (${this.meta.companionLevel}/${COMPANION_LEVEL_CAP})`,
      accent: '#9fe6ff',
      currency: 'tokens',
      statusText: compCost === null ? 'MAX' : `${compCost}`,
      cost: compCost,
      buyable: compCost !== null && this.meta.tokens >= compCost,
      onBuy: () => {
        this.meta.tokens -= compCost!;
        this.meta.companionLevel++;
        saveMeta(this.meta);
      },
    });

    const boxCost = companionBoxCost(this.meta.companionBoxPulls);
    rows.push({
      label: `Companion Box — reroll rarity (currently ${this.meta.companionRarity.toUpperCase()}, never downgrades)`,
      accent: rarityColor(this.meta.companionRarity),
      currency: 'tokens',
      statusText: `${boxCost}`,
      cost: boxCost,
      buyable: this.meta.tokens >= boxCost,
      onBuy: () => {
        this.meta.tokens -= boxCost;
        this.meta.companionBoxPulls++;
        this.meta.companionRarity = rollCompanionRarity(this.meta.companionRarity);
        saveMeta(this.meta);
      },
    });

    return rows;
  }

  private updateHub() {
    if (this.input.wasPressed('Escape') || this.actionPressed('upgradesMenu')) {
      this.scene = 'select';
      return;
    }
    if (!this.input.wasMousePressed()) return;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    if (mx >= VIEW_W / 2 - 90 && mx <= VIEW_W / 2 + 90 && my >= 508 && my <= 552) {
      this.scene = 'select';
      return;
    }

    const rows = this.getHubRows();
    const rowH = 44;
    const startY = 112;
    for (let i = 0; i < rows.length; i++) {
      const y = startY + i * rowH;
      if (mx >= 90 && mx <= VIEW_W - 90 && my >= y && my <= y + rowH - 8) {
        if (rows[i].buyable) rows[i].onBuy();
        return;
      }
    }
  }

  // ---------------- CONTROLS SCENE ----------------

  private updateControls() {
    if (this.listeningForAction) {
      const code = this.input.justPressedCode();
      if (code) {
        if (code !== 'Escape') {
          for (const a of ACTION_ORDER) {
            if (a !== this.listeningForAction && this.keybinds[a] === code) this.keybinds[a] = '';
          }
          this.keybinds[this.listeningForAction] = code;
          saveBindings(this.keybinds);
        }
        this.listeningForAction = null;
      }
      return;
    }

    if (this.input.wasPressed('Escape')) {
      this.scene = 'select';
      return;
    }
    if (!this.input.wasMousePressed()) return;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    if (mx >= VIEW_W / 2 - 190 && mx <= VIEW_W / 2 - 10 && my >= 528 && my <= 568) {
      this.keybinds = { ...DEFAULT_BINDINGS };
      saveBindings(this.keybinds);
      return;
    }
    if (mx >= VIEW_W / 2 + 10 && mx <= VIEW_W / 2 + 190 && my >= 528 && my <= 568) {
      this.scene = 'select';
      return;
    }

    const rowH = 26;
    const startY = 66;
    for (let i = 0; i < ACTION_ORDER.length; i++) {
      const y = startY + i * rowH;
      if (mx >= 60 && mx <= VIEW_W - 60 && my >= y && my <= y + rowH - 3) {
        this.listeningForAction = ACTION_ORDER[i];
        return;
      }
    }
  }

  // ---------------- RESULTS SCENE ----------------

  private updateResults() {
    if (this.input.wasMousePressed() || this.input.wasPressed('Enter') || this.input.wasPressed('Space')) {
      this.scene = 'select';
    }
  }

  // ---------------- PLAYING SCENE ----------------

  private updatePlaying(dt: number) {
    if (this.tutorialTimer > 0) this.tutorialTimer -= dt;

    this.updateRoundFlow(dt);
    this.updatePlayer(dt);
    this.updateStations();
    if (this.companion) {
      const shots = this.companion.update(dt, this.player.x, this.player.y, this.enemies);
      if (shots.length) this.projectiles.push(...shots);
    }
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyProjectiles(dt);
    this.updateAirstrike(dt);
    this.particles.update(dt);
    this.pointFlyers.update(dt, this.player.x, this.player.y);
    this.camera.update(dt);
    this.camera.follow(this.player.x, this.player.y, VIEW_W, VIEW_H, this.level.totalWidth(), WORLD_H);

    if (this.killStreakTimer > 0) {
      this.killStreakTimer -= dt;
      if (this.killStreakTimer <= 0) this.killStreak = 0;
    }

    if (!this.player.alive) {
      this.stats.roundsSurvived = this.round;
      const earned = essenceForRun(this.stats.roundsSurvived, this.stats.kills, this.level.depth()) + this.runBonusEssence;
      const tokensEarned = tokensForRun(this.stats.roundsSurvived, this.stats.kills);
      this.meta.essence += earned;
      this.meta.tokens += tokensEarned;
      this.lastEssenceEarned = earned;
      this.lastTokensEarned = tokensEarned;
      saveMeta(this.meta);
      this.scene = 'results';
    }
  }

  private updateStations() {
    const p = this.player;
    for (const s of this.level.stations) {
      if (s.kind !== 'treasure' || s.collected) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < 70) {
        s.collected = true;
        const bonus = TREASURE_BASE_BONUS + this.round * 10;
        p.points += bonus;
        this.stats.points += bonus;
        this.particles.burst(s.x, s.y, '#ffd23d', 30, 240);
        this.particles.floatText(s.x, s.y - 30, `+${bonus} TREASURE`, '#ffd23d');
        this.sfx.points();
        this.camera.shake(3, 0.15);
      }
    }
  }

  private updateRoundFlow(dt: number) {
    if (this.enemiesToSpawn.length > 0) {
      for (const s of this.enemiesToSpawn) s.delay -= dt;
      while (this.enemiesToSpawn.length && this.enemiesToSpawn[0].delay <= 0) {
        const s = this.enemiesToSpawn.shift()!;
        if (s.kind === 'boss') this.enemies.push(createBoss(s.x, s.y, this.round));
        else this.enemies.push(createEnemy(s.x, s.y, s.kind as Exclude<EnemyKind, 'boss'>, this.round));
      }
      return;
    }

    const aliveEnemies = this.enemies.some((e) => e.alive);
    if (!aliveEnemies) {
      if (this.intermissionTimer > 0) {
        this.intermissionTimer -= dt;
        return;
      }
      this.round++;
      this.stats.roundsSurvived = this.round;
      this.spawnWave();
      this.intermissionTimer = ROUND_INTERMISSION;
    }
  }

  private spawnWave() {
    const isBossRound = this.round > 0 && this.round % BOSS_ROUND_INTERVAL === 0;
    const spawnPoints = this.getSpawnPoints();
    const count = isBossRound ? 2 + Math.floor(this.round / 2) : 3 + this.round * 2;
    this.enemiesToSpawn = [];
    for (let i = 0; i < count; i++) {
      const pt = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
      this.enemiesToSpawn.push({
        x: pt.x + (Math.random() - 0.5) * 40,
        y: pt.y + (Math.random() - 0.5) * 40,
        delay: i * 0.3,
        kind: pickEnemyKind(this.round),
      });
    }
    if (isBossRound) {
      const bossPt = spawnPoints[spawnPoints.length - 1];
      this.enemiesToSpawn.push({ x: bossPt.x, y: bossPt.y, delay: count * 0.3 + 0.6, kind: 'boss' });
    }
    this.sfx.roundStart();
  }

  private getSpawnPoints(): { x: number; y: number }[] {
    const pts = [{ x: 60, y: 60 }, { x: 60, y: WORLD_H - 60 }];
    this.level.rooms.forEach((room, i) => {
      if (i === 0) return;
      if (this.level.doors[i - 1]?.open) {
        pts.push(
          { x: room.xStart + 60, y: 60 },
          { x: room.xStart + 60, y: WORLD_H - 60 },
          { x: room.xEnd - 60, y: 60 },
          { x: room.xEnd - 60, y: WORLD_H - 60 },
        );
      }
    });
    return pts;
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (!p.alive) return;

    const worldMouseX = this.camera.x + this.input.mouseX;
    const worldMouseY = this.camera.y + this.input.mouseY;
    p.aimAngle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);

    let mx = 0;
    let my = 0;
    if (this.actionDown('moveUp') || this.input.isDown('ArrowUp')) my -= 1;
    if (this.actionDown('moveDown') || this.input.isDown('ArrowDown')) my += 1;
    if (this.actionDown('moveLeft') || this.input.isDown('ArrowLeft')) mx -= 1;
    if (this.actionDown('moveRight') || this.input.isDown('ArrowRight')) mx += 1;
    const moveLen = Math.hypot(mx, my);
    if (moveLen > 0) {
      mx /= moveLen;
      my /= moveLen;
    }

    if (p.dashCooldownTimer > 0) p.dashCooldownTimer -= dt;
    if (p.iframeTimer > 0) p.iframeTimer -= dt;

    if (this.actionPressed('dash') && p.dashCooldownTimer <= 0 && p.dashTime <= 0) {
      const dashDirLen = moveLen > 0 ? 1 : 0;
      p.dashDirX = dashDirLen ? mx : Math.cos(p.aimAngle);
      p.dashDirY = dashDirLen ? my : Math.sin(p.aimAngle);
      p.dashTime = DASH_DURATION;
      p.iframeTimer = DASH_IFRAME;
      p.dashCooldownTimer = p.dashCooldownMax;
      this.particles.burst(p.x, p.y, '#8fd6ff', 8, 120);
      this.sfx.dash();
    }

    const rampageActive = p.character.id === 'brawler' && p.ultimateActiveTimer > 0;
    const moveSpeed = p.character.moveSpeed * (rampageActive ? 1.35 : 1);

    let speedX: number;
    let speedY: number;
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      speedX = p.dashDirX * DASH_SPEED;
      speedY = p.dashDirY * DASH_SPEED;
    } else {
      speedX = mx * moveSpeed;
      speedY = my * moveSpeed;
    }

    const resolved = resolveWallCollisions(p.x + speedX * dt, p.y + speedY * dt, PLAYER_RADIUS, this.level.allWalls());
    p.x = resolved.x;
    p.y = resolved.y;

    this.handleShooting(dt);
    this.handleReload(dt);
    this.handleMelee(dt);
    this.handleAbility(dt);
    this.handleUltimate(dt);
    this.handleInteract();

    if (p.character.id === 'medic') {
      p.regenAccum += dt;
      if (p.regenAccum >= 1 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        p.regenAccum = 0;
      }
    }
  }

  private fireWeapon(def: WeaponDef, weapon: Player['weapons'][number]) {
    const p = this.player;
    weapon.ammoInMag--;
    p.fireCooldown = 1 / (def.fireRate * weapon.roll.fireRateMult);
    const color = rarityColor(weapon.roll.rarity);
    const muzzleX = p.x + Math.cos(p.aimAngle) * (PLAYER_RADIUS + 6);
    const muzzleY = p.y + Math.sin(p.aimAngle) * (PLAYER_RADIUS + 6);
    this.projectiles.push(...spawnProjectiles(def, weapon.roll, muzzleX, muzzleY, p.aimAngle, color));
    this.particles.burst(muzzleX, muzzleY, color, 4, 90);
    this.camera.shake(def.id === 'rail_spike' ? 4 : 1.5, 0.06);
    this.sfx.shot(weapon.roll.weaponId);
  }

  private handleShooting(dt: number) {
    const p = this.player;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;

    const weapon = p.currentWeapon;
    const def = WEAPON_DEFS[weapon.roll.weaponId];
    const held = this.actionDown('shoot') || this.input.mouseDown;

    if (def.chargeTime) {
      if (p.reloading) {
        p.charging = false;
        return;
      }
      if (held && weapon.ammoInMag > 0) {
        if (!p.charging) {
          p.charging = true;
          p.chargeTime = 0;
          this.sfx.chargeStart();
        }
        p.chargeTime += dt;
        if (p.chargeTime >= def.chargeTime) {
          this.fireWeapon(def, weapon);
          p.charging = false;
          p.chargeTime = 0;
        }
      } else {
        p.charging = false;
        p.chargeTime = 0;
      }
      return;
    }

    const wantsFire = def.auto ? held : this.actionPressed('shoot') || this.input.wasMousePressed();
    if (!wantsFire || p.reloading) return;
    if (weapon.ammoInMag <= 0) {
      if (weapon.ammoReserve > 0) this.startReload();
      return;
    }
    if (p.fireCooldown > 0) return;
    this.fireWeapon(def, weapon);
  }

  private startReload() {
    const p = this.player;
    if (p.reloading) return;
    const weapon = p.currentWeapon;
    const def = WEAPON_DEFS[weapon.roll.weaponId];
    if (weapon.ammoInMag >= def.magSize || weapon.ammoReserve <= 0) return;
    p.reloading = true;
    p.reloadTimer = def.reloadTime;
    this.sfx.reload();
  }

  private handleReload(dt: number) {
    const p = this.player;
    if (this.actionPressed('reload')) this.startReload();
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        const weapon = p.currentWeapon;
        const def = WEAPON_DEFS[weapon.roll.weaponId];
        const need = def.magSize - weapon.ammoInMag;
        const take = Math.min(need, weapon.ammoReserve);
        weapon.ammoInMag += take;
        weapon.ammoReserve -= take;
        p.reloading = false;
      }
    }

    if (this.actionPressed('swapWeapon')) {
      p.currentWeaponIndex = (p.currentWeaponIndex + 1) % p.weapons.length;
      p.reloading = false;
      p.charging = false;
    }
    if (this.actionPressed('weapon1') && p.weapons[0]) p.currentWeaponIndex = 0;
    if (this.actionPressed('weapon2') && p.weapons[1]) p.currentWeaponIndex = 1;
  }

  private handleMelee(dt: number) {
    const p = this.player;
    if (p.meleeCooldown > 0) p.meleeCooldown -= dt;
    if (!this.actionPressed('melee') || p.meleeCooldown > 0) return;
    p.meleeCooldown = 0.5;
    this.sfx.melee();
    this.particles.burst(p.x + Math.cos(p.aimAngle) * 30, p.y + Math.sin(p.aimAngle) * 30, '#e8e8ea', 6, 140);

    const rampageActive = p.character.id === 'brawler' && p.ultimateActiveTimer > 0;
    const dmg = MELEE_DAMAGE * p.character.meleeDamageMult * (rampageActive ? 2.2 : 1);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MELEE_RANGE + e.radius) continue;
      const angleTo = Math.atan2(dy, dx);
      let diff = Math.abs(angleTo - p.aimAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > MELEE_ARC / 2) continue;
      const killed = e.takeDamage(dmg);
      this.particles.floatText(e.x, e.y - 10, `-${Math.round(dmg)}`, '#ffffff');
      if (killed) {
        this.onEnemyKilled(e);
        if (p.character.id === 'brawler') p.hp = Math.min(p.maxHp, p.hp + (rampageActive ? 16 : 8));
      }
    }
  }

  private handleAbility(dt: number) {
    const p = this.player;
    if (p.abilityCooldown > 0) p.abilityCooldown -= dt;
    if (!this.actionPressed('ability') || p.abilityCooldown > 0) return;
    p.abilityCooldown = p.character.activeCooldown;
    this.camera.shake(3, 0.15);
    this.sfx.abilityUse();

    if (p.character.id === 'recon') {
      const range = 260;
      const fx = p.x + Math.cos(p.aimAngle) * 140;
      const fy = p.y + Math.sin(p.aimAngle) * 140;
      p.visionBoostTimer = 3;
      this.particles.burst(fx, fy, '#3ddc73', 20, 220);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - fx, e.y - fy) <= range) {
          e.slowTimer = 3;
          e.slowFactor = 0.35;
        }
      }
    } else if (p.character.id === 'brawler') {
      const radius = 130;
      this.particles.burst(p.x, p.y, '#e04b3d', 24, 260);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius) {
          const killed = e.takeDamage(30);
          const push = 320;
          e.knockX += (dx / (dist || 1)) * push;
          e.knockY += (dy / (dist || 1)) * push;
          if (killed) this.onEnemyKilled(e);
        }
      }
    } else if (p.character.id === 'medic') {
      p.hp = Math.min(p.maxHp, p.hp + 35);
      this.particles.burst(p.x, p.y, '#3d9bdc', 18, 160);
      this.particles.floatText(p.x, p.y - 30, '+35 HP', '#3d9bdc');
    }
  }

  private handleUltimate(dt: number) {
    const p = this.player;
    if (p.ultimateCooldown > 0) p.ultimateCooldown -= dt;
    if (p.ultimateActiveTimer > 0) p.ultimateActiveTimer -= dt;
    if (p.visionBoostTimer > 0) p.visionBoostTimer -= dt;
    if (p.shieldTimer > 0) {
      p.shieldTimer -= dt;
      if (p.shieldTimer <= 0) p.shieldFrac = 0;
    }

    if (!this.actionPressed('ultimate') || !p.ultimateUnlocked || p.ultimateCooldown > 0) return;
    p.ultimateCooldown = p.character.ultimateCooldown;
    this.camera.shake(7, 0.3);
    this.sfx.ultimateUse();

    if (p.character.id === 'recon') {
      const mx = p.x + Math.cos(p.aimAngle) * 200;
      const my = p.y + Math.sin(p.aimAngle) * 200;
      this.pendingAirstrike = { x: mx, y: my, timer: 0.6 };
      p.visionBoostTimer = 4;
    } else if (p.character.id === 'brawler') {
      p.ultimateActiveTimer = 6;
      this.particles.burst(p.x, p.y, '#ff8a7a', 30, 240);
    } else if (p.character.id === 'medic') {
      p.hp = p.maxHp;
      p.shieldFrac = 0.5;
      p.shieldTimer = 5;
      this.particles.burst(p.x, p.y, '#9fd6ff', 30, 220);
      this.particles.floatText(p.x, p.y - 30, 'FULL HEAL + SHIELD', '#9fd6ff');
    }
  }

  private updateAirstrike(dt: number) {
    if (!this.pendingAirstrike) return;
    this.pendingAirstrike.timer -= dt;
    if (this.pendingAirstrike.timer <= 0) {
      const { x, y } = this.pendingAirstrike;
      const radius = 160;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - x, e.y - y) < radius) {
          const killed = e.takeDamage(230);
          this.particles.floatText(e.x, e.y - 14, '-230', '#8dffb0');
          if (killed) this.onEnemyKilled(e);
        }
      }
      this.particles.burst(x, y, '#8dffb0', 40, 300);
      this.camera.shake(10, 0.35);
      this.sfx.explosion();
      this.hitStopTimer = Math.max(this.hitStopTimer, 0.08);
      this.pendingAirstrike = null;
    }
  }

  private handleInteract() {
    if (!this.actionPressed('interact')) return;
    const p = this.player;

    const doorIdx = this.level.nearestClosedDoor(p.x, p.y);
    if (doorIdx !== null && this.level.distToDoor(doorIdx, p.x, p.y) < 90) {
      const cost = this.level.doors[doorIdx].cost;
      if (p.points >= cost) {
        p.points -= cost;
        this.level.buyDoor(doorIdx);
        this.camera.shake(4, 0.2);
        this.sfx.doorOpen();
        const d = this.level.doors[doorIdx];
        this.particles.burst(d.x, (d.gapTop + d.gapBottom) / 2, '#ffb84d', 20, 200);
      }
      return;
    }

    let nearestStation: Station | null = null;
    let bestDist = 90;
    for (const s of this.level.stations) {
      if (s.collected || s.kind === 'treasure') continue;
      const dist = Math.hypot(p.x - s.x, p.y - s.y);
      if (dist < bestDist) {
        bestDist = dist;
        nearestStation = s;
      }
    }
    if (!nearestStation) return;

    if (nearestStation.kind === 'mysterybox') {
      const cost = this.mysteryBox.cost;
      if (p.points >= cost) {
        p.points -= cost;
        this.mysteryBox.pull();
        const roll = rollWeapon(MYSTERY_BOX_POOL);
        p.addWeapon(roll);
        const color = rarityColor(roll.rarity);
        this.particles.burst(nearestStation.x, nearestStation.y, color, 30, 260);
        this.particles.floatText(
          nearestStation.x,
          nearestStation.y - 40,
          `${WEAPON_DEFS[roll.weaponId].name.toUpperCase()} (${roll.rarity.toUpperCase()})`,
          color,
        );
        this.camera.shake(5, 0.25);
        this.sfx.rarityFanfare(roll.rarity);
      }
    } else if (nearestStation.kind === 'workbench') {
      const roll = p.currentWeapon.roll;
      const rarityIndex = RARITY_ORDER.indexOf(roll.rarity);
      const cost = WORKBENCH_BASE_COST + rarityIndex * WORKBENCH_COST_STEP;
      if (canUpgrade(roll) && p.points >= cost) {
        p.points -= cost;
        p.currentWeapon.roll = upgradeWeaponRoll(roll);
        const color = rarityColor(p.currentWeapon.roll.rarity);
        this.particles.burst(nearestStation.x, nearestStation.y, color, 26, 220);
        this.particles.floatText(nearestStation.x, nearestStation.y - 40, 'UPGRADED!', color);
        this.camera.shake(4, 0.2);
        this.sfx.rarityFanfare(p.currentWeapon.roll.rarity);
      }
    }
  }

  // ---------------- ENEMY AI ----------------

  private seekPlayer(e: Enemy, dt: number) {
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = e.speed * e.slowFactor;
    let vx = (dx / dist) * speed;
    let vy = (dy / dist) * speed;
    e.knockX *= 1 - 8 * dt;
    e.knockY *= 1 - 8 * dt;
    vx += e.knockX;
    vy += e.knockY;
    const resolved = resolveWallCollisions(e.x + vx * dt, e.y + vy * dt, e.radius, this.level.allWalls());
    e.x = resolved.x;
    e.y = resolved.y;
  }

  private updateSpitter(e: Enemy, dt: number) {
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const attackRange = 260;
    const retreatRange = 150;
    let dirX = 0;
    let dirY = 0;
    if (dist > attackRange) {
      dirX = dx / dist;
      dirY = dy / dist;
    } else if (dist < retreatRange) {
      dirX = -dx / dist;
      dirY = -dy / dist;
    }
    const speed = e.speed * e.slowFactor;
    let vx = dirX * speed;
    let vy = dirY * speed;
    e.knockX *= 1 - 8 * dt;
    e.knockY *= 1 - 8 * dt;
    vx += e.knockX;
    vy += e.knockY;
    const resolved = resolveWallCollisions(e.x + vx * dt, e.y + vy * dt, e.radius, this.level.allWalls());
    e.x = resolved.x;
    e.y = resolved.y;

    e.rangedCooldown -= dt;
    if (dist < 420 && e.rangedCooldown <= 0) {
      e.rangedCooldown = 1.6;
      const angle = Math.atan2(dy, dx);
      this.enemyProjectiles.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(angle) * 380,
        vy: Math.sin(angle) * 380,
        damage: 9,
        radius: 5,
        alive: true,
        distanceLeft: 600,
      });
      this.particles.burst(e.x, e.y, '#6bcf5f', 4, 80);
    }
  }

  private updateExplosive(e: Enemy, dt: number) {
    const p = this.player;
    if (!e.armed) {
      const dist = Math.hypot(p.x - e.x, p.y - e.y);
      if (dist < e.radius + PLAYER_RADIUS + 16) {
        e.armed = true;
        e.explodeTimer = 0.45;
      } else {
        this.seekPlayer(e, dt);
      }
    }
    if (e.armed) {
      e.explodeTimer -= dt;
      if (e.explodeTimer <= 0) {
        this.explodeAt(e.x, e.y, 90, 32);
        e.alive = false;
      }
    }
  }

  private updateBoss(e: Enemy, dt: number) {
    const p = this.player;
    switch (e.bossState) {
      case 'approach': {
        this.seekPlayer(e, dt);
        e.bossTimer -= dt;
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist < 260 || e.bossTimer <= 0) {
          e.bossState = 'windup';
          e.bossTimer = 0.8;
          this.sfx.bossRoar();
        }
        break;
      }
      case 'windup': {
        e.bossTimer -= dt;
        if (e.bossTimer <= 0) {
          const dx = p.x - e.x;
          const dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.lungeDirX = dx / d;
          e.lungeDirY = dy / d;
          e.bossState = 'lunge';
          e.bossTimer = 0.4;
        }
        break;
      }
      case 'lunge': {
        e.bossTimer -= dt;
        const speed = 780;
        const resolved = resolveWallCollisions(e.x + e.lungeDirX * speed * dt, e.y + e.lungeDirY * speed * dt, e.radius, this.level.allWalls());
        e.x = resolved.x;
        e.y = resolved.y;
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist < e.radius + PLAYER_RADIUS + 6 && e.attackCooldown <= 0 && p.alive) {
          const dealt = p.takeDamage(e.damage * 1.8);
          if (dealt) {
            e.attackCooldown = 1;
            this.camera.shake(8, 0.2);
            this.sfx.damageTaken();
            this.killStreak = 0;
          }
        }
        if (e.bossTimer <= 0) {
          e.bossState = 'cooldown';
          e.bossTimer = 1.3;
        }
        break;
      }
      case 'cooldown': {
        e.bossTimer -= dt;
        if (e.bossTimer <= 0) {
          e.bossState = 'approach';
          e.bossTimer = 2;
        }
        break;
      }
    }
  }

  private explodeAt(x: number, y: number, radius: number, damage: number) {
    this.particles.burst(x, y, '#ff9d2e', 26, 260);
    this.camera.shake(6, 0.25);
    this.sfx.explosion();
    this.hitStopTimer = Math.max(this.hitStopTimer, 0.05);
    const p = this.player;
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < radius + PLAYER_RADIUS && p.alive) {
      const dealt = p.takeDamage(damage * (1 - dist / (radius + PLAYER_RADIUS)));
      if (dealt) {
        this.sfx.damageTaken();
        this.killStreak = 0;
      }
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.attackCooldown > 0) e.attackCooldown -= dt;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }

      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          const dmg = e.burnDps * 0.5;
          const killed = e.takeDamage(dmg);
          this.particles.floatText(e.x, e.y - 14, `-${Math.round(dmg)}`, '#ff9d2e');
          if (killed) {
            this.onEnemyKilled(e);
            if (e.kind === 'explosive') this.explodeAt(e.x, e.y, 90, 32);
            continue;
          }
        }
      }

      if (e.kind === 'explosive') {
        this.updateExplosive(e, dt);
        if (!e.alive) continue;
      } else if (e.kind === 'spitter') {
        this.updateSpitter(e, dt);
      } else if (e.kind === 'boss') {
        this.updateBoss(e, dt);
      } else {
        this.seekPlayer(e, dt);
      }

      if (e.kind !== 'explosive' && e.kind !== 'boss') {
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist < e.radius + PLAYER_RADIUS + 4 && e.attackCooldown <= 0 && p.alive) {
          const dealt = p.takeDamage(e.damage);
          if (dealt) {
            e.attackCooldown = 0.7;
            this.camera.shake(3, 0.12);
            this.particles.burst(p.x, p.y, '#e04b3d', 8, 140);
            this.sfx.damageTaken();
            this.killStreak = 0;
            if (e.kind === 'vampire') {
              e.hp = Math.min(e.maxHp, e.hp + e.damage * e.lifestealFrac);
              this.particles.burst(e.x, e.y, '#b13d8a', 10, 120);
            }
          }
        }
      }
    }
  }

  private updateEnemyProjectiles(dt: number) {
    const p = this.player;
    for (const proj of this.enemyProjectiles) {
      if (!proj.alive) continue;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.distanceLeft -= Math.hypot(proj.vx, proj.vy) * dt;
      if (proj.distanceLeft <= 0) {
        proj.alive = false;
        continue;
      }
      for (const w of this.level.allWalls()) {
        if (circleRectCollide(proj.x, proj.y, proj.radius, w)) {
          proj.alive = false;
          break;
        }
      }
      if (!proj.alive) continue;
      if (p.alive) {
        const dist = Math.hypot(proj.x - p.x, proj.y - p.y);
        if (dist < proj.radius + PLAYER_RADIUS) {
          const dealt = p.takeDamage(proj.damage);
          if (dealt) {
            this.sfx.damageTaken();
            this.camera.shake(2, 0.08);
            this.killStreak = 0;
          }
          proj.alive = false;
        }
      }
    }
    this.enemyProjectiles = this.enemyProjectiles.filter((p) => p.alive);
  }

  private updateProjectiles(dt: number) {
    const totalW = this.level.totalWidth();
    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.distanceLeft -= Math.hypot(proj.vx, proj.vy) * dt;
      if (proj.distanceLeft <= 0 || proj.x < 0 || proj.x > totalW || proj.y < 0 || proj.y > WORLD_H) {
        proj.alive = false;
        continue;
      }

      for (const w of this.level.allWalls()) {
        if (circleRectCollide(proj.x, proj.y, proj.radius, w)) {
          proj.alive = false;
          break;
        }
      }
      if (!proj.alive) continue;

      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dist = Math.hypot(proj.x - e.x, proj.y - e.y);
        if (dist < proj.radius + e.radius) {
          const killed = e.takeDamage(proj.damage);
          this.particles.floatText(e.x, e.y - 12, `-${Math.round(proj.damage)}`, '#ffffff');
          this.particles.burst(proj.x, proj.y, proj.color, 5, 100);
          const kdx = e.x - proj.x;
          const kdy = e.y - proj.y;
          const kd = Math.hypot(kdx, kdy) || 1;
          e.knockX += (kdx / kd) * proj.knockback;
          e.knockY += (kdy / kd) * proj.knockback;
          if (proj.slow) {
            e.slowTimer = 1.5;
            e.slowFactor = Math.min(e.slowFactor, 1 - proj.slow);
          }
          if (proj.burn) {
            e.burnTimer = 3;
            e.burnDps = Math.max(e.burnDps, proj.burn);
            if (e.burnTick <= 0) e.burnTick = 0.5;
          }
          if (killed) {
            this.onEnemyKilled(e);
            if (e.kind === 'explosive') this.explodeAt(e.x, e.y, 90, 32);
          }

          if (proj.chain && proj.chain > 0) {
            this.applyChain(e, proj.damage);
          }

          if (proj.pierce > 0) {
            proj.pierce--;
          } else {
            proj.alive = false;
          }
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private applyChain(origin: Enemy, baseDamage: number) {
    const visited = new Set<Enemy>([origin]);
    let fromX = origin.x;
    let fromY = origin.y;
    for (let i = 0; i < 3; i++) {
      let next: Enemy | null = null;
      let bestDist = 140;
      for (const other of this.enemies) {
        if (!other.alive || visited.has(other)) continue;
        const d = Math.hypot(other.x - fromX, other.y - fromY);
        if (d < bestDist) {
          bestDist = d;
          next = other;
        }
      }
      if (!next) break;
      visited.add(next);
      const chainDamage = baseDamage * 0.7;
      const killed = next.takeDamage(chainDamage);
      this.particles.floatText(next.x, next.y - 12, `-${Math.round(chainDamage)}`, '#ffe066');
      this.particles.burst(next.x, next.y, '#ffe066', 6, 120);
      if (killed) {
        this.onEnemyKilled(next);
        if (next.kind === 'explosive') this.explodeAt(next.x, next.y, 90, 32);
      }
      fromX = next.x;
      fromY = next.y;
    }
  }

  private onEnemyKilled(e: Enemy) {
    this.particles.burst(e.x, e.y, '#ff5555', 16, 220);
    this.camera.shake(2.5, 0.08);
    this.hitStopTimer = Math.max(this.hitStopTimer, 0.035);
    this.sfx.kill();
    const pointsAwarded = 60 + this.round * 5;
    this.pointFlyers.spawn(e.x, e.y, pointsAwarded);
    this.sfx.points();
    this.stats.kills++;
    this.killStreak++;
    this.killStreakTimer = 3;

    if (e.kind === 'boss') this.onBossKilled();
  }

  private onBossKilled() {
    const p = this.player;
    p.points += 400 + this.round * 20;
    this.runBonusEssence += 60;
    let roll = rollWeapon(MYSTERY_BOX_POOL);
    while (RARITY_ORDER.indexOf(roll.rarity) < 2) roll = upgradeWeaponRoll(roll);
    p.addWeapon(roll);
    this.particles.floatText(p.x, p.y - 40, `BOSS DOWN — ${WEAPON_DEFS[roll.weaponId].name.toUpperCase()}`, rarityColor(roll.rarity));
    this.sfx.rarityFanfare('legendary');
  }

  // ---------------- RENDER ----------------

  private render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.scene === 'select') return this.renderSelect();
    if (this.scene === 'hub') return this.renderHub();
    if (this.scene === 'controls') return this.renderControls();
    if (this.scene === 'results') return this.renderResults();

    ctx.save();
    ctx.translate(-this.camera.x + this.camera.offsetX, -this.camera.y + this.camera.offsetY);

    this.renderFloor();
    this.level.draw(ctx);
    this.renderStations();
    this.renderAirstrikeMarker();
    this.renderEnemyProjectiles();
    this.renderProjectiles();
    this.renderEnemies();
    this.renderCompanion();
    this.renderPlayer();
    this.particles.draw(ctx);
    this.pointFlyers.draw(ctx);

    ctx.restore();

    this.renderLighting();
    drawHud(ctx, this.player, this.level, this.getHudState());

    if (!this.player.alive) {
      ctx.fillStyle = 'rgba(120,0,0,0.25)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.paused) {
      ctx.fillStyle = 'rgba(6,7,10,0.72)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8e8ea';
      ctx.font = 'bold 32px monospace';
      ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 10);
      ctx.font = '13px monospace';
      ctx.fillStyle = '#9aa0ac';
      ctx.fillText(`Press ${formatKeyCode(this.keybinds.pause)} to resume`, VIEW_W / 2, VIEW_H / 2 + 20);
    }
  }

  private getHudState(): HudState {
    const boss = this.enemies.find((e) => e.alive && e.kind === 'boss') ?? null;
    const hint = `${formatKeyCode(this.keybinds.moveUp)}${formatKeyCode(this.keybinds.moveLeft)}${formatKeyCode(this.keybinds.moveDown)}${formatKeyCode(this.keybinds.moveRight)} move · Mouse aim · Click/${formatKeyCode(this.keybinds.shoot)} shoot · ${formatKeyCode(this.keybinds.dash)} dash`;
    return {
      round: this.round,
      depth: this.level.depth(),
      enemiesRemaining: this.enemies.filter((e) => e.alive).length + this.enemiesToSpawn.length,
      killStreak: this.killStreak,
      intermissionTimer: this.intermissionTimer,
      tutorialTimer: this.tutorialTimer,
      controlsHint: hint,
      boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
      companion: this.companion ? { level: this.companion.level, rarity: this.companion.rarity } : null,
    };
  }

  private renderFloor() {
    const ctx = this.ctx;
    const totalW = this.level.totalWidth();
    const viewStart = Math.max(0, this.camera.x - 60);
    const viewEnd = Math.min(totalW, this.camera.x + VIEW_W + 60);
    ctx.fillStyle = '#0d0f13';
    ctx.fillRect(viewStart, 0, viewEnd - viewStart, WORLD_H);

    const size = 22;
    const hexH = Math.sqrt(3) * size;
    const horiz = size * 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;

    const startCol = Math.floor(viewStart / horiz) - 1;
    const endCol = Math.ceil(viewEnd / horiz) + 1;
    for (let col = startCol; col <= endCol; col++) {
      const x = col * horiz;
      if (x < viewStart - size * 2 || x > viewEnd + size * 2) continue;
      const colOffset = col % 2 !== 0 ? hexH / 2 : 0;
      const startRow = Math.floor(-colOffset / hexH) - 1;
      const endRow = Math.ceil((WORLD_H - colOffset) / hexH) + 1;
      for (let row = startRow; row <= endRow; row++) {
        const y = row * hexH + colOffset;
        if (y < -hexH || y > WORLD_H + hexH) continue;
        drawHexTile(ctx, x, y, size);
      }
    }
  }

  private renderStations() {
    const ctx = this.ctx;
    for (const s of this.level.stations) {
      if (s.collected) continue;
      if (s.kind === 'mysterybox') {
        ctx.save();
        ctx.shadowColor = '#a24ddc';
        ctx.shadowBlur = 20;
        roundRectPath(ctx, s.x - 22, s.y - 14, 44, 30, 4);
        ctx.fillStyle = '#3a2350';
        ctx.fill();
        ctx.strokeStyle = '#a24ddc';
        ctx.lineWidth = 2;
        ctx.stroke();
        roundRectPath(ctx, s.x - 22, s.y - 22, 44, 12, 4);
        ctx.fillStyle = '#4a2f66';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#d9a9ff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', s.x, s.y + 4);
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`[F] Mystery Box — ${this.mysteryBox.cost}`, s.x, s.y - 32);
      } else if (s.kind === 'workbench') {
        ctx.save();
        ctx.shadowColor = '#ff9d2e';
        ctx.shadowBlur = 18;
        roundRectPath(ctx, s.x - 24, s.y - 16, 48, 32, 4);
        ctx.fillStyle = '#4a3018';
        ctx.fill();
        ctx.strokeStyle = '#ff9d2e';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x - 14, s.y);
        ctx.lineTo(s.x + 14, s.y);
        ctx.moveTo(s.x, s.y - 10);
        ctx.lineTo(s.x, s.y + 10);
        ctx.stroke();
        ctx.restore();
        const roll = this.player?.currentWeapon.roll;
        let label = '[F] Upgrade Weapon';
        if (roll) {
          if (!canUpgrade(roll)) label = 'MAX RARITY';
          else {
            const idx = RARITY_ORDER.indexOf(roll.rarity);
            label = `[F] Upgrade Weapon — ${WORKBENCH_BASE_COST + idx * WORKBENCH_COST_STEP}`;
          }
        }
        ctx.fillStyle = '#ffcf9e';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, s.x, s.y - 24);
      } else if (s.kind === 'treasure') {
        const pulse = (Math.sin(this.flickerPhase * 6) + 1) / 2;
        ctx.save();
        ctx.shadowColor = '#ffd23d';
        ctx.shadowBlur = 14 + pulse * 10;
        ctx.fillStyle = '#7a5f10';
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          drawDiamond(ctx, s.x + Math.cos(ang) * 10, s.y + Math.sin(ang) * 8, 6, '#ffd23d');
        }
        ctx.restore();
        ctx.fillStyle = '#ffe9a8';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('treasure — walk over to collect', s.x, s.y - 26);
      }
    }
  }

  private renderAirstrikeMarker() {
    if (!this.pendingAirstrike) return;
    const ctx = this.ctx;
    const { x, y, timer } = this.pendingAirstrike;
    const pulse = (Math.sin(this.flickerPhase * 20) + 1) / 2;
    ctx.strokeStyle = `rgba(141,255,176,${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 160 * (1 - (timer / 0.6) * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderEnemyProjectiles() {
    const ctx = this.ctx;
    for (const proj of this.enemyProjectiles) {
      ctx.save();
      ctx.shadowColor = '#6bcf5f';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#6bcf5f';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderEnemies() {
    const ctx = this.ctx;
    const pulse = (Math.sin(this.flickerPhase * 10) + 1) / 2;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      let fill = enemyColor(e.kind);
      if (e.kind === 'explosive' && e.armed) fill = pulse > 0.5 ? '#ffffff' : '#ff9d2e';
      else if (e.kind === 'boss' && e.bossState === 'windup') fill = pulse > 0.5 ? '#ffffff' : '#c22f2f';
      else if (e.hitFlash > 0) fill = '#ffffff';
      else if (e.slowFactor < 1) fill = '#7fd6ff';

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();

      const barW = e.kind === 'boss' ? 54 : 30;
      const hpFrac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#1a1c22';
      ctx.fillRect(e.x - barW / 2, e.y - e.radius - 12, barW, 4);
      ctx.fillStyle = e.kind === 'boss' ? '#c22f2f' : '#e04b3d';
      ctx.fillRect(e.x - barW / 2, e.y - e.radius - 12, barW * hpFrac, 4);
    }
  }

  private renderCompanion() {
    if (!this.companion) return;
    const ctx = this.ctx;
    const c = this.companion;
    const color = rarityColor(c.rarity);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderProjectiles() {
    const ctx = this.ctx;
    for (const proj of this.projectiles) {
      ctx.save();
      ctx.shadowColor = proj.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = proj.color;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderPlayer() {
    const p = this.player;
    const ctx = this.ctx;
    ctx.save();
    if (p.isInvincible) ctx.globalAlpha = 0.5;
    ctx.shadowColor = p.character.color;
    ctx.shadowBlur = p.isDashing ? 20 : 8;
    ctx.fillStyle = p.character.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (p.shieldFrac > 0) {
      ctx.strokeStyle = 'rgba(159,214,255,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#e8e8ea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 26, p.y + Math.sin(p.aimAngle) * 26);
    ctx.stroke();
  }

  private renderLighting() {
    const ctx = this.ctx;
    const p = this.player;
    const screenX = p.x - this.camera.x + this.camera.offsetX;
    const screenY = p.y - this.camera.y + this.camera.offsetY;
    const boost = p.visionBoostTimer > 0 ? 1.5 : 1;
    const coneRadius = Math.max(60, BASE_VISION_RADIUS * p.character.visionMult * boost + Math.sin(this.flickerPhase * 7) * 5);
    const ambientRadius = coneRadius * 0.42;
    const halfAngle = Math.PI / 5.2;

    const mask = this.lightMaskCtx;
    mask.clearRect(0, 0, VIEW_W, VIEW_H);
    mask.globalCompositeOperation = 'source-over';
    mask.fillStyle = `rgba(4,5,7,${1 - AMBIENT_LIGHT})`;
    mask.fillRect(0, 0, VIEW_W, VIEW_H);
    mask.globalCompositeOperation = 'destination-out';

    const ambGrad = mask.createRadialGradient(screenX, screenY, 0, screenX, screenY, ambientRadius);
    ambGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
    ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
    mask.fillStyle = ambGrad;
    mask.beginPath();
    mask.arc(screenX, screenY, ambientRadius, 0, Math.PI * 2);
    mask.fill();

    mask.save();
    mask.translate(screenX, screenY);
    mask.rotate(p.aimAngle);
    const coneGrad = mask.createRadialGradient(0, 0, 0, 0, 0, coneRadius);
    coneGrad.addColorStop(0, 'rgba(0,0,0,1)');
    coneGrad.addColorStop(0.75, 'rgba(0,0,0,0.9)');
    coneGrad.addColorStop(1, 'rgba(0,0,0,0)');
    mask.fillStyle = coneGrad;
    mask.beginPath();
    mask.moveTo(0, 0);
    mask.arc(0, 0, coneRadius, -halfAngle, halfAngle);
    mask.closePath();
    mask.fill();
    mask.restore();

    mask.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightMaskCanvas, 0, 0);

    const vgrad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
    vgrad.addColorStop(0, 'rgba(0,0,0,0)');
    vgrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vgrad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // ---------------- MENU CHROME ----------------

  private renderMenuBackground() {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.32, 40, VIEW_W / 2, VIEW_H * 0.32, VIEW_H * 0.95);
    grad.addColorStop(0, '#1b1e26');
    grad.addColorStop(1, '#07080a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 26; i++) {
      const seed = i * 37.13;
      const x = (Math.sin(seed) * 0.5 + 0.5) * VIEW_W;
      const baseY = (Math.cos(seed * 1.7) * 0.5 + 0.5) * VIEW_H;
      let y = (baseY + this.flickerPhase * 9 * (i % 2 === 0 ? 1 : -1)) % VIEW_H;
      if (y < 0) y += VIEW_H;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderTitleBar(title: string, accent: string) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e8ea';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(title, VIEW_W / 2, 40);
    ctx.fillStyle = accent;
    roundRectPath(ctx, VIEW_W / 2 - 60, 50, 120, 4, 2);
    ctx.fill();
  }

  // ---------------- SELECT RENDER ----------------

  private renderSelect() {
    const ctx = this.ctx;
    this.renderMenuBackground();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e8ea';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('OUTBREAK 2D', VIEW_W / 2, 56);
    ctx.fillStyle = '#3ddc73';
    roundRectPath(ctx, VIEW_W / 2 - 70, 66, 140, 4, 2);
    ctx.fill();
    ctx.font = '13px monospace';
    ctx.fillStyle = '#9aa0ac';
    ctx.fillText('BLACKROCK FACILITY', VIEW_W / 2, 88);

    drawEssenceBadge(ctx, VIEW_W / 2 - 78, 108, this.meta.essence);
    drawTokenBadge(ctx, VIEW_W / 2 + 78, 108, this.meta.tokens);

    const cardW = 220;
    const cardH = 268;
    const gap = 30;
    const totalW = cardW * 3 + gap * 2;
    const startX = VIEW_W / 2 - totalW / 2;
    const y = 132;

    CHARACTER_ORDER.forEach((id, i) => {
      const def = CHARACTER_DEFS[id];
      const x = startX + i * (cardW + gap);
      const selected = i === this.selectedCharacterIndex;
      const unlocked = this.meta.ultimatesUnlocked[id];
      const pulse = selected ? (Math.sin(this.flickerPhase * 4) + 1) / 2 : 0;

      ctx.save();
      drawPanel(ctx, x, y, cardW, cardH, selected ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)', selected ? def.color : 'rgba(255,255,255,0.14)', selected ? 2.5 : 1, 16);
      if (selected) {
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 16 + pulse * 10;
        roundRectPath(ctx, x, y, cardW, cardH, 16);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.shadowColor = def.color;
      ctx.shadowBlur = selected ? 26 : 10;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x + cardW / 2, y + 60, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#e8e8ea';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.name, x + cardW / 2, y + 116);

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText(`♥ ${def.maxHp}`, x + cardW / 2 - 34, y + 134);
      ctx.fillStyle = '#8dd6ff';
      ctx.fillText(`▲ ${def.moveSpeed}`, x + cardW / 2 + 34, y + 134);

      ctx.font = '10px monospace';
      ctx.fillStyle = '#9aa0ac';
      wrapText(ctx, `Passive: ${def.passiveLabel}`, x + cardW / 2, y + 156, cardW - 24, 13);
      wrapText(ctx, `[E] ${def.activeLabel}`, x + cardW / 2, y + 194, cardW - 24, 13);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = unlocked ? def.ultimateColor : '#555a66';
      const ultPrefix = unlocked ? '[X]' : '🔒';
      wrapText(ctx, `${ultPrefix} ${unlocked ? def.ultimateLabel : 'Ultimate locked — Upgrades menu'}`, x + cardW / 2, y + 228, cardW - 20, 12);

      ctx.font = '10px monospace';
      ctx.fillStyle = '#555a66';
      ctx.fillText(`Key ${i + 1}`, x + cardW / 2, y + cardH - 8);
    });

    const btnW = 176;
    const btnH = 50;
    const btnGap = 16;
    const totalBtnW = btnW * 3 + btnGap * 2;
    const btnStartX = VIEW_W / 2 - totalBtnW / 2;
    const btnY = 452;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const hovering = (bx: number) => mx >= bx && mx <= bx + btnW && my >= btnY && my <= btnY + btnH;

    drawButton(ctx, btnStartX, btnY, btnW, btnH, 'DROP IN', '#3ddc73', hovering(btnStartX));
    drawButton(ctx, btnStartX + btnW + btnGap, btnY, btnW, btnH, 'UPGRADES [U]', '#3d9bdc', hovering(btnStartX + btnW + btnGap));
    drawButton(ctx, btnStartX + (btnW + btnGap) * 2, btnY, btnW, btnH, 'CONTROLS [C]', '#a24ddc', hovering(btnStartX + (btnW + btnGap) * 2));

    ctx.fillStyle = '#555a66';
    ctx.font = '11px monospace';
    ctx.fillText('Arrow keys / click to select · Enter or Space to start', VIEW_W / 2, 540);
  }

  private renderHub() {
    const ctx = this.ctx;
    this.renderMenuBackground();
    this.renderTitleBar('UPGRADES', '#3d9bdc');
    drawEssenceBadge(ctx, VIEW_W / 2 - 78, 76, this.meta.essence);
    drawTokenBadge(ctx, VIEW_W / 2 + 78, 76, this.meta.tokens);

    const rows = this.getHubRows();
    const rowH = 44;
    const startY = 112;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    rows.forEach((row, i) => {
      const ry = startY + i * rowH;
      const hover = mx >= 90 && mx <= VIEW_W - 90 && my >= ry && my <= ry + rowH - 8;
      drawPanel(ctx, 90, ry, VIEW_W - 180, rowH - 8, hover && row.buyable ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.1)', 1, 10);
      ctx.fillStyle = row.accent;
      roundRectPath(ctx, 90, ry, 4, rowH - 8, 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = '#e8e8ea';
      ctx.fillText(row.label, 106, ry + 24);

      ctx.textAlign = 'right';
      ctx.font = 'bold 13px monospace';
      if (row.cost === null) {
        ctx.fillStyle = '#3ddc73';
        ctx.fillText('✓ ' + row.statusText, VIEW_W - 106, ry + 24);
      } else {
        const affordColor = row.currency === 'essence' ? '#ffd23d' : '#9fe6ff';
        ctx.fillStyle = row.buyable ? affordColor : '#6b6f78';
        const iconX = VIEW_W - 106 - ctx.measureText(row.statusText).width - 12;
        if (row.currency === 'essence') drawDiamond(ctx, iconX, ry + 19, 5, ctx.fillStyle as string);
        else drawHexIcon(ctx, iconX, ry + 19, 6, ctx.fillStyle as string);
        ctx.fillText(row.statusText, VIEW_W - 106, ry + 24);
      }
    });

    const btnW = 180;
    const btnY = 508;
    drawButton(ctx, VIEW_W / 2 - btnW / 2, btnY, btnW, 44, 'BACK [Esc]', '#e04b3d', mx >= VIEW_W / 2 - btnW / 2 && mx <= VIEW_W / 2 + btnW / 2 && my >= btnY && my <= btnY + 44);
  }

  private renderControls() {
    const ctx = this.ctx;
    this.renderMenuBackground();
    this.renderTitleBar('CONTROLS', '#a24ddc');

    const rowH = 26;
    const startY = 66;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    ACTION_ORDER.forEach((action, i) => {
      const ry = startY + i * rowH;
      const listening = this.listeningForAction === action;
      const hover = mx >= 60 && mx <= VIEW_W - 60 && my >= ry && my <= ry + rowH - 3;
      drawPanel(ctx, 60, ry, VIEW_W - 120, rowH - 3, listening ? 'rgba(255,210,61,0.12)' : hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0.08)', 1, 6);

      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
      ctx.fillStyle = '#e8e8ea';
      ctx.fillText(ACTION_LABELS[action], 74, ry + 17);

      const chipLabel = listening ? '...' : formatKeyCode(this.keybinds[action] || '—');
      drawKeyChip(ctx, VIEW_W - 130, ry + rowH / 2 - 1, chipLabel, listening);
    });

    ctx.fillStyle = '#555a66';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.listeningForAction ? 'Press any key to bind... (Esc to cancel)' : 'Click a row, then press the key you want', VIEW_W / 2, startY + ACTION_ORDER.length * rowH + 14);

    const resetHover = mx >= VIEW_W / 2 - 190 && mx <= VIEW_W / 2 - 10 && my >= 528 && my <= 568;
    const backHover = mx >= VIEW_W / 2 + 10 && mx <= VIEW_W / 2 + 190 && my >= 528 && my <= 568;
    drawButton(ctx, VIEW_W / 2 - 190, 528, 180, 40, 'RESET DEFAULTS', '#ff9d2e', resetHover, '#0a0c10', 13);
    drawButton(ctx, VIEW_W / 2 + 10, 528, 180, 40, 'BACK [Esc]', '#e04b3d', backHover, '#0a0c10', 13);
  }

  private renderResults() {
    const ctx = this.ctx;
    this.renderMenuBackground();
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#e04b3d';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#e04b3d';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('OVERRUN', VIEW_W / 2, 170);
    ctx.restore();

    drawPanel(ctx, VIEW_W / 2 - 170, 200, 340, 190, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)', 1, 14);
    ctx.fillStyle = '#e8e8ea';
    ctx.font = '16px monospace';
    ctx.fillText(`Rounds survived: ${this.stats.roundsSurvived}`, VIEW_W / 2, 232);
    ctx.fillText(`Rooms explored: ${this.level.depth()}`, VIEW_W / 2, 258);
    ctx.fillText(`Kills: ${this.stats.kills}`, VIEW_W / 2, 284);
    ctx.fillText(`Points earned: ${this.stats.points}`, VIEW_W / 2, 310);
    ctx.fillStyle = '#ffd23d';
    ctx.font = 'bold 14px monospace';
    drawDiamond(ctx, VIEW_W / 2 - 96, 338, 6, '#ffd23d');
    ctx.fillText(`+${this.lastEssenceEarned} ESSENCE BANKED`, VIEW_W / 2 + 6, 343);
    ctx.fillStyle = '#9fe6ff';
    drawHexIcon(ctx, VIEW_W / 2 - 96, 362, 7, '#9fe6ff');
    ctx.fillText(`+${this.lastTokensEarned} TOKENS BANKED`, VIEW_W / 2 + 6, 367);

    const btnW = 260;
    const btnY = 420;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    drawButton(ctx, VIEW_W / 2 - btnW / 2, btnY, btnW, 46, 'CONTINUE', '#3ddc73', mx >= VIEW_W / 2 - btnW / 2 && mx <= VIEW_W / 2 + btnW / 2 && my >= btnY && my <= btnY + 46);
    ctx.fillStyle = '#555a66';
    ctx.font = '11px monospace';
    ctx.fillText('or press Enter / Space', VIEW_W / 2, btnY + 66);
  }
}

// ---------------- shared drawing helpers ----------------

function drawHexTile(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: string, strokeWidth = 1.5, radius = 12) {
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, color: string, hover = false, textColor = '#0a0c10', fontSize = 15) {
  if (hover) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    roundRectPath(ctx, x, y, w, h, 12);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  } else {
    roundRectPath(ctx, x, y, w, h, 12);
    ctx.fillStyle = color;
    ctx.fill();
  }
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + fontSize * 0.35);
}

function drawKeyChip(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string, active: boolean) {
  const w = Math.max(52, label.length * 10 + 20);
  const h = 24;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 6);
  ctx.fillStyle = active ? '#ffd23d' : '#1a1c22';
  ctx.fill();
  ctx.strokeStyle = active ? '#fff2b8' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = active ? '#0a0c10' : '#e8e8ea';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + 4);
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

function drawEssenceBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, amount: number) {
  const label = `${amount}`;
  ctx.font = 'bold 13px monospace';
  const w = ctx.measureText(label).width + 46;
  drawPanel(ctx, cx - w / 2, cy - 12, w, 24, 'rgba(255,210,61,0.1)', 'rgba(255,210,61,0.4)', 1.5, 12);
  drawDiamond(ctx, cx - w / 2 + 18, cy, 6, '#ffd23d');
  ctx.fillStyle = '#ffd23d';
  ctx.textAlign = 'left';
  ctx.fillText(label + ' ESSENCE', cx - w / 2 + 30, cy + 4);
  return w;
}

function drawTokenBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, amount: number) {
  const label = `${amount}`;
  ctx.font = 'bold 13px monospace';
  const w = ctx.measureText(label).width + 42;
  drawPanel(ctx, cx - w / 2, cy - 12, w, 24, 'rgba(159,230,255,0.1)', 'rgba(159,230,255,0.4)', 1.5, 12);
  drawHexIcon(ctx, cx - w / 2 + 16, cy, 7, '#9fe6ff');
  ctx.fillStyle = '#9fe6ff';
  ctx.textAlign = 'left';
  ctx.fillText(label + ' TOKENS', cx - w / 2 + 28, cy + 4);
  return w;
}

function drawHexIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word + ' ';
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
}
