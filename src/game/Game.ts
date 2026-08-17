import { Input } from './Input';
import { Camera } from './Camera';
import { Particles, PointFlyers } from './Particles';
import { Sfx } from './Audio';
import { Level, resolveWallCollisions, circleRectCollide, type Station, type RoomInfo, type DoorInfo } from './Level';
import { Player, Enemy, enemyColor, PLAYER_RADIUS, type EnemyProjectile, type Turret } from './Entities';
import {
  Companion,
  drawCompanion,
  companionName,
  companionStats,
  SPECIES_DEFS,
  COMPANION_LEVEL_CAP,
  type CompanionSave,
} from './Companions';
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
  loadSettings,
  saveSettings,
  essenceForRun,
  tokensForRun,
  ULTIMATE_UNLOCK_COST,
  companionLevelCost,
  companionBoxCost,
  rollNewCompanion,
  companionSlots,
  nextSlotCost,
  activeCompanion,
  MAX_COMPANION_SLOTS,
  type MetaState,
  type AudioSettings,
} from './Meta';
import { SKILL_NODES, BRANCH_COLOR, BRANCH_LABEL, computeEffects, isUnlockable, type SkillEffects } from './SkillTree';
import { DEFAULT_BINDINGS, ACTION_ORDER, ACTION_LABELS, loadBindings, saveBindings, formatKeyCode, type ActionId } from './Keybinds';
import { NetLink } from './Net';
import { CoopUI } from './CoopUI';
import { RARITY_ORDER, type EnemyKind, type CharacterId, type Rarity } from './types';
import {
  WORLD_H,
  VIEW_W,
  VIEW_H,
  FIXED_DT,
  DASH_SPEED,
  DASH_DURATION,
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
  DOWN_BLEEDOUT,
  REVIVE_HOLD_TIME,
  REVIVE_RANGE,
  REVIVE_HP_FRAC,
} from './constants';

type Scene = 'select' | 'hub' | 'companions' | 'controls' | 'playing' | 'results';

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

/** One frame of intent for a player, from either the keyboard or the network. */
interface PlayerInput {
  mx: number;
  my: number;
  aim: number;
  fireHeld: boolean;
  firePressed: boolean;
  dash: boolean;
  ability: boolean;
  ultimate: boolean;
  interactHeld: boolean;
  interactPressed: boolean;
  melee: boolean;
  reload: boolean;
  swap: boolean;
  weapon1: boolean;
  weapon2: boolean;
}

/** One-shot actions travel over the wire as monotonic counters rather than
 *  booleans - a boolean that flips true for a single frame is routinely lost
 *  when several input packets land between two host ticks. */
const EDGE_KEYS = ['fire', 'dash', 'ability', 'ultimate', 'interact', 'melee', 'reload', 'swap', 'w1', 'w2'] as const;
type EdgeKey = (typeof EDGE_KEYS)[number];

function zeroEdges(): Record<EdgeKey, number> {
  return { fire: 0, dash: 0, ability: 0, ultimate: 0, interact: 0, melee: 0, reload: 0, swap: 0, w1: 0, w2: 0 };
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
  private settings: AudioSettings;
  private keybinds: Record<ActionId, string>;
  private effects: SkillEffects;

  private scene: Scene = 'select';
  private selectedCharacterIndex = 0;
  private listeningForAction: ActionId | null = null;
  private paused = false;
  private menuNotice = '';
  private menuNoticeTimer = 0;

  // --- networking ---
  private net = new NetLink();
  private coopUI: CoopUI | null = null;
  private localIndex = 0;
  private guestCharId: CharacterId | null = null;
  private guestEffects: SkillEffects | null = null;
  private guestReady = false;
  private awaitingHost = false;
  private snapshotAccum = 0;
  /** Latest held (level) state from the partner, plus a queue of unconsumed press events. */
  private remoteHeld = { mx: 0, my: 0, aim: 0, fireHeld: false, interactHeld: false };
  private remoteEdgeSeen: Record<EdgeKey, number> | null = null;
  private remoteEdgePending = zeroEdges();
  /** Guest-side outgoing press counters. */
  private localEdges = zeroEdges();
  private netEvents: { x: number; y: number; c: string; n: number }[] = [];

  private players: Player[] = [];
  private companion: Companion | null = null;
  private turrets: Turret[] = [];
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
    this.settings = loadSettings();
    this.keybinds = loadBindings();
    this.effects = computeEffects(this.meta.skills);

    this.input = new Input(canvas, () => {
      this.sfx.unlock();
      this.sfx.setMuted(this.settings.muted);
      this.sfx.setVolume(this.settings.volume);
    });
    this.pointFlyers = new PointFlyers((amount) => {
      const p = this.players[0];
      if (!p) return;
      p.points += amount;
      this.stats.points += amount;
      if (this.players[1]) this.players[1].points = p.points;
    });

    this.setupNet();
    requestAnimationFrame(this.loop);
  }

  // ---------------- networking ----------------

  private setupNet() {
    this.coopUI = new CoopUI(this.net, () => {});
    this.net.onOpen = () => {
      this.coopUI?.notifyConnected();
      this.notice(this.net.role === 'host' ? 'Partner connected — you are the host.' : 'Connected to host.');
      if (this.net.role === 'guest') this.localIndex = 1;
      else this.localIndex = 0;
    };
    this.net.onClose = () => {
      this.notice('Co-op link closed.');
      this.localIndex = 0;
      this.guestReady = false;
      this.awaitingHost = false;
    };
    this.net.onMessage = (raw) => this.handleNetMessage(raw as Record<string, unknown>);
  }

  private handleNetMessage(msg: Record<string, unknown>) {
    const t = msg.t as string;
    if (t === 'join') {
      this.guestCharId = msg.char as CharacterId;
      this.guestEffects = msg.fx as SkillEffects;
      this.guestReady = true;
      this.notice(`Partner ready as ${CHARACTER_DEFS[this.guestCharId]?.name ?? '?'}.`);
      if (this.scene === 'playing' && !this.players[1]) this.spawnRemotePlayer();
    } else if (t === 'in') {
      this.remoteHeld = {
        mx: msg.mx as number, my: msg.my as number, aim: msg.aim as number,
        fireHeld: !!msg.fh, interactHeld: !!msg.ih,
      };
      const counters = (msg.c ?? {}) as Record<string, number>;
      // First packet just establishes the baseline, otherwise we'd replay the
      // partner's entire press history in one tick.
      if (!this.remoteEdgeSeen) {
        this.remoteEdgeSeen = zeroEdges();
        for (const k of EDGE_KEYS) this.remoteEdgeSeen[k] = counters[k] ?? 0;
      } else {
        for (const k of EDGE_KEYS) {
          const now = counters[k] ?? 0;
          const seen = this.remoteEdgeSeen[k];
          // capped so a stall can't bank a dozen presses and dump them at once
          if (now > seen) this.remoteEdgePending[k] = Math.min(4, this.remoteEdgePending[k] + (now - seen));
          this.remoteEdgeSeen[k] = now;
        }
      }
    } else if (t === 'snap') {
      this.applySnapshot(msg);
    } else if (t === 'over') {
      this.scene = 'results';
      this.lastEssenceEarned = (msg.e as number) ?? 0;
      this.lastTokensEarned = (msg.k as number) ?? 0;
    }
  }

  private buildSnapshot(): Record<string, unknown> {
    const pack = (p: Player) => ({
      x: Math.round(p.x), y: Math.round(p.y), a: +p.aimAngle.toFixed(2),
      hp: Math.round(p.hp), mhp: p.maxHp, ch: p.character.id,
      dn: p.downed, dt: +p.downTimer.toFixed(1), rp: +p.reviveProgress.toFixed(2), rc: p.reviveCharges,
      pt: p.points, sh: p.shieldFrac, ud: p.undyingTimer, vb: p.visionBoostTimer, ua: p.ultimateActiveTimer,
      ac: +p.abilityCooldown.toFixed(1), uc: +p.ultimateCooldown.toFixed(1), uu: p.ultimateUnlocked,
      dsh: p.dashTime, ifr: p.iframeTimer,
      w: { id: p.currentWeapon.roll.weaponId, r: p.currentWeapon.roll.rarity, pk: p.currentWeapon.roll.perkLabel,
           m: p.currentWeapon.ammoInMag, rs: p.currentWeapon.ammoReserve },
      rl: p.reloading, rt: +p.reloadTimer.toFixed(2), cg: p.charging, ct: +p.chargeTime.toFixed(2),
    });
    const snap = {
      t: 'snap',
      p: this.players.map(pack),
      e: this.enemies.map((e) => ({
        x: Math.round(e.x), y: Math.round(e.y), r: e.radius, k: e.kind,
        hp: Math.round(e.hp), mhp: Math.round(e.maxHp), f: e.hitFlash > 0 ? 1 : 0,
        am: e.armed ? 1 : 0, bs: e.bossState, sl: e.slowFactor < 1 ? 1 : 0, wb: +e.wobble.toFixed(2),
      })),
      pr: this.projectiles.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), r: p.radius, c: p.color })),
      ep: this.enemyProjectiles.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), r: p.radius })),
      tu: this.turrets.map((t) => ({ x: Math.round(t.x), y: Math.round(t.y), s: +t.spin.toFixed(2) })),
      cm: this.companion
        ? { x: Math.round(this.companion.x), y: Math.round(this.companion.y), f: +this.companion.facing.toFixed(2),
            ph: +this.companion.animPhase.toFixed(2), sv: this.companion.save }
        : null,
      lv: {
        rooms: this.level.rooms,
        doors: this.level.doors,
        stations: this.level.stations,
      },
      h: {
        rd: this.round, dp: this.level.depth(),
        er: this.enemies.filter((e) => e.alive).length + this.enemiesToSpawn.length,
        ks: this.killStreak, it: +this.intermissionTimer.toFixed(1), tt: +this.tutorialTimer.toFixed(1),
        mb: this.mysteryBox.cost,
      },
      ev: this.netEvents,
    };
    this.netEvents = [];
    return snap;
  }

  private applySnapshot(msg: Record<string, unknown>) {
    if (this.scene !== 'playing') this.scene = 'playing';
    this.awaitingHost = false;

    const packed = msg.p as Record<string, unknown>[];
    // rebuild player mirrors, preserving object identity where possible
    while (this.players.length < packed.length) {
      const idx = this.players.length;
      const chId = (packed[idx].ch as CharacterId) ?? 'recon';
      this.players.push(new Player(idx, 0, 0, CHARACTER_DEFS[chId], this.effects));
    }
    this.players.length = packed.length;
    packed.forEach((d, i) => {
      const p = this.players[i];
      const chId = d.ch as CharacterId;
      if (p.character.id !== chId) p.character = CHARACTER_DEFS[chId];
      p.x = d.x as number;
      p.y = d.y as number;
      // keep our own aim local for responsiveness; mirror the partner's
      if (i !== this.localIndex) p.aimAngle = d.a as number;
      p.hp = d.hp as number;
      p.maxHp = d.mhp as number;
      p.downed = d.dn as boolean;
      p.downTimer = d.dt as number;
      p.reviveProgress = d.rp as number;
      p.reviveCharges = d.rc as number;
      p.points = d.pt as number;
      p.shieldFrac = d.sh as number;
      p.undyingTimer = d.ud as number;
      p.visionBoostTimer = d.vb as number;
      p.ultimateActiveTimer = d.ua as number;
      p.abilityCooldown = d.ac as number;
      p.ultimateCooldown = d.uc as number;
      p.ultimateUnlocked = d.uu as boolean;
      p.dashTime = d.dsh as number;
      p.iframeTimer = d.ifr as number;
      const w = d.w as Record<string, unknown>;
      p.currentWeaponIndex = 0;
      p.weapons[0] = {
        roll: { weaponId: w.id as never, rarity: w.r as Rarity, perkLabel: w.pk as string, fireRateMult: 1, damageMult: 1 },
        ammoInMag: w.m as number,
        ammoReserve: w.rs as number,
      };
      p.reloading = d.rl as boolean;
      p.reloadTimer = d.rt as number;
      p.charging = d.cg as boolean;
      p.chargeTime = d.ct as number;
    });

    this.enemies = (msg.e as Record<string, unknown>[]).map((d) => {
      const e = new Enemy(d.x as number, d.y as number, d.k as EnemyKind, d.mhp as number, 0, 0);
      e.radius = d.r as number;
      e.hp = d.hp as number;
      e.hitFlash = d.f ? 0.1 : 0;
      e.armed = !!d.am;
      e.bossState = d.bs as Enemy['bossState'];
      e.slowFactor = d.sl ? 0.5 : 1;
      e.wobble = d.wb as number;
      return e;
    });
    this.projectiles = (msg.pr as Record<string, unknown>[]).map((d) => ({
      x: d.x as number, y: d.y as number, vx: 0, vy: 0, damage: 0,
      color: d.c as string, pierce: 0, knockback: 0, radius: d.r as number, alive: true, distanceLeft: 1,
    }));
    this.enemyProjectiles = (msg.ep as Record<string, unknown>[]).map((d) => ({
      x: d.x as number, y: d.y as number, vx: 0, vy: 0, damage: 0, radius: d.r as number, alive: true, distanceLeft: 1,
    }));
    this.turrets = (msg.tu as Record<string, unknown>[]).map((d) => ({
      x: d.x as number, y: d.y as number, life: 1, fireCooldown: 0, damage: 0, range: 0, spin: d.s as number,
    }));

    const cm = msg.cm as Record<string, unknown> | null;
    if (cm) {
      const save = cm.sv as CompanionSave;
      if (!this.companion) this.companion = new Companion(cm.x as number, cm.y as number, save);
      this.companion.x = cm.x as number;
      this.companion.y = cm.y as number;
      this.companion.facing = cm.f as number;
      this.companion.animPhase = cm.ph as number;
      this.companion.save = save;
    } else {
      this.companion = null;
    }

    const lv = msg.lv as Record<string, unknown>;
    this.level.hydrate(lv.rooms as RoomInfo[], lv.doors as DoorInfo[], lv.stations as Station[]);

    const h = msg.h as Record<string, number>;
    this.round = h.rd;
    this.killStreak = h.ks;
    this.intermissionTimer = h.it;
    this.tutorialTimer = h.tt;
    this.remoteEnemiesRemaining = h.er;
    this.remoteBoxCost = h.mb;

    for (const ev of (msg.ev as { x: number; y: number; c: string; n: number }[]) ?? []) {
      this.particles.burst(ev.x, ev.y, ev.c, ev.n, 200);
    }
  }

  private remoteEnemiesRemaining = 0;
  private remoteBoxCost = 400;

  private pushEvent(x: number, y: number, color: string, count: number) {
    if (!this.isHost || this.netEvents.length > 24) return;
    this.netEvents.push({ x: Math.round(x), y: Math.round(y), c: color, n: count });
  }

  private get isHost(): boolean {
    return this.net.connected && this.net.role === 'host';
  }

  private get isGuest(): boolean {
    return this.net.connected && this.net.role === 'guest';
  }

  private notice(text: string) {
    this.menuNotice = text;
    this.menuNoticeTimer = 4;
  }

  // ---------------- loop ----------------

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
    if (this.menuNoticeTimer > 0) this.menuNoticeTimer -= dt;

    if (this.coopUI?.isOpen) return;

    if (this.actionPressed('mute')) this.toggleMute();

    if (this.scene === 'select') return this.updateSelect();
    if (this.scene === 'hub') return this.updateHub();
    if (this.scene === 'companions') return this.updateCompanions();
    if (this.scene === 'controls') return this.updateControls();
    if (this.scene === 'results') return this.updateResults();

    if (this.isGuest) return this.updateGuest(dt);

    if (this.actionPressed('pause')) this.paused = !this.paused;
    if (this.paused) return;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }
    this.updatePlaying(dt);
  }

  private toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.sfx.setMuted(this.settings.muted);
    saveSettings(this.settings);
    this.notice(this.settings.muted ? 'Audio muted.' : 'Audio unmuted.');
  }

  // ---------------- local input ----------------

  private buildLocalInput(): PlayerInput {
    const p = this.players[this.localIndex];
    const worldMouseX = this.camera.x + this.input.mouseX;
    const worldMouseY = this.camera.y + this.input.mouseY;
    let mx = 0;
    let my = 0;
    if (this.actionDown('moveUp') || this.input.isDown('ArrowUp')) my -= 1;
    if (this.actionDown('moveDown') || this.input.isDown('ArrowDown')) my += 1;
    if (this.actionDown('moveLeft') || this.input.isDown('ArrowLeft')) mx -= 1;
    if (this.actionDown('moveRight') || this.input.isDown('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    return {
      mx,
      my,
      aim: p ? Math.atan2(worldMouseY - p.y, worldMouseX - p.x) : 0,
      fireHeld: this.actionDown('shoot') || this.input.mouseDown,
      firePressed: this.actionPressed('shoot') || this.input.wasMousePressed(),
      dash: this.actionPressed('dash'),
      ability: this.actionPressed('ability'),
      ultimate: this.actionPressed('ultimate'),
      interactHeld: this.actionDown('interact'),
      interactPressed: this.actionPressed('interact'),
      melee: this.actionPressed('melee'),
      reload: this.actionPressed('reload'),
      swap: this.actionPressed('swapWeapon'),
      weapon1: this.actionPressed('weapon1'),
      weapon2: this.actionPressed('weapon2'),
    };
  }

  /**
   * Host-side: hand the partner's queued presses to the simulation one at a
   * time. An edge is only spent when the action can actually happen this tick -
   * spending a click while the gun is still on cooldown would silently discard
   * it, which is what made remote players barely able to shoot.
   */
  private takeRemoteInput(): PlayerInput {
    const p = this.players.find((pl) => pl.index !== this.localIndex);
    const take = (k: EdgeKey, ready = true) => {
      if (!ready || this.remoteEdgePending[k] <= 0) return false;
      this.remoteEdgePending[k]--;
      return true;
    };
    const weapon = p?.currentWeapon;
    const canFire = !!p && p.active && !p.reloading && p.fireCooldown <= 0 && !!weapon && weapon.ammoInMag > 0;
    return {
      mx: this.remoteHeld.mx,
      my: this.remoteHeld.my,
      aim: this.remoteHeld.aim,
      fireHeld: this.remoteHeld.fireHeld,
      firePressed: take('fire', canFire),
      dash: take('dash', !!p && p.dashCooldownTimer <= 0 && p.dashTime <= 0),
      ability: take('ability', !!p && p.abilityCooldown <= 0),
      ultimate: take('ultimate', !!p && p.ultimateUnlocked && p.ultimateCooldown <= 0),
      interactHeld: this.remoteHeld.interactHeld,
      interactPressed: take('interact'),
      melee: take('melee', !!p && p.meleeCooldown <= 0),
      reload: take('reload'),
      swap: take('swap'),
      weapon1: take('w1'),
      weapon2: take('w2'),
    };
  }

  /** Guest side: no simulation, just stream intent and render whatever the host sends back. */
  private updateGuest(dt: number) {
    const p = this.players[this.localIndex];
    if (p) {
      const worldMouseX = this.camera.x + this.input.mouseX;
      const worldMouseY = this.camera.y + this.input.mouseY;
      p.aimAngle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
      const inp = this.buildLocalInput();
      if (inp.firePressed) this.localEdges.fire++;
      if (inp.dash) this.localEdges.dash++;
      if (inp.ability) this.localEdges.ability++;
      if (inp.ultimate) this.localEdges.ultimate++;
      if (inp.interactPressed) this.localEdges.interact++;
      if (inp.melee) this.localEdges.melee++;
      if (inp.reload) this.localEdges.reload++;
      if (inp.swap) this.localEdges.swap++;
      if (inp.weapon1) this.localEdges.w1++;
      if (inp.weapon2) this.localEdges.w2++;
      this.net.send({
        t: 'in', mx: +inp.mx.toFixed(2), my: +inp.my.toFixed(2), aim: +inp.aim.toFixed(2),
        fh: inp.fireHeld, ih: inp.interactHeld, c: this.localEdges,
      });
      this.camera.follow(p.x, p.y, VIEW_W, VIEW_H, this.level.totalWidth(), WORLD_H);
    }
    this.particles.update(dt);
    this.camera.update(dt);
  }

  // ---------------- select ----------------

  private updateSelect() {
    for (let i = 0; i < 6; i++) {
      if (this.input.wasPressed(`Digit${i + 1}`)) this.selectedCharacterIndex = i;
    }
    if (this.input.wasPressed('ArrowLeft')) this.selectedCharacterIndex = (this.selectedCharacterIndex + 5) % 6;
    if (this.input.wasPressed('ArrowRight')) this.selectedCharacterIndex = (this.selectedCharacterIndex + 1) % 6;
    if (this.actionPressed('upgradesMenu')) this.scene = 'hub';
    if (this.input.wasPressed('KeyC')) this.scene = 'controls';
    if (this.input.wasPressed('KeyB')) this.scene = 'companions';

    if (this.input.wasMousePressed()) {
      const idx = this.hitTestCharacterCard(this.input.mouseX, this.input.mouseY);
      if (idx >= 0) this.pickCharacter(idx);
      const btn = this.hitTestSelectButtons(this.input.mouseX, this.input.mouseY);
      if (btn === 'drop') this.pressDropIn();
      if (btn === 'upgrades') this.scene = 'hub';
      if (btn === 'pets') this.scene = 'companions';
      if (btn === 'controls') this.scene = 'controls';
      if (btn === 'coop') this.coopUI?.open();
    }

    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space')) this.pressDropIn();
  }

  private pickCharacter(idx: number) {
    const id = CHARACTER_ORDER[idx];
    const def = CHARACTER_DEFS[id];
    if (this.meta.classesUnlocked[id]) {
      this.selectedCharacterIndex = idx;
      return;
    }
    if (this.meta.essence >= def.unlockCost) {
      this.meta.essence -= def.unlockCost;
      this.meta.classesUnlocked[id] = true;
      saveMeta(this.meta);
      this.selectedCharacterIndex = idx;
      this.sfx.rarityFanfare('legendary');
      this.notice(`${def.name} unlocked!`);
    } else {
      this.notice(`${def.name} needs ${def.unlockCost} essence (you have ${this.meta.essence}).`);
    }
  }

  private pressDropIn() {
    const id = CHARACTER_ORDER[this.selectedCharacterIndex];
    if (!this.meta.classesUnlocked[id]) {
      this.notice(`${CHARACTER_DEFS[id].name} is still locked.`);
      return;
    }
    if (this.isGuest) {
      this.net.send({ t: 'join', char: id, fx: this.effects });
      this.awaitingHost = true;
      this.notice('Ready — waiting for the host to start.');
      return;
    }
    this.beginNewRun(CHARACTER_DEFS[id]);
  }

  private cardLayout() {
    const cardW = 190;
    const gap = 18;
    const totalW = cardW * 6 + gap * 5;
    return { cardW, cardH: 296, gap, startX: VIEW_W / 2 - totalW / 2, y: 148 };
  }

  private hitTestCharacterCard(mx: number, my: number): number {
    const { cardW, cardH, gap, startX, y } = this.cardLayout();
    for (let i = 0; i < 6; i++) {
      const x = startX + i * (cardW + gap);
      if (mx >= x && mx <= x + cardW && my >= y && my <= y + cardH) return i;
    }
    return -1;
  }

  private selectButtonLayout() {
    const btnW = 172;
    const btnH = 50;
    const gap = 13;
    const totalW = btnW * 5 + gap * 4;
    return { btnW, btnH, gap, startX: VIEW_W / 2 - totalW / 2, y: 486 };
  }

  private hitTestSelectButtons(mx: number, my: number): 'drop' | 'upgrades' | 'pets' | 'controls' | 'coop' | null {
    const { btnW, btnH, gap, startX, y } = this.selectButtonLayout();
    if (my < y || my > y + btnH) return null;
    const keys: ('drop' | 'upgrades' | 'pets' | 'controls' | 'coop')[] = ['drop', 'upgrades', 'pets', 'controls', 'coop'];
    for (let i = 0; i < 5; i++) {
      const bx = startX + i * (btnW + gap);
      if (mx >= bx && mx <= bx + btnW) return keys[i];
    }
    return null;
  }

  // ---------------- run lifecycle ----------------

  private spawnRemotePlayer() {
    if (!this.guestCharId) return;
    const def = CHARACTER_DEFS[this.guestCharId];
    const fx = this.guestEffects ?? computeEffects([]);
    const p = new Player(1, 160, WORLD_H / 2 + 60, def, fx);
    p.ultimateUnlocked = true;
    p.points = this.players[0]?.points ?? 0;
    this.players[1] = p;
  }

  private beginNewRun(def: CharacterDef) {
    this.effects = computeEffects(this.meta.skills);
    this.level = new Level();
    this.mysteryBox = new MysteryBox();
    const p0 = new Player(0, 120, WORLD_H / 2, def, this.effects);
    p0.ultimateUnlocked = this.meta.ultimatesUnlocked[def.id];
    this.players = [p0];
    this.localIndex = 0;
    if (this.isHost && this.guestReady) this.spawnRemotePlayer();

    const activeSave = activeCompanion(this.meta);
    this.companion = activeSave ? new Companion(90, WORLD_H / 2 + 50, activeSave) : null;
    this.turrets = [];
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
    // start each run from a clean input-edge baseline on both ends of the link
    this.localEdges = zeroEdges();
    this.remoteEdgePending = zeroEdges();
    this.remoteEdgeSeen = null;
    this.remoteHeld = { mx: 0, my: 0, aim: 0, fireHeld: false, interactHeld: false };
    this.stats = { kills: 0, roundsSurvived: 0, points: 0 };
    this.scene = 'playing';
  }

  // ---------------- skill tree hub ----------------

  private skillNodeRect(col: number, row: number) {
    return { x: 60 + col * 228, y: 168 + row * 104, w: 200, h: 72 };
  }

  private updateHub() {
    if (this.input.wasPressed('Escape') || this.actionPressed('upgradesMenu')) {
      this.scene = 'select';
      return;
    }
    if (!this.input.wasMousePressed()) return;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    if (mx >= VIEW_W / 2 - 90 && mx <= VIEW_W / 2 + 90 && my >= VIEW_H - 68 && my <= VIEW_H - 24) {
      this.scene = 'select';
      return;
    }

    // side panel purchases (ultimates / companion) live on the right rail
    const rail = this.railRows();
    for (const row of rail) {
      if (mx >= row.x && mx <= row.x + row.w && my >= row.y && my <= row.y + row.h) {
        if (row.buyable) {
          row.onBuy();
          this.sfx.rarityFanfare('rare');
        } else {
          this.notice('Not enough currency for that yet.');
        }
        return;
      }
    }

    for (const node of SKILL_NODES) {
      const r = this.skillNodeRect(node.col, node.row);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        if (this.meta.skills.includes(node.id)) return;
        if (!isUnlockable(node, this.meta.skills)) {
          this.notice(`${node.label} needs its prerequisite first.`);
          return;
        }
        if (this.meta.essence < node.cost) {
          this.notice(`${node.label} costs ${node.cost} essence.`);
          return;
        }
        this.meta.essence -= node.cost;
        this.meta.skills.push(node.id);
        this.effects = computeEffects(this.meta.skills);
        saveMeta(this.meta);
        this.sfx.rarityFanfare('epic');
        this.notice(`${node.label} unlocked.`);
        return;
      }
    }
  }

  private railRows() {
    const rows: { label: string; sub: string; x: number; y: number; w: number; h: number; buyable: boolean; accent: string; currency: 'essence' | 'tokens'; cost: number | null; onBuy: () => void }[] = [];
    const x = VIEW_W - 304;
    const w = 268;
    const h = 44;
    let y = 168;

    const selId = CHARACTER_ORDER[this.selectedCharacterIndex];
    const selDef = CHARACTER_DEFS[selId];
    const ultOwned = this.meta.ultimatesUnlocked[selId];
    rows.push({
      label: `${selDef.name} Ultimate`,
      sub: ultOwned ? 'UNLOCKED' : selDef.ultimateLabel,
      x, y, w, h,
      accent: selDef.ultimateColor,
      currency: 'essence',
      cost: ultOwned ? null : ULTIMATE_UNLOCK_COST,
      buyable: !ultOwned && this.meta.essence >= ULTIMATE_UNLOCK_COST,
      onBuy: () => {
        this.meta.essence -= ULTIMATE_UNLOCK_COST;
        this.meta.ultimatesUnlocked[selId] = true;
        saveMeta(this.meta);
      },
    });
    return rows;
  }

  // ---------------- companions screen ----------------

  private companionCardRect(i: number) {
    const w = 220;
    const gap = 18;
    const total = MAX_COMPANION_SLOTS * w + (MAX_COMPANION_SLOTS - 1) * gap;
    return { x: VIEW_W / 2 - total / 2 + i * (w + gap), y: 140, w, h: 330 };
  }

  private companionButtons(i: number) {
    const r = this.companionCardRect(i);
    return {
      evolve: { x: r.x + 12, y: r.y + 236, w: 92, h: 30 },
      remove: { x: r.x + 116, y: r.y + 236, w: 92, h: 30 },
      select: { x: r.x + 12, y: r.y + 276, w: 196, h: 34 },
    };
  }

  private boxButtonRect() {
    return { x: VIEW_W / 2 - 320, y: 512, w: 300, h: 48 };
  }

  private companionBackRect() {
    return { x: VIEW_W / 2 + 20, y: 512, w: 300, h: 48 };
  }

  private updateCompanions() {
    if (this.input.wasPressed('Escape')) {
      this.scene = 'select';
      return;
    }
    if (!this.input.wasMousePressed()) return;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const inside = (r: { x: number; y: number; w: number; h: number }) =>
      mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

    if (inside(this.companionBackRect())) {
      this.scene = 'select';
      return;
    }

    if (inside(this.boxButtonRect())) {
      this.pullCompanionBox();
      return;
    }

    const slots = companionSlots(this.meta);
    for (let i = 0; i < MAX_COMPANION_SLOTS; i++) {
      const card = this.companionCardRect(i);
      if (!inside(card)) continue;

      if (i >= slots) {
        // locked slot - buying it is the only interaction
        const cost = nextSlotCost(this.meta);
        if (i !== slots) {
          this.notice('Unlock the previous slot first.');
        } else if (cost === null) {
          this.notice('All slots unlocked.');
        } else if (this.meta.tokens < cost) {
          this.notice(`Slot ${i + 1} costs ${cost} tokens (you have ${this.meta.tokens}).`);
        } else {
          this.meta.tokens -= cost;
          this.meta.extraSlots++;
          saveMeta(this.meta);
          this.sfx.rarityFanfare('rare');
          this.notice(`Slot ${i + 1} unlocked.`);
        }
        return;
      }

      const pet = this.meta.companions[i];
      if (!pet) {
        this.notice('Empty slot — pull the companion box to fill it.');
        return;
      }

      const btns = this.companionButtons(i);
      if (inside(btns.evolve)) {
        const cost = companionLevelCost(pet.level);
        if (cost === null) this.notice(`${companionName(pet)} is already max tier.`);
        else if (this.meta.tokens < cost) this.notice(`Evolving costs ${cost} tokens (you have ${this.meta.tokens}).`);
        else {
          this.meta.tokens -= cost;
          pet.level++;
          saveMeta(this.meta);
          this.sfx.rarityFanfare('epic');
          this.notice(`Evolved into ${companionName(pet)}!`);
        }
        return;
      }
      if (inside(btns.remove)) {
        if (this.meta.companions.length <= 1) {
          this.notice('You must keep at least one companion.');
          return;
        }
        this.meta.companions = this.meta.companions.filter((c) => c.id !== pet.id);
        if (this.meta.activeCompanionId === pet.id) this.meta.activeCompanionId = this.meta.companions[0].id;
        saveMeta(this.meta);
        this.notice(`Released ${companionName(pet)}.`);
        return;
      }
      if (inside(btns.select)) {
        this.meta.activeCompanionId = pet.id;
        saveMeta(this.meta);
        this.sfx.points();
        this.notice(`${companionName(pet)} deployed.`);
        return;
      }
      return;
    }
  }

  private pullCompanionBox() {
    const cost = companionBoxCost(this.meta.companionBoxPulls);
    if (this.meta.companions.length >= companionSlots(this.meta)) {
      this.notice('All slots full — release one or buy another slot.');
      return;
    }
    if (this.meta.tokens < cost) {
      this.notice(`The box costs ${cost} tokens (you have ${this.meta.tokens}).`);
      return;
    }
    this.meta.tokens -= cost;
    this.meta.companionBoxPulls++;
    const pet = rollNewCompanion();
    this.meta.companions.push(pet);
    if (!this.meta.activeCompanionId) this.meta.activeCompanionId = pet.id;
    saveMeta(this.meta);
    this.sfx.rarityFanfare(pet.rarity);
    this.notice(`${companionName(pet)} (${pet.rarity.toUpperCase()}) joined your roster!`);
  }

  // ---------------- controls / audio settings ----------------

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

    // audio strip
    if (my >= 66 && my <= 94) {
      if (mx >= 60 && mx <= 150) {
        this.toggleMute();
        return;
      }
      if (mx >= 170 && mx <= 470) {
        this.settings.volume = Math.max(0, Math.min(1, (mx - 170) / 300));
        this.settings.muted = false;
        this.sfx.setMuted(false);
        this.sfx.setVolume(this.settings.volume);
        saveSettings(this.settings);
        this.sfx.points();
        return;
      }
    }

    if (mx >= VIEW_W / 2 - 190 && mx <= VIEW_W / 2 - 10 && my >= VIEW_H - 62 && my <= VIEW_H - 22) {
      this.keybinds = { ...DEFAULT_BINDINGS };
      saveBindings(this.keybinds);
      this.notice('Bindings reset to defaults.');
      return;
    }
    if (mx >= VIEW_W / 2 + 10 && mx <= VIEW_W / 2 + 190 && my >= VIEW_H - 62 && my <= VIEW_H - 22) {
      this.scene = 'select';
      return;
    }

    const rowH = 30;
    const startY = 118;
    const colW = 560;
    for (let i = 0; i < ACTION_ORDER.length; i++) {
      const col = i < 9 ? 0 : 1;
      const rowIdx = i < 9 ? i : i - 9;
      const rx = 60 + col * (colW + 40);
      const ry = startY + rowIdx * rowH;
      if (mx >= rx && mx <= rx + colW && my >= ry && my <= ry + rowH - 4) {
        this.listeningForAction = ACTION_ORDER[i];
        return;
      }
    }
  }

  private updateResults() {
    if (this.input.wasMousePressed() || this.input.wasPressed('Enter') || this.input.wasPressed('Space')) {
      this.scene = 'select';
    }
  }

  // ---------------- playing (host authoritative) ----------------

  private updatePlaying(dt: number) {
    if (this.tutorialTimer > 0) this.tutorialTimer -= dt;

    if (this.isHost && this.guestReady && !this.players[1]) this.spawnRemotePlayer();

    this.updateRoundFlow(dt);

    const localInput = this.buildLocalInput();
    const remoteInput = this.players.length > 1 ? this.takeRemoteInput() : null;
    for (const p of this.players) {
      const inp = p.index === this.localIndex ? localInput : remoteInput;
      if (inp) this.updatePlayer(p, inp, dt);
    }

    this.updateRevives(dt);
    this.updateStations();
    this.updateTurrets(dt);

    const anchor = this.players[this.localIndex] ?? this.players[0];
    if (this.companion) {
      const host = this.players[0];
      const shots = this.companion.update(dt, host.x, host.y, this.enemies);
      if (shots.length) this.projectiles.push(...shots);
    }
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateEnemyProjectiles(dt);
    this.updateAirstrike(dt);
    this.particles.update(dt);
    this.pointFlyers.update(dt, this.players[0].x, this.players[0].y);
    this.camera.update(dt);
    this.camera.follow(anchor.x, anchor.y, VIEW_W, VIEW_H, this.level.totalWidth(), WORLD_H);

    if (this.killStreakTimer > 0) {
      this.killStreakTimer -= dt;
      if (this.killStreakTimer <= 0) this.killStreak = 0;
    }

    if (this.isHost) {
      this.snapshotAccum += dt;
      if (this.snapshotAccum >= 1 / 30) {
        this.snapshotAccum = 0;
        this.net.send(this.buildSnapshot());
      }
    }

    if (this.players.every((p) => !p.alive)) this.endRun();
  }

  private endRun() {
    this.stats.roundsSurvived = this.round;
    const earned = essenceForRun(this.stats.roundsSurvived, this.stats.kills, this.level.depth()) + this.runBonusEssence;
    const tokensEarned = tokensForRun(this.stats.roundsSurvived, this.stats.kills, this.effects.tokenMult);
    this.meta.essence += earned;
    this.meta.tokens += tokensEarned;
    this.lastEssenceEarned = earned;
    this.lastTokensEarned = tokensEarned;
    saveMeta(this.meta);
    if (this.isHost) this.net.send({ t: 'over', e: earned, k: tokensEarned });
    this.scene = 'results';
  }

  /** Bleedout, teammate revives, and Second Wind self-revives. */
  private updateRevives(dt: number) {
    for (const p of this.players) {
      if (!p.alive || !p.downed) continue;
      p.downTimer -= dt;

      let beingRevived = false;
      for (const other of this.players) {
        if (other === p || !other.active) continue;
        if (Math.hypot(other.x - p.x, other.y - p.y) > REVIVE_RANGE) continue;
        const otherInput = other.index === this.localIndex ? this.actionDown('interact') : this.remoteHeld.interactHeld;
        if (!otherInput) continue;
        beingRevived = true;
        const rate = other.character.id === 'medic' ? 1.75 : 1;
        p.reviveProgress += (dt / REVIVE_HOLD_TIME) * rate;
        if (p.reviveProgress >= 1) {
          p.reviveTo(REVIVE_HP_FRAC);
          this.sfx.revive();
          this.particles.burst(p.x, p.y, '#3ddc73', 26, 200);
          this.pushEvent(p.x, p.y, '#3ddc73', 26);
        }
        break;
      }
      if (!beingRevived) p.reviveProgress = Math.max(0, p.reviveProgress - dt * 0.6);

      if (p.downed && p.downTimer <= 0) {
        if (p.reviveCharges > 0) {
          p.reviveCharges--;
          p.reviveTo(0.65);
          this.sfx.revive();
          this.particles.burst(p.x, p.y, '#ffd23d', 30, 240);
          this.pushEvent(p.x, p.y, '#ffd23d', 30);
          this.notice('Second Wind!');
        } else {
          p.alive = false;
          p.downed = false;
        }
      }
    }
  }

  private updateStations() {
    for (const p of this.players) {
      if (!p.active) continue;
      for (const s of this.level.stations) {
        if (s.kind !== 'treasure' || s.collected) continue;
        if (Math.hypot(p.x - s.x, p.y - s.y) < 70) {
          s.collected = true;
          const bonus = Math.round((TREASURE_BASE_BONUS + this.round * 10) * this.effects.treasureMult);
          this.addPoints(bonus);
          this.particles.burst(s.x, s.y, '#ffd23d', 30, 240);
          this.pushEvent(s.x, s.y, '#ffd23d', 30);
          this.particles.floatText(s.x, s.y - 30, `+${bonus} TREASURE`, '#ffd23d');
          this.sfx.points();
          this.camera.shake(3, 0.15);
        }
      }
    }
  }

  /** Points are a shared pool in co-op, matching the original design brief. */
  private addPoints(amount: number) {
    for (const p of this.players) p.points += amount;
    this.stats.points += amount;
  }

  private spendPoints(amount: number) {
    for (const p of this.players) p.points -= amount;
  }

  private updateTurrets(dt: number) {
    for (const t of this.turrets) {
      t.life -= dt;
      t.spin += dt * 3;
      t.fireCooldown -= dt;
      if (t.fireCooldown <= 0) {
        let nearest: Enemy | null = null;
        let best = t.range;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d < best) {
            best = d;
            nearest = e;
          }
        }
        if (nearest) {
          t.fireCooldown = 0.32;
          const angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
          this.projectiles.push({
            x: t.x, y: t.y,
            vx: Math.cos(angle) * 700, vy: Math.sin(angle) * 700,
            damage: t.damage, color: '#ffd98a', pierce: 0, knockback: 40,
            radius: 4, alive: true, distanceLeft: t.range + 60,
          });
        }
      }
    }
    this.turrets = this.turrets.filter((t) => t.life > 0);
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

    if (!this.enemies.some((e) => e.alive)) {
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
    const playerScale = this.players.length > 1 ? 1.5 : 1;
    const count = Math.round((isBossRound ? 2 + Math.floor(this.round / 2) : 3 + this.round * 2) * playerScale);
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

  // ---------------- per-player simulation ----------------

  private updatePlayer(p: Player, inp: PlayerInput, dt: number) {
    if (!p.alive) return;

    p.aimAngle = inp.aim;
    if (p.dashCooldownTimer > 0) p.dashCooldownTimer -= dt;
    if (p.iframeTimer > 0) p.iframeTimer -= dt;
    if (p.undyingTimer > 0) {
      p.undyingTimer -= dt;
      if (p.undyingTimer <= 0) this.revenantErupt(p);
    }
    if (p.shieldTimer > 0) {
      p.shieldTimer -= dt;
      if (p.shieldTimer <= 0) p.shieldFrac = 0;
    }
    if (p.visionBoostTimer > 0) p.visionBoostTimer -= dt;
    if (p.ultimateActiveTimer > 0) p.ultimateActiveTimer -= dt;
    if (p.abilityCooldown > 0) p.abilityCooldown -= dt;
    if (p.ultimateCooldown > 0) p.ultimateCooldown -= dt;
    if (p.meleeCooldown > 0) p.meleeCooldown -= dt;

    if (p.downed) {
      // downed players crawl slowly and can do nothing else
      const crawl = 62;
      const nx = p.x + inp.mx * crawl * dt;
      const ny = p.y + inp.my * crawl * dt;
      const res = resolveWallCollisions(nx, ny, PLAYER_RADIUS, this.level.allWalls());
      p.x = res.x;
      p.y = res.y;
      return;
    }

    if (inp.dash && p.dashCooldownTimer <= 0 && p.dashTime <= 0) {
      const moving = Math.hypot(inp.mx, inp.my) > 0;
      p.dashDirX = moving ? inp.mx : Math.cos(p.aimAngle);
      p.dashDirY = moving ? inp.my : Math.sin(p.aimAngle);
      p.dashTime = DASH_DURATION;
      p.iframeTimer = p.iframeDuration;
      p.dashCooldownTimer = p.dashCooldownMax;
      this.particles.burst(p.x, p.y, '#8fd6ff', 8, 120);
      this.sfx.dash();
    }

    const rampage = p.character.id === 'brawler' && p.ultimateActiveTimer > 0;
    const moveSpeed = p.character.moveSpeed * p.effects.moveSpeedMult * (rampage ? 1.35 : 1);

    let vx: number;
    let vy: number;
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      vx = p.dashDirX * DASH_SPEED;
      vy = p.dashDirY * DASH_SPEED;
      if (p.character.id === 'phantom') this.phantomTrail(p);
    } else {
      vx = inp.mx * moveSpeed;
      vy = inp.my * moveSpeed;
    }

    const res = resolveWallCollisions(p.x + vx * dt, p.y + vy * dt, PLAYER_RADIUS, this.level.allWalls());
    p.x = res.x;
    p.y = res.y;

    this.handleShooting(p, inp, dt);
    this.handleReload(p, inp, dt);
    this.handleMelee(p, inp);
    if (inp.ability) this.useAbility(p);
    if (inp.ultimate) this.useUltimate(p);
    if (inp.interactPressed) this.handleInteract(p);

    const regen = p.effects.regenPerSec + (p.character.id === 'medic' ? 1 : 0);
    if (regen > 0 && p.hp < p.maxHp) {
      p.regenAccum += dt * regen;
      if (p.regenAccum >= 1) {
        const whole = Math.floor(p.regenAccum);
        p.hp = Math.min(p.maxHp, p.hp + whole);
        p.regenAccum -= whole;
      }
    }
  }

  private phantomTrail(p: Player) {
    this.particles.burst(p.x, p.y, '#b06bff', 3, 40);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 26) {
        const killed = e.takeDamage(14);
        if (killed) this.onEnemyKilled(e, p);
      }
    }
  }

  private damageMultFor(p: Player, target: Enemy): number {
    let mult = p.effects.damageMult;
    if (p.effects.executionerBonus > 0 && target.hp / target.maxHp < 0.3) mult += p.effects.executionerBonus;
    return mult;
  }

  private applyLifesteal(p: Player, amount: number) {
    if (p.character.id !== 'revenant' || !p.active) return;
    p.hp = Math.min(p.maxHp, p.hp + amount * 0.12);
  }

  private fireWeapon(p: Player, def: WeaponDef, weapon: Player['weapons'][number]) {
    weapon.ammoInMag--;
    p.fireCooldown = 1 / (def.fireRate * weapon.roll.fireRateMult * p.effects.fireRateMult);
    const color = rarityColor(weapon.roll.rarity);
    const mx = p.x + Math.cos(p.aimAngle) * (PLAYER_RADIUS + 6);
    const my = p.y + Math.sin(p.aimAngle) * (PLAYER_RADIUS + 6);
    const shots = spawnProjectiles(def, weapon.roll, mx, my, p.aimAngle, color);
    for (const s of shots) {
      s.damage *= p.effects.damageMult;
      (s as Projectile & { owner?: number }).owner = p.index;
    }
    this.projectiles.push(...shots);
    this.particles.burst(mx, my, color, 4, 90);
    this.camera.shake(def.id === 'rail_spike' ? 4 : 1.5, 0.06);
    this.sfx.shot(weapon.roll.weaponId);
  }

  private handleShooting(p: Player, inp: PlayerInput, dt: number) {
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    const weapon = p.currentWeapon;
    const def = WEAPON_DEFS[weapon.roll.weaponId];

    if (def.chargeTime) {
      if (p.reloading) {
        p.charging = false;
        return;
      }
      if (inp.fireHeld && weapon.ammoInMag > 0) {
        if (!p.charging) {
          p.charging = true;
          p.chargeTime = 0;
          this.sfx.chargeStart();
        }
        p.chargeTime += dt;
        if (p.chargeTime >= def.chargeTime) {
          this.fireWeapon(p, def, weapon);
          p.charging = false;
          p.chargeTime = 0;
        }
      } else {
        p.charging = false;
        p.chargeTime = 0;
      }
      return;
    }

    const wants = def.auto ? inp.fireHeld : inp.firePressed;
    if (!wants || p.reloading) return;
    if (weapon.ammoInMag <= 0) {
      if (weapon.ammoReserve > 0) this.startReload(p);
      return;
    }
    if (p.fireCooldown > 0) return;
    this.fireWeapon(p, def, weapon);
  }

  private startReload(p: Player) {
    if (p.reloading) return;
    const weapon = p.currentWeapon;
    const def = WEAPON_DEFS[weapon.roll.weaponId];
    if (weapon.ammoInMag >= def.magSize || weapon.ammoReserve <= 0) return;
    p.reloading = true;
    p.reloadTimer = def.reloadTime;
    this.sfx.reload();
  }

  private handleReload(p: Player, inp: PlayerInput, dt: number) {
    if (inp.reload) this.startReload(p);
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        const weapon = p.currentWeapon;
        const def = WEAPON_DEFS[weapon.roll.weaponId];
        const take = Math.min(def.magSize - weapon.ammoInMag, weapon.ammoReserve);
        weapon.ammoInMag += take;
        weapon.ammoReserve -= take;
        p.reloading = false;
      }
    }
    let nextIndex = p.currentWeaponIndex;
    if (inp.swap) nextIndex = (p.currentWeaponIndex + 1) % p.weapons.length;
    else if (inp.weapon1 && p.weapons[0]) nextIndex = 0;
    else if (inp.weapon2 && p.weapons[1]) nextIndex = 1;
    if (nextIndex !== p.currentWeaponIndex) {
      p.currentWeaponIndex = nextIndex;
      p.reloading = false;
      p.charging = false;
      p.chargeTime = 0;
    }
  }

  private handleMelee(p: Player, inp: PlayerInput) {
    if (!inp.melee || p.meleeCooldown > 0) return;
    p.meleeCooldown = 0.5;
    this.sfx.melee();
    this.particles.burst(p.x + Math.cos(p.aimAngle) * 30, p.y + Math.sin(p.aimAngle) * 30, '#e8e8ea', 6, 140);

    const rampage = p.character.id === 'brawler' && p.ultimateActiveTimer > 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (Math.hypot(dx, dy) > MELEE_RANGE + e.radius) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - p.aimAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > MELEE_ARC / 2) continue;
      const dmg = MELEE_DAMAGE * p.character.meleeDamageMult * (rampage ? 2.2 : 1) * this.damageMultFor(p, e);
      const killed = e.takeDamage(dmg);
      this.applyLifesteal(p, dmg);
      this.particles.floatText(e.x, e.y - 10, `-${Math.round(dmg)}`, '#ffffff');
      if (killed) {
        this.onEnemyKilled(e, p);
        if (p.character.id === 'brawler') p.hp = Math.min(p.maxHp, p.hp + (rampage ? 16 : 8));
      }
    }
  }

  private useAbility(p: Player) {
    if (p.abilityCooldown > 0) return;
    p.abilityCooldown = p.character.activeCooldown;
    this.camera.shake(3, 0.15);
    this.sfx.abilityUse();

    switch (p.character.id) {
      case 'recon': {
        const fx = p.x + Math.cos(p.aimAngle) * 140;
        const fy = p.y + Math.sin(p.aimAngle) * 140;
        p.visionBoostTimer = 3;
        this.particles.burst(fx, fy, '#3ddc73', 20, 220);
        this.pushEvent(fx, fy, '#3ddc73', 20);
        for (const e of this.enemies) {
          if (e.alive && Math.hypot(e.x - fx, e.y - fy) <= 260) {
            e.slowTimer = 3;
            e.slowFactor = 0.35;
          }
        }
        break;
      }
      case 'brawler': {
        this.particles.burst(p.x, p.y, '#e04b3d', 24, 260);
        this.pushEvent(p.x, p.y, '#e04b3d', 24);
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= 130) {
            const killed = e.takeDamage(30 * this.damageMultFor(p, e));
            e.knockX += (dx / (dist || 1)) * 320;
            e.knockY += (dy / (dist || 1)) * 320;
            if (killed) this.onEnemyKilled(e, p);
          }
        }
        break;
      }
      case 'medic': {
        for (const ally of this.players) {
          if (ally.active && Math.hypot(ally.x - p.x, ally.y - p.y) < 200) {
            ally.hp = Math.min(ally.maxHp, ally.hp + 35);
            this.particles.floatText(ally.x, ally.y - 30, '+35 HP', '#3d9bdc');
          }
        }
        this.particles.burst(p.x, p.y, '#3d9bdc', 18, 160);
        this.pushEvent(p.x, p.y, '#3d9bdc', 18);
        break;
      }
      case 'phantom': {
        // blink toward the cursor, stopping short of geometry
        const dist = 240;
        const tx = p.x + Math.cos(p.aimAngle) * dist;
        const ty = p.y + Math.sin(p.aimAngle) * dist;
        this.particles.burst(p.x, p.y, '#b06bff', 18, 200);
        const res = resolveWallCollisions(tx, ty, PLAYER_RADIUS, this.level.allWalls());
        p.x = res.x;
        p.y = res.y;
        p.iframeTimer = Math.max(p.iframeTimer, 0.25);
        this.particles.burst(p.x, p.y, '#d9b3ff', 18, 200);
        this.pushEvent(p.x, p.y, '#d9b3ff', 18);
        break;
      }
      case 'warden': {
        this.turrets.push({
          x: p.x + Math.cos(p.aimAngle) * 44,
          y: p.y + Math.sin(p.aimAngle) * 44,
          life: 16, fireCooldown: 0.3, damage: 14 * p.effects.damageMult, range: 300, spin: 0,
        });
        this.particles.burst(p.x, p.y, '#ffb038', 16, 160);
        this.pushEvent(p.x, p.y, '#ffb038', 16);
        break;
      }
      case 'revenant': {
        let drained = 0;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= 210) {
            const dmg = 34 * this.damageMultFor(p, e);
            const killed = e.takeDamage(dmg);
            drained += dmg;
            this.particles.burst(e.x, e.y, '#ff4d8d', 6, 120);
            if (killed) this.onEnemyKilled(e, p);
          }
        }
        p.hp = Math.min(p.maxHp, p.hp + drained * 0.3);
        this.particles.burst(p.x, p.y, '#ff4d8d', 22, 220);
        this.pushEvent(p.x, p.y, '#ff4d8d', 22);
        break;
      }
    }
  }

  private useUltimate(p: Player) {
    if (!p.ultimateUnlocked || p.ultimateCooldown > 0) return;
    p.ultimateCooldown = p.character.ultimateCooldown;
    this.camera.shake(7, 0.3);
    this.sfx.ultimateUse();

    switch (p.character.id) {
      case 'recon':
        this.pendingAirstrike = { x: p.x + Math.cos(p.aimAngle) * 200, y: p.y + Math.sin(p.aimAngle) * 200, timer: 0.6 };
        p.visionBoostTimer = 4;
        break;
      case 'brawler':
        p.ultimateActiveTimer = 6;
        this.particles.burst(p.x, p.y, '#ff8a7a', 30, 240);
        this.pushEvent(p.x, p.y, '#ff8a7a', 30);
        break;
      case 'medic':
        for (const ally of this.players) {
          if (!ally.active) continue;
          ally.hp = ally.maxHp;
          ally.shieldFrac = 0.5;
          ally.shieldTimer = 5;
        }
        this.particles.burst(p.x, p.y, '#9fd6ff', 30, 220);
        this.pushEvent(p.x, p.y, '#9fd6ff', 30);
        break;
      case 'phantom':
        for (const e of this.enemies) {
          if (!e.alive) continue;
          e.slowTimer = 8;
          e.slowFactor = 0.12;
        }
        p.ultimateActiveTimer = 8;
        this.particles.burst(p.x, p.y, '#d9b3ff', 40, 300);
        this.pushEvent(p.x, p.y, '#d9b3ff', 40);
        break;
      case 'warden': {
        p.ultimateActiveTimer = 8;
        p.shieldFrac = 0.85;
        p.shieldTimer = 8;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          this.turrets.push({
            x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 60,
            life: 12, fireCooldown: 0.2, damage: 20 * p.effects.damageMult, range: 340, spin: 0,
          });
        }
        this.particles.burst(p.x, p.y, '#ffd98a', 34, 260);
        this.pushEvent(p.x, p.y, '#ffd98a', 34);
        break;
      }
      case 'revenant':
        p.undyingTimer = 10;
        p.hp = Math.max(p.hp, p.maxHp * 0.5);
        this.particles.burst(p.x, p.y, '#ff9ec4', 34, 260);
        this.pushEvent(p.x, p.y, '#ff9ec4', 34);
        break;
    }
  }

  private revenantErupt(p: Player) {
    this.particles.burst(p.x, p.y, '#ff4d8d', 46, 320);
    this.pushEvent(p.x, p.y, '#ff4d8d', 46);
    this.camera.shake(9, 0.3);
    this.sfx.explosion();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 260) {
        const killed = e.takeDamage(190 * p.effects.damageMult);
        if (killed) this.onEnemyKilled(e, p);
      }
    }
  }

  private updateAirstrike(dt: number) {
    if (!this.pendingAirstrike) return;
    this.pendingAirstrike.timer -= dt;
    if (this.pendingAirstrike.timer > 0) return;
    const { x, y } = this.pendingAirstrike;
    for (const e of this.enemies) {
      if (e.alive && Math.hypot(e.x - x, e.y - y) < 160) {
        const killed = e.takeDamage(230);
        this.particles.floatText(e.x, e.y - 14, '-230', '#8dffb0');
        if (killed) this.onEnemyKilled(e, this.players[0]);
      }
    }
    this.particles.burst(x, y, '#8dffb0', 40, 300);
    this.pushEvent(x, y, '#8dffb0', 40);
    this.camera.shake(10, 0.35);
    this.sfx.explosion();
    this.hitStopTimer = Math.max(this.hitStopTimer, 0.08);
    this.pendingAirstrike = null;
  }

  private handleInteract(p: Player) {
    const doorIdx = this.level.nearestClosedDoor(p.x, p.y);
    if (doorIdx !== null && this.level.distToDoor(doorIdx, p.x, p.y) < 90) {
      const cost = this.level.doors[doorIdx].cost;
      if (p.points >= cost) {
        this.spendPoints(cost);
        this.level.buyDoor(doorIdx);
        this.camera.shake(4, 0.2);
        this.sfx.doorOpen();
        const d = this.level.doors[doorIdx];
        this.particles.burst(d.x, (d.gapTop + d.gapBottom) / 2, '#ffb84d', 20, 200);
        this.pushEvent(d.x, (d.gapTop + d.gapBottom) / 2, '#ffb84d', 20);
      }
      return;
    }

    let station: Station | null = null;
    let best = 90;
    for (const s of this.level.stations) {
      if (s.collected || s.kind === 'treasure') continue;
      const dist = Math.hypot(p.x - s.x, p.y - s.y);
      if (dist < best) {
        best = dist;
        station = s;
      }
    }
    if (!station) return;

    if (station.kind === 'mysterybox') {
      const cost = this.mysteryBox.cost;
      if (p.points < cost) return;
      this.spendPoints(cost);
      this.mysteryBox.pull();
      const roll = rollWeapon(MYSTERY_BOX_POOL);
      p.addWeapon(roll);
      const color = rarityColor(roll.rarity);
      this.particles.burst(station.x, station.y, color, 30, 260);
      this.pushEvent(station.x, station.y, color, 30);
      this.particles.floatText(station.x, station.y - 40, `${WEAPON_DEFS[roll.weaponId].name.toUpperCase()} (${roll.rarity.toUpperCase()})`, color);
      this.camera.shake(5, 0.25);
      this.sfx.rarityFanfare(roll.rarity);
    } else if (station.kind === 'workbench') {
      const roll = p.currentWeapon.roll;
      const cost = WORKBENCH_BASE_COST + RARITY_ORDER.indexOf(roll.rarity) * WORKBENCH_COST_STEP;
      if (!canUpgrade(roll) || p.points < cost) return;
      this.spendPoints(cost);
      p.currentWeapon.roll = upgradeWeaponRoll(roll);
      const color = rarityColor(p.currentWeapon.roll.rarity);
      this.particles.burst(station.x, station.y, color, 26, 220);
      this.pushEvent(station.x, station.y, color, 26);
      this.particles.floatText(station.x, station.y - 40, 'UPGRADED!', color);
      this.camera.shake(4, 0.2);
      this.sfx.rarityFanfare(p.currentWeapon.roll.rarity);
    }
  }

  // ---------------- enemies ----------------

  private nearestActivePlayer(x: number, y: number): Player | null {
    let best: Player | null = null;
    let bestDist = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      // downed players are still a target of opportunity, but living ones come first
      const weight = p.downed ? 1.8 : 1;
      const d = Math.hypot(p.x - x, p.y - y) * weight;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private seekTarget(e: Enemy, target: Player, dt: number) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = e.speed * e.slowFactor;
    let vx = (dx / dist) * speed;
    let vy = (dy / dist) * speed;
    e.knockX *= 1 - 8 * dt;
    e.knockY *= 1 - 8 * dt;
    vx += e.knockX;
    vy += e.knockY;
    const res = resolveWallCollisions(e.x + vx * dt, e.y + vy * dt, e.radius, this.level.allWalls());
    e.x = res.x;
    e.y = res.y;
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.wobble += dt * 6;
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
            this.onEnemyKilled(e, this.players[0]);
            if (e.kind === 'explosive') this.explodeAt(e.x, e.y, 90, 32);
            continue;
          }
        }
      }

      const target = this.nearestActivePlayer(e.x, e.y);
      if (!target) continue;

      if (e.kind === 'explosive') {
        if (!e.armed) {
          if (Math.hypot(target.x - e.x, target.y - e.y) < e.radius + PLAYER_RADIUS + 16) {
            e.armed = true;
            e.explodeTimer = 0.45;
          } else {
            this.seekTarget(e, target, dt);
          }
        }
        if (e.armed) {
          e.explodeTimer -= dt;
          if (e.explodeTimer <= 0) {
            this.explodeAt(e.x, e.y, 90, 32);
            e.alive = false;
          }
        }
        continue;
      }

      if (e.kind === 'spitter') {
        this.updateSpitter(e, target, dt);
      } else if (e.kind === 'boss') {
        this.updateBoss(e, target, dt);
        continue;
      } else {
        this.seekTarget(e, target, dt);
      }

      const dist = Math.hypot(target.x - e.x, target.y - e.y);
      if (dist < e.radius + PLAYER_RADIUS + 4 && e.attackCooldown <= 0) {
        const result = target.takeDamage(e.damage);
        if (result !== 'none') {
          e.attackCooldown = 0.7;
          this.camera.shake(3, 0.12);
          this.particles.burst(target.x, target.y, '#e04b3d', 8, 140);
          this.sfx.damageTaken();
          this.killStreak = 0;
          if (result === 'downed') this.onPlayerDowned(target);
          if (e.kind === 'vampire') {
            e.hp = Math.min(e.maxHp, e.hp + e.damage * e.lifestealFrac);
            this.particles.burst(e.x, e.y, '#c94ba0', 10, 120);
          }
        }
      }
    }
  }

  private onPlayerDowned(p: Player) {
    this.sfx.downed();
    this.particles.floatText(p.x, p.y - 34, 'DOWNED', '#ff5b4a');
    this.pushEvent(p.x, p.y, '#ff5b4a', 18);
  }

  private updateSpitter(e: Enemy, target: Player, dt: number) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    let dirX = 0;
    let dirY = 0;
    if (dist > 260) {
      dirX = dx / dist;
      dirY = dy / dist;
    } else if (dist < 150) {
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
    const res = resolveWallCollisions(e.x + vx * dt, e.y + vy * dt, e.radius, this.level.allWalls());
    e.x = res.x;
    e.y = res.y;

    e.rangedCooldown -= dt;
    if (dist < 420 && e.rangedCooldown <= 0) {
      e.rangedCooldown = 1.6;
      const angle = Math.atan2(dy, dx);
      this.enemyProjectiles.push({
        x: e.x, y: e.y,
        vx: Math.cos(angle) * 380, vy: Math.sin(angle) * 380,
        damage: 9, radius: 5, alive: true, distanceLeft: 600,
      });
      this.particles.burst(e.x, e.y, '#6bcf5f', 4, 80);
    }
  }

  private updateBoss(e: Enemy, target: Player, dt: number) {
    switch (e.bossState) {
      case 'approach': {
        this.seekTarget(e, target, dt);
        e.bossTimer -= dt;
        if (Math.hypot(target.x - e.x, target.y - e.y) < 260 || e.bossTimer <= 0) {
          e.bossState = 'windup';
          e.bossTimer = 0.8;
          this.sfx.bossRoar();
        }
        break;
      }
      case 'windup': {
        e.bossTimer -= dt;
        if (e.bossTimer <= 0) {
          const dx = target.x - e.x;
          const dy = target.y - e.y;
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
        const res = resolveWallCollisions(e.x + e.lungeDirX * 780 * dt, e.y + e.lungeDirY * 780 * dt, e.radius, this.level.allWalls());
        e.x = res.x;
        e.y = res.y;
        for (const p of this.players) {
          if (!p.active) continue;
          if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius + PLAYER_RADIUS + 6 && e.attackCooldown <= 0) {
            const result = p.takeDamage(e.damage * 1.8);
            if (result !== 'none') {
              e.attackCooldown = 1;
              this.camera.shake(8, 0.2);
              this.sfx.damageTaken();
              this.killStreak = 0;
              if (result === 'downed') this.onPlayerDowned(p);
            }
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
    this.pushEvent(x, y, '#ff9d2e', 26);
    this.camera.shake(6, 0.25);
    this.sfx.explosion();
    this.hitStopTimer = Math.max(this.hitStopTimer, 0.05);
    for (const p of this.players) {
      if (!p.active) continue;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < radius + PLAYER_RADIUS) {
        const result = p.takeDamage(damage * (1 - dist / (radius + PLAYER_RADIUS)));
        if (result !== 'none') {
          this.sfx.damageTaken();
          this.killStreak = 0;
          if (result === 'downed') this.onPlayerDowned(p);
        }
      }
    }
  }

  private updateEnemyProjectiles(dt: number) {
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
      for (const p of this.players) {
        if (!p.active) continue;
        if (Math.hypot(proj.x - p.x, proj.y - p.y) < proj.radius + PLAYER_RADIUS) {
          const result = p.takeDamage(proj.damage);
          if (result !== 'none') {
            this.sfx.damageTaken();
            this.camera.shake(2, 0.08);
            this.killStreak = 0;
            if (result === 'downed') this.onPlayerDowned(p);
          }
          proj.alive = false;
          break;
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

      const ownerIdx = (proj as Projectile & { owner?: number }).owner ?? 0;
      const owner = this.players[ownerIdx] ?? this.players[0];

      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(proj.x - e.x, proj.y - e.y) >= proj.radius + e.radius) continue;

        const dmg = proj.damage * (owner ? this.damageMultFor(owner, e) / owner.effects.damageMult : 1);
        const killed = e.takeDamage(dmg);
        if (owner) this.applyLifesteal(owner, dmg);
        this.particles.floatText(e.x, e.y - 12, `-${Math.round(dmg)}`, '#ffffff');
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
          this.onEnemyKilled(e, owner);
          if (e.kind === 'explosive') this.explodeAt(e.x, e.y, 90, 32);
        }
        if (proj.chain && proj.chain > 0) this.applyChain(e, proj.damage, owner);
        if (proj.pierce > 0) proj.pierce--;
        else proj.alive = false;
        break;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private applyChain(origin: Enemy, baseDamage: number, owner: Player) {
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
      const dmg = baseDamage * 0.7;
      const killed = next.takeDamage(dmg);
      this.particles.floatText(next.x, next.y - 12, `-${Math.round(dmg)}`, '#ffe066');
      this.particles.burst(next.x, next.y, '#ffe066', 6, 120);
      if (killed) {
        this.onEnemyKilled(next, owner);
        if (next.kind === 'explosive') this.explodeAt(next.x, next.y, 90, 32);
      }
      fromX = next.x;
      fromY = next.y;
    }
  }

  private onEnemyKilled(e: Enemy, killer: Player | undefined) {
    this.particles.burst(e.x, e.y, '#ff5555', 16, 220);
    this.pushEvent(e.x, e.y, '#ff5555', 12);
    this.camera.shake(2.5, 0.08);
    this.hitStopTimer = Math.max(this.hitStopTimer, 0.035);
    this.sfx.kill();
    const mult = killer ? killer.effects.pointGainMult : 1;
    this.pointFlyers.spawn(e.x, e.y, Math.round((60 + this.round * 5) * mult));
    this.sfx.points();
    this.stats.kills++;
    this.killStreak++;
    this.killStreakTimer = 3;
    if (e.kind === 'boss') this.onBossKilled();
  }

  private onBossKilled() {
    this.addPoints(400 + this.round * 20);
    this.runBonusEssence += 60;
    let roll = rollWeapon(MYSTERY_BOX_POOL);
    while (RARITY_ORDER.indexOf(roll.rarity) < 2) roll = upgradeWeaponRoll(roll);
    const p = this.players[0];
    p.addWeapon(roll);
    this.particles.floatText(p.x, p.y - 40, `BOSS DOWN — ${WEAPON_DEFS[roll.weaponId].name.toUpperCase()}`, rarityColor(roll.rarity));
    this.sfx.rarityFanfare('legendary');
  }

  // ---------------- render ----------------

  private render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.scene === 'select') return this.renderSelect();
    if (this.scene === 'hub') return this.renderHub();
    if (this.scene === 'companions') return this.renderCompanions();
    if (this.scene === 'controls') return this.renderControls();
    if (this.scene === 'results') return this.renderResults();
    if (!this.players.length) return;

    ctx.save();
    ctx.translate(-this.camera.x + this.camera.offsetX, -this.camera.y + this.camera.offsetY);

    this.renderFloor();
    this.level.draw(ctx);
    this.renderStations();
    this.renderAirstrikeMarker();
    this.renderEnemyProjectiles();
    this.renderProjectiles();
    this.renderTurrets();
    this.renderEnemies();
    if (this.companion) {
      const c = this.companion;
      drawCompanion(ctx, c.species, c.level, c.rarity, c.x, c.y, c.facing, c.animPhase);
    }
    for (const p of this.players) this.renderPlayer(p);
    this.particles.draw(ctx);
    this.pointFlyers.draw(ctx);

    ctx.restore();

    this.renderLighting();
    drawHud(ctx, this.players[this.localIndex] ?? this.players[0], this.level, this.getHudState());

    if (this.paused) {
      ctx.fillStyle = 'rgba(6,7,10,0.74)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f4efe6';
      ctx.font = 'bold 38px monospace';
      ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 10);
      ctx.font = '13px monospace';
      ctx.fillStyle = '#8d97a5';
      ctx.fillText(`${formatKeyCode(this.keybinds.pause)} to resume · ${formatKeyCode(this.keybinds.mute)} to mute`, VIEW_W / 2, VIEW_H / 2 + 20);
    }
  }

  private getHudState(): HudState {
    const boss = this.enemies.find((e) => e.alive && e.kind === 'boss') ?? null;
    const partnerPlayer = this.players.find((p) => p.index !== this.localIndex);
    const hint = `${formatKeyCode(this.keybinds.moveUp)}${formatKeyCode(this.keybinds.moveLeft)}${formatKeyCode(this.keybinds.moveDown)}${formatKeyCode(this.keybinds.moveRight)} move · Mouse aim · Click/${formatKeyCode(this.keybinds.shoot)} shoot · ${formatKeyCode(this.keybinds.dash)} dash`;
    return {
      round: this.round,
      depth: this.level.depth(),
      enemiesRemaining: this.isGuest ? this.remoteEnemiesRemaining : this.enemies.filter((e) => e.alive).length + this.enemiesToSpawn.length,
      killStreak: this.killStreak,
      intermissionTimer: this.intermissionTimer,
      tutorialTimer: this.tutorialTimer,
      controlsHint: hint,
      boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
      companion: this.companion ? { name: this.companion.name, rarity: this.companion.rarity } : null,
      partner: partnerPlayer
        ? {
            name: partnerPlayer.character.name,
            color: partnerPlayer.character.color,
            hp: partnerPlayer.hp,
            maxHp: partnerPlayer.maxHp,
            downed: partnerPlayer.downed,
            downTimer: partnerPlayer.downTimer,
          }
        : null,
      muted: this.settings.muted,
      netStatus: this.net.connected ? (this.net.role === 'host' ? 'CO-OP · HOST' : 'CO-OP · GUEST') : null,
    };
  }

  private renderFloor() {
    const ctx = this.ctx;
    const totalW = this.level.totalWidth();
    const viewStart = Math.max(0, this.camera.x - 60);
    const viewEnd = Math.min(totalW, this.camera.x + VIEW_W + 60);
    ctx.fillStyle = '#12151c';
    ctx.fillRect(viewStart, 0, viewEnd - viewStart, WORLD_H);

    // chequered floor tiles, brighter than the old grid so the room reads
    const TILE = 48;
    const startTx = Math.floor(viewStart / TILE);
    const endTx = Math.ceil(viewEnd / TILE);
    for (let tx = startTx; tx < endTx; tx++) {
      for (let ty = 0; ty < WORLD_H / TILE; ty++) {
        const alt = (tx + ty) % 2 === 0;
        ctx.fillStyle = alt ? '#171b24' : '#141821';
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    for (let tx = startTx; tx < endTx; tx++) {
      ctx.beginPath();
      ctx.moveTo(tx * TILE, 0);
      ctx.lineTo(tx * TILE, WORLD_H);
      ctx.stroke();
    }
    for (let ty = 0; ty <= WORLD_H / TILE; ty++) {
      ctx.beginPath();
      ctx.moveTo(viewStart, ty * TILE);
      ctx.lineTo(viewEnd, ty * TILE);
      ctx.stroke();
    }
  }

  private renderStations() {
    const ctx = this.ctx;
    const boxCost = this.isGuest ? this.remoteBoxCost : this.mysteryBox.cost;
    for (const s of this.level.stations) {
      if (s.collected) continue;
      if (s.kind === 'mysterybox') {
        ctx.save();
        ctx.shadowColor = '#a24ddc';
        ctx.shadowBlur = 22;
        ctx.fillStyle = '#3a2350';
        ctx.fillRect(s.x - 24, s.y - 14, 48, 30);
        ctx.fillStyle = '#4a2f66';
        ctx.fillRect(s.x - 24, s.y - 24, 48, 12);
        ctx.strokeStyle = '#c98dff';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x - 24, s.y - 24, 48, 40);
        ctx.restore();
        ctx.fillStyle = '#f0dcff';
        ctx.font = 'bold 17px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', s.x, s.y + 6);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#d9a9ff';
        ctx.fillText(`[F] MYSTERY BOX — ${boxCost}`, s.x, s.y - 34);
      } else if (s.kind === 'workbench') {
        ctx.save();
        ctx.shadowColor = '#ff9d2e';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(s.x - 26, s.y - 16, 52, 34);
        ctx.strokeStyle = '#ffc069';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x - 26, s.y - 16, 52, 34);
        ctx.beginPath();
        ctx.moveTo(s.x - 14, s.y + 1);
        ctx.lineTo(s.x + 14, s.y + 1);
        ctx.moveTo(s.x, s.y - 12);
        ctx.lineTo(s.x, s.y + 14);
        ctx.stroke();
        ctx.restore();
        const roll = this.players[this.localIndex]?.currentWeapon.roll;
        let label = '[F] UPGRADE WEAPON';
        if (roll) {
          if (!canUpgrade(roll)) label = 'MAX RARITY';
          else label = `[F] UPGRADE — ${WORKBENCH_BASE_COST + RARITY_ORDER.indexOf(roll.rarity) * WORKBENCH_COST_STEP}`;
        }
        ctx.fillStyle = '#ffcf9e';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, s.x, s.y - 26);
      } else if (s.kind === 'treasure') {
        const pulse = (Math.sin(this.flickerPhase * 6) + 1) / 2;
        ctx.save();
        ctx.shadowColor = '#ffd23d';
        ctx.shadowBlur = 16 + pulse * 12;
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          const cx = s.x + Math.cos(ang) * 11;
          const cy = s.y + Math.sin(ang) * 8;
          ctx.fillStyle = '#ffd23d';
          ctx.beginPath();
          ctx.moveTo(cx, cy - 6);
          ctx.lineTo(cx + 6, cy);
          ctx.lineTo(cx, cy + 6);
          ctx.lineTo(cx - 6, cy);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#ffe9a8';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('walk over to collect', s.x, s.y - 28);
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

  private renderTurrets() {
    const ctx = this.ctx;
    for (const t of this.turrets) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a3a1c';
      ctx.beginPath();
      ctx.moveTo(-11, 6);
      ctx.lineTo(11, 6);
      ctx.lineTo(7, -4);
      ctx.lineTo(-7, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffb038';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.rotate(t.spin);
      ctx.fillStyle = '#ffd98a';
      ctx.fillRect(-2, -14, 4, 12);
      ctx.restore();
    }
  }

  private renderEnemyProjectiles() {
    const ctx = this.ctx;
    for (const proj of this.enemyProjectiles) {
      ctx.save();
      ctx.shadowColor = '#6bcf5f';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#9bffa0';
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

      const bob = Math.sin(e.wobble) * 1.6;

      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.85, e.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(e.x, e.y + bob, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // eyes give the blobs a face so kinds read apart at a glance
      const eyeOff = e.radius * 0.34;
      ctx.fillStyle = '#12151c';
      ctx.beginPath();
      ctx.arc(e.x - eyeOff, e.y + bob - 2, e.radius * 0.17, 0, Math.PI * 2);
      ctx.arc(e.x + eyeOff, e.y + bob - 2, e.radius * 0.17, 0, Math.PI * 2);
      ctx.fill();

      const barW = e.kind === 'boss' ? 58 : 30;
      const hpFrac = Math.max(0, e.hp / e.maxHp);
      if (hpFrac < 1) {
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(e.x - barW / 2, e.y - e.radius - 13, barW, 5);
        ctx.fillStyle = e.kind === 'boss' ? '#c22f2f' : '#e8455a';
        ctx.fillRect(e.x - barW / 2 + 1, e.y - e.radius - 12, (barW - 2) * hpFrac, 3);
      }
    }
  }

  private renderProjectiles() {
    const ctx = this.ctx;
    for (const proj of this.projectiles) {
      ctx.save();
      ctx.shadowColor = proj.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = proj.color;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderPlayer(p: Player) {
    const ctx = this.ctx;
    if (!p.alive) return;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    if (p.isInvincible) ctx.globalAlpha = 0.55;
    if (p.downed) {
      // knocked over: flattened body, no weapon
      ctx.fillStyle = '#8d4040';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4, PLAYER_RADIUS * 1.1, PLAYER_RADIUS * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff5b4a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      const barW = 44;
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(p.x - barW / 2, p.y - 26, barW, 6);
      ctx.fillStyle = p.reviveProgress > 0 ? '#3ddc73' : '#ff9d2e';
      const frac = p.reviveProgress > 0 ? p.reviveProgress : p.downTimer / DOWN_BLEEDOUT;
      ctx.fillRect(p.x - barW / 2 + 1, p.y - 25, (barW - 2) * Math.max(0, frac), 4);
      return;
    }

    ctx.shadowColor = p.character.color;
    ctx.shadowBlur = p.isDashing ? 22 : 10;
    ctx.fillStyle = p.character.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // little visor so the character has a facing read
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aimAngle);
    ctx.fillStyle = 'rgba(20,22,28,0.85)';
    ctx.fillRect(2, -6, 8, 12);
    // held weapon
    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(8, -3, 20, 6);
    ctx.fillStyle = rarityColor(p.currentWeapon.roll.rarity);
    ctx.fillRect(24, -2, 6, 4);
    ctx.restore();

    if (p.shieldFrac > 0) {
      ctx.strokeStyle = 'rgba(159,214,255,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.undyingTimer > 0) {
      ctx.strokeStyle = `rgba(255,158,196,${0.5 + Math.sin(this.flickerPhase * 12) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS + 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.players.length > 1) {
      ctx.fillStyle = p.character.color;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.index === this.localIndex ? 'YOU' : p.character.name.toUpperCase(), p.x, p.y - PLAYER_RADIUS - 8);
    }
  }

  private renderLighting() {
    const ctx = this.ctx;
    const mask = this.lightMaskCtx;
    mask.clearRect(0, 0, VIEW_W, VIEW_H);
    mask.globalCompositeOperation = 'source-over';
    mask.fillStyle = `rgba(4,5,7,${1 - AMBIENT_LIGHT})`;
    mask.fillRect(0, 0, VIEW_W, VIEW_H);
    mask.globalCompositeOperation = 'destination-out';

    // Only your own torch carves the darkness - a partner's beam lighting your
    // screen would give away rooms you haven't walked into.
    for (const p of this.players) {
      if (!p.alive || p.index !== this.localIndex) continue;
      const sx = p.x - this.camera.x + this.camera.offsetX;
      const sy = p.y - this.camera.y + this.camera.offsetY;
      const boost = p.visionBoostTimer > 0 ? 1.5 : 1;
      const coneR = Math.max(60, BASE_VISION_RADIUS * p.character.visionMult * boost + Math.sin(this.flickerPhase * 7) * 5);
      const ambientR = coneR * 0.44;

      const amb = mask.createRadialGradient(sx, sy, 0, sx, sy, ambientR);
      amb.addColorStop(0, 'rgba(0,0,0,0.9)');
      amb.addColorStop(1, 'rgba(0,0,0,0)');
      mask.fillStyle = amb;
      mask.beginPath();
      mask.arc(sx, sy, ambientR, 0, Math.PI * 2);
      mask.fill();

      if (p.downed) continue;
      mask.save();
      mask.translate(sx, sy);
      mask.rotate(p.aimAngle);
      const cone = mask.createRadialGradient(0, 0, 0, 0, 0, coneR);
      cone.addColorStop(0, 'rgba(0,0,0,1)');
      cone.addColorStop(0.75, 'rgba(0,0,0,0.9)');
      cone.addColorStop(1, 'rgba(0,0,0,0)');
      mask.fillStyle = cone;
      mask.beginPath();
      mask.moveTo(0, 0);
      mask.arc(0, 0, coneR, -Math.PI / 5.2, Math.PI / 5.2);
      mask.closePath();
      mask.fill();
      mask.restore();
    }

    mask.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightMaskCanvas, 0, 0);

    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // ---------------- menu chrome ----------------

  private renderMenuBackground() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.34, 40, VIEW_W / 2, VIEW_H * 0.34, VIEW_H * 1.1);
    g.addColorStop(0, '#1b1e26');
    g.addColorStop(1, '#06070a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 30; i++) {
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

  private renderNotice() {
    if (this.menuNoticeTimer <= 0 || !this.menuNotice) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = `rgba(255,210,61,${Math.min(1, this.menuNoticeTimer)})`;
    ctx.fillText(this.menuNotice, VIEW_W / 2, VIEW_H - 14);
  }

  private renderSelect() {
    const ctx = this.ctx;
    this.renderMenuBackground();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4efe6';
    ctx.font = 'bold 42px monospace';
    ctx.fillText('OUTBREAK 2D', VIEW_W / 2, 62);
    ctx.fillStyle = '#3ddc73';
    rrPath(ctx, VIEW_W / 2 - 80, 74, 160, 4, 2);
    ctx.fill();
    ctx.font = '13px monospace';
    ctx.fillStyle = '#8d97a5';
    ctx.fillText('BLACKROCK FACILITY', VIEW_W / 2, 96);

    drawEssenceBadge(ctx, VIEW_W / 2 - 88, 120, this.meta.essence);
    drawTokenBadge(ctx, VIEW_W / 2 + 88, 120, this.meta.tokens);

    const { cardW, cardH, gap, startX, y } = this.cardLayout();
    CHARACTER_ORDER.forEach((id, i) => {
      const def = CHARACTER_DEFS[id];
      const x = startX + i * (cardW + gap);
      const selected = i === this.selectedCharacterIndex;
      const unlocked = this.meta.classesUnlocked[id];
      const ultOwned = this.meta.ultimatesUnlocked[id];
      const pulse = selected ? (Math.sin(this.flickerPhase * 4) + 1) / 2 : 0;

      drawPanel(ctx, x, y, cardW, cardH,
        selected ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)',
        selected ? def.color : 'rgba(255,255,255,0.13)', selected ? 2.5 : 1, 14);
      if (selected) {
        ctx.save();
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 16 + pulse * 12;
        rrPath(ctx, x, y, cardW, cardH, 14);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = unlocked ? def.color : '#5b6069';
      ctx.fillText(def.tagline, x + cardW / 2, y + 20);

      ctx.save();
      if (!unlocked) ctx.globalAlpha = 0.35;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = selected ? 24 : 10;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x + cardW / 2, y + 58, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = unlocked ? '#f4efe6' : '#6b7078';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(def.name, x + cardW / 2, y + 106);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText(`♥ ${def.maxHp}`, x + cardW / 2 - 32, y + 124);
      ctx.fillStyle = '#8dd6ff';
      ctx.fillText(`▲ ${def.moveSpeed}`, x + cardW / 2 + 32, y + 124);

      ctx.font = '9px monospace';
      ctx.fillStyle = '#8d97a5';
      wrapText(ctx, def.passiveLabel, x + cardW / 2, y + 146, cardW - 20, 12);
      wrapText(ctx, `[E] ${def.activeLabel}`, x + cardW / 2, y + 184, cardW - 20, 12);

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = ultOwned ? def.ultimateColor : '#5b6069';
      wrapText(ctx, `${ultOwned ? '[X]' : '🔒'} ${def.ultimateLabel}`, x + cardW / 2, y + 222, cardW - 18, 11);

      if (!unlocked) {
        ctx.fillStyle = 'rgba(6,7,10,0.72)';
        rrPath(ctx, x, y, cardW, cardH, 14);
        ctx.fill();
        ctx.fillStyle = '#ffd23d';
        ctx.font = 'bold 22px monospace';
        ctx.fillText('🔒', x + cardW / 2, y + cardH / 2 - 8);
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`UNLOCK · ${def.unlockCost}`, x + cardW / 2, y + cardH / 2 + 18);
        ctx.font = '9px monospace';
        ctx.fillStyle = '#8d97a5';
        ctx.fillText('click to buy', x + cardW / 2, y + cardH / 2 + 34);
      } else {
        ctx.font = '9px monospace';
        ctx.fillStyle = '#5b6069';
        ctx.fillText(`KEY ${i + 1}`, x + cardW / 2, y + cardH - 10);
      }
    });

    const { btnW, btnH, gap: bg, startX: bsx, y: by } = this.selectButtonLayout();
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const hov = (bx: number) => mx >= bx && mx <= bx + btnW && my >= by && my <= by + btnH;
    const dropLabel = this.isGuest ? (this.awaitingHost ? 'WAITING…' : 'READY UP') : 'DROP IN';
    drawButton(ctx, bsx, by, btnW, btnH, dropLabel, '#3ddc73', hov(bsx), '#0a0c10', 13);
    drawButton(ctx, bsx + btnW + bg, by, btnW, btnH, 'SKILLS [U]', '#3d9bdc', hov(bsx + btnW + bg), '#0a0c10', 13);
    drawButton(ctx, bsx + (btnW + bg) * 2, by, btnW, btnH, 'COMPANIONS [B]', '#9fe6ff', hov(bsx + (btnW + bg) * 2), '#0a0c10', 12);
    drawButton(ctx, bsx + (btnW + bg) * 3, by, btnW, btnH, 'CONTROLS [C]', '#a24ddc', hov(bsx + (btnW + bg) * 3), '#0a0c10', 13);
    drawButton(ctx, bsx + (btnW + bg) * 4, by, btnW, btnH, this.net.connected ? 'CO-OP ✓' : 'CO-OP', this.net.connected ? '#6ee7d5' : '#e0713d', hov(bsx + (btnW + bg) * 4), '#0a0c10', 13);

    ctx.fillStyle = '#5b6069';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Arrow keys / click to select · Enter to start · M mutes audio', VIEW_W / 2, by + 78);
    if (this.net.connected) {
      ctx.fillStyle = '#6ee7d5';
      ctx.fillText(this.net.role === 'host' ? (this.guestReady ? 'Partner is ready — press DROP IN to launch.' : 'Waiting for partner to ready up…') : 'Connected as guest — the host starts the run.', VIEW_W / 2, by + 96);
    }
    this.renderNotice();
  }

  private renderHub() {
    const ctx = this.ctx;
    this.renderMenuBackground();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4efe6';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('SKILL TREE', VIEW_W / 2, 46);
    drawEssenceBadge(ctx, VIEW_W / 2 - 88, 72, this.meta.essence);
    drawTokenBadge(ctx, VIEW_W / 2 + 88, 72, this.meta.tokens);

    // branch headers
    for (let col = 0; col < 4; col++) {
      const node = SKILL_NODES.find((n) => n.col === col)!;
      const r = this.skillNodeRect(col, 0);
      ctx.fillStyle = BRANCH_COLOR[node.branch];
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(BRANCH_LABEL[node.branch], r.x + r.w / 2, r.y - 16);
    }

    // connectors first so nodes sit on top
    for (const node of SKILL_NODES) {
      const r = this.skillNodeRect(node.col, node.row);
      for (const reqId of node.requires) {
        const req = SKILL_NODES.find((n) => n.id === reqId);
        if (!req) continue;
        const rr2 = this.skillNodeRect(req.col, req.row);
        const owned = this.meta.skills.includes(reqId);
        ctx.strokeStyle = owned ? BRANCH_COLOR[node.branch] : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = owned ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(rr2.x + rr2.w / 2, rr2.y + rr2.h);
        ctx.lineTo(r.x + r.w / 2, r.y);
        ctx.stroke();
      }
    }

    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    for (const node of SKILL_NODES) {
      const r = this.skillNodeRect(node.col, node.row);
      const owned = this.meta.skills.includes(node.id);
      const available = isUnlockable(node, this.meta.skills);
      const affordable = available && this.meta.essence >= node.cost;
      const hover = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      const accent = BRANCH_COLOR[node.branch];

      drawPanel(ctx, r.x, r.y, r.w, r.h,
        owned ? 'rgba(255,255,255,0.1)' : hover && affordable ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        owned ? accent : available ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)',
        owned ? 2.5 : 1.5, 10);

      ctx.textAlign = 'left';
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = owned ? accent : available ? '#f4efe6' : '#5b6069';
      ctx.fillText(node.label, r.x + 12, r.y + 22);
      ctx.font = '9px monospace';
      ctx.fillStyle = owned ? '#8d97a5' : available ? '#8d97a5' : '#4d5259';
      wrapTextLeft(ctx, node.desc, r.x + 12, r.y + 38, r.w - 24, 11);

      ctx.textAlign = 'right';
      ctx.font = 'bold 11px monospace';
      if (owned) {
        ctx.fillStyle = accent;
        ctx.fillText('✓ OWNED', r.x + r.w - 12, r.y + 62);
      } else {
        ctx.fillStyle = affordable ? '#ffd23d' : '#5b6069';
        ctx.fillText(`◆ ${node.cost}`, r.x + r.w - 12, r.y + 62);
      }
    }

    // right rail: ultimate + companion purchases
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#8d97a5';
    ctx.fillText('LOADOUT', VIEW_W - 304, 152);
    for (const row of this.railRows()) {
      const hover = mx >= row.x && mx <= row.x + row.w && my >= row.y && my <= row.y + row.h;
      drawPanel(ctx, row.x, row.y, row.w, row.h,
        hover && row.buyable ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
        'rgba(255,255,255,0.12)', 1, 8);
      ctx.fillStyle = row.accent;
      rrPath(ctx, row.x, row.y, 4, row.h, 2);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#f4efe6';
      ctx.fillText(row.label, row.x + 12, row.y + 18);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#8d97a5';
      ctx.fillText(row.sub.slice(0, 40), row.x + 12, row.y + 32);
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px monospace';
      if (row.cost === null) {
        ctx.fillStyle = '#3ddc73';
        ctx.fillText('✓', row.x + row.w - 12, row.y + 26);
      } else {
        ctx.fillStyle = row.buyable ? (row.currency === 'essence' ? '#ffd23d' : '#9fe6ff') : '#5b6069';
        ctx.fillText(`${row.currency === 'essence' ? '◆' : '⬢'} ${row.cost}`, row.x + row.w - 12, row.y + 26);
      }
    }

    drawButton(ctx, VIEW_W / 2 - 90, VIEW_H - 68, 180, 44, 'BACK [Esc]', '#e04b3d',
      mx >= VIEW_W / 2 - 90 && mx <= VIEW_W / 2 + 90 && my >= VIEW_H - 68 && my <= VIEW_H - 24);
    this.renderNotice();
  }

  private renderCompanions() {
    const ctx = this.ctx;
    this.renderMenuBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4efe6';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('COMPANIONS', VIEW_W / 2, 46);
    drawTokenBadge(ctx, VIEW_W / 2, 76, this.meta.tokens);

    const slots = companionSlots(this.meta);
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const inside = (r: { x: number; y: number; w: number; h: number }) =>
      mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

    for (let i = 0; i < MAX_COMPANION_SLOTS; i++) {
      const card = this.companionCardRect(i);
      const unlocked = i < slots;
      const pet = unlocked ? this.meta.companions[i] : undefined;
      const isActive = pet && pet.id === this.meta.activeCompanionId;
      const accent = pet ? rarityColor(pet.rarity) : '#4d5259';

      drawPanel(ctx, card.x, card.y, card.w, card.h,
        isActive ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)',
        isActive ? accent : 'rgba(255,255,255,0.13)', isActive ? 2.5 : 1, 14);

      if (!unlocked) {
        const cost = i === slots ? nextSlotCost(this.meta) : null;
        ctx.textAlign = 'center';
        ctx.font = 'bold 26px monospace';
        ctx.fillStyle = '#4d5259';
        ctx.fillText('🔒', card.x + card.w / 2, card.y + card.h / 2 - 16);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = cost === null ? '#4d5259' : '#9fe6ff';
        ctx.fillText(`SLOT ${i + 1}`, card.x + card.w / 2, card.y + card.h / 2 + 8);
        if (cost !== null) {
          ctx.font = 'bold 13px monospace';
          ctx.fillStyle = this.meta.tokens >= cost ? '#9fe6ff' : '#5b6069';
          ctx.fillText(`⬢ ${cost}`, card.x + card.w / 2, card.y + card.h / 2 + 30);
          ctx.font = '9px monospace';
          ctx.fillStyle = '#5b6069';
          ctx.fillText('click to unlock', card.x + card.w / 2, card.y + card.h / 2 + 46);
        } else {
          ctx.font = '9px monospace';
          ctx.fillStyle = '#4d5259';
          ctx.fillText('unlock previous slot first', card.x + card.w / 2, card.y + card.h / 2 + 28);
        }
        continue;
      }

      if (!pet) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#5b6069';
        ctx.fillText('EMPTY SLOT', card.x + card.w / 2, card.y + card.h / 2 - 4);
        ctx.font = '9px monospace';
        ctx.fillText('pull the box below', card.x + card.w / 2, card.y + card.h / 2 + 14);
        continue;
      }

      // animated sprite preview
      drawCompanion(ctx, pet.species, pet.level, pet.rarity, card.x + card.w / 2, card.y + 72,
        Math.sin(this.flickerPhase * 0.7) * 0.6, this.flickerPhase, 2.3);

      ctx.textAlign = 'center';
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = accent;
      ctx.fillText(companionName(pet), card.x + card.w / 2, card.y + 144);

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#8d97a5';
      ctx.fillText(`${pet.rarity.toUpperCase()} · TIER ${pet.level}/${COMPANION_LEVEL_CAP}`, card.x + card.w / 2, card.y + 160);

      ctx.font = '8px monospace';
      ctx.fillStyle = '#6b7078';
      wrapText(ctx, SPECIES_DEFS[pet.species].blurb, card.x + card.w / 2, card.y + 176, card.w - 24, 10);

      const stats = companionStats(pet);
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText(`DMG ${stats.damage.toFixed(1)}`, card.x + 16, card.y + 206);
      ctx.fillStyle = '#8dd6ff';
      ctx.fillText(`RATE ${stats.fireRate.toFixed(2)}/s`, card.x + 16, card.y + 220);
      ctx.fillStyle = '#9fe6ff';
      ctx.fillText(`RANGE ${Math.round(stats.range)}`, card.x + 118, card.y + 206);

      const btns = this.companionButtons(i);
      const evolveCost = companionLevelCost(pet.level);
      drawButton(ctx, btns.evolve.x, btns.evolve.y, btns.evolve.w, btns.evolve.h,
        evolveCost === null ? 'MAX' : `⬢ ${evolveCost}`,
        evolveCost !== null && this.meta.tokens >= evolveCost ? '#3ddc73' : '#3a4048',
        inside(btns.evolve), '#0a0c10', 11);
      drawButton(ctx, btns.remove.x, btns.remove.y, btns.remove.w, btns.remove.h, 'RELEASE', '#e04b3d', inside(btns.remove), '#0a0c10', 11);
      drawButton(ctx, btns.select.x, btns.select.y, btns.select.w, btns.select.h,
        isActive ? '★ DEPLOYED' : 'DEPLOY', isActive ? accent : '#3d9bdc', inside(btns.select), '#0a0c10', 12);
    }

    const boxCost = companionBoxCost(this.meta.companionBoxPulls);
    const boxRect = this.boxButtonRect();
    const backRect = this.companionBackRect();
    const canPull = this.meta.tokens >= boxCost && this.meta.companions.length < slots;
    drawButton(ctx, boxRect.x, boxRect.y, boxRect.w, boxRect.h, `COMPANION BOX  ⬢ ${boxCost}`,
      canPull ? '#a24ddc' : '#3a4048', inside(boxRect), '#0a0c10', 14);
    drawButton(ctx, backRect.x, backRect.y, backRect.w, backRect.h, 'BACK [Esc]', '#e04b3d', inside(backRect), '#0a0c10', 14);

    ctx.textAlign = 'center';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#5b6069';
    ctx.fillText(
      `${this.meta.companions.length}/${slots} slots used · each pull rolls a new species and rarity · evolving raises tier and reshapes the sprite`,
      VIEW_W / 2, 584,
    );
    this.renderNotice();
  }

  private renderControls() {
    const ctx = this.ctx;
    this.renderMenuBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4efe6';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('CONTROLS & AUDIO', VIEW_W / 2, 42);

    // audio strip
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const muteHover = mx >= 60 && mx <= 150 && my >= 66 && my <= 94;
    drawButton(ctx, 60, 66, 90, 28, this.settings.muted ? 'UNMUTE' : 'MUTE', this.settings.muted ? '#e04b3d' : '#3ddc73', muteHover, '#0a0c10', 11);

    ctx.fillStyle = '#2b2f38';
    rrPath(ctx, 170, 74, 300, 12, 6);
    ctx.fill();
    ctx.fillStyle = this.settings.muted ? '#5b6069' : '#3d9bdc';
    rrPath(ctx, 170, 74, 300 * this.settings.volume, 12, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    rrPath(ctx, 170, 74, 300, 12, 6);
    ctx.stroke();
    ctx.fillStyle = '#f4efe6';
    ctx.beginPath();
    ctx.arc(170 + 300 * this.settings.volume, 80, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    ctx.fillStyle = '#8d97a5';
    ctx.fillText(`VOLUME ${Math.round(this.settings.volume * 100)}%  (click the bar to set · ${formatKeyCode(this.keybinds.mute)} toggles mute)`, 486, 84);

    const rowH = 30;
    const startY = 118;
    const colW = 560;
    ACTION_ORDER.forEach((action, i) => {
      const col = i < 9 ? 0 : 1;
      const rowIdx = i < 9 ? i : i - 9;
      const rx = 60 + col * (colW + 40);
      const ry = startY + rowIdx * rowH;
      const listening = this.listeningForAction === action;
      const hover = mx >= rx && mx <= rx + colW && my >= ry && my <= ry + rowH - 4;
      drawPanel(ctx, rx, ry, colW, rowH - 4,
        listening ? 'rgba(255,210,61,0.14)' : hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)',
        'rgba(255,255,255,0.08)', 1, 6);
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = '#f4efe6';
      ctx.fillText(ACTION_LABELS[action], rx + 14, ry + 18);
      drawKeyChip(ctx, rx + colW - 60, ry + rowH / 2 - 2, listening ? '...' : formatKeyCode(this.keybinds[action] || '—'), listening);
    });

    ctx.textAlign = 'center';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#5b6069';
    ctx.fillText(this.listeningForAction ? 'Press any key to bind… (Esc cancels)' : 'Click a row, then press the key you want', VIEW_W / 2, VIEW_H - 82);

    drawButton(ctx, VIEW_W / 2 - 190, VIEW_H - 62, 180, 40, 'RESET DEFAULTS', '#ff9d2e',
      mx >= VIEW_W / 2 - 190 && mx <= VIEW_W / 2 - 10 && my >= VIEW_H - 62 && my <= VIEW_H - 22, '#0a0c10', 12);
    drawButton(ctx, VIEW_W / 2 + 10, VIEW_H - 62, 180, 40, 'BACK [Esc]', '#e04b3d',
      mx >= VIEW_W / 2 + 10 && mx <= VIEW_W / 2 + 190 && my >= VIEW_H - 62 && my <= VIEW_H - 22, '#0a0c10', 12);
    this.renderNotice();
  }

  private renderResults() {
    const ctx = this.ctx;
    this.renderMenuBackground();
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#e04b3d';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#e04b3d';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('OVERRUN', VIEW_W / 2, 190);
    ctx.restore();

    drawPanel(ctx, VIEW_W / 2 - 190, 226, 380, 200, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)', 1, 14);
    ctx.fillStyle = '#f4efe6';
    ctx.font = '16px monospace';
    ctx.fillText(`Rounds survived: ${this.stats.roundsSurvived}`, VIEW_W / 2, 262);
    ctx.fillText(`Rooms explored: ${this.level.depth()}`, VIEW_W / 2, 290);
    ctx.fillText(`Kills: ${this.stats.kills}`, VIEW_W / 2, 318);
    ctx.fillText(`Points earned: ${this.stats.points}`, VIEW_W / 2, 346);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#ffd23d';
    ctx.fillText(`◆ +${this.lastEssenceEarned} ESSENCE`, VIEW_W / 2, 378);
    ctx.fillStyle = '#9fe6ff';
    ctx.fillText(`⬢ +${this.lastTokensEarned} TOKENS`, VIEW_W / 2, 402);

    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    drawButton(ctx, VIEW_W / 2 - 130, 460, 260, 48, 'CONTINUE', '#3ddc73',
      mx >= VIEW_W / 2 - 130 && mx <= VIEW_W / 2 + 130 && my >= 460 && my <= 508);
    ctx.fillStyle = '#5b6069';
    ctx.font = '11px monospace';
    ctx.fillText('or press Enter / Space', VIEW_W / 2, 528);
  }
}

// ---------------- drawing helpers ----------------

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw = 1.5, radius = 12) {
  rrPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = sw;
    ctx.stroke();
  }
}

function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, color: string, hover = false, textColor = '#0a0c10', fontSize = 14) {
  ctx.save();
  if (hover) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
  }
  rrPath(ctx, x, y, w, h, 11);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  rrPath(ctx, x, y, w, h, 11);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + fontSize * 0.35);
}

function drawKeyChip(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string, active: boolean) {
  const w = Math.max(56, label.length * 10 + 20);
  const h = 22;
  rrPath(ctx, cx - w / 2, cy - h / 2, w, h, 5);
  ctx.fillStyle = active ? '#ffd23d' : '#1a1c22';
  ctx.fill();
  ctx.strokeStyle = active ? '#fff2b8' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = active ? '#0a0c10' : '#f4efe6';
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

function drawHexIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawEssenceBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, amount: number) {
  const label = `${amount}`;
  ctx.font = 'bold 13px monospace';
  const w = ctx.measureText(label).width + 48;
  drawPanel(ctx, cx - w / 2, cy - 12, w, 24, 'rgba(255,210,61,0.1)', 'rgba(255,210,61,0.4)', 1.5, 12);
  drawDiamond(ctx, cx - w / 2 + 17, cy, 6, '#ffd23d');
  ctx.fillStyle = '#ffd23d';
  ctx.textAlign = 'left';
  ctx.fillText(`${label} ESSENCE`, cx - w / 2 + 28, cy + 4);
}

function drawTokenBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, amount: number) {
  const label = `${amount}`;
  ctx.font = 'bold 13px monospace';
  const w = ctx.measureText(label).width + 44;
  drawPanel(ctx, cx - w / 2, cy - 12, w, 24, 'rgba(159,230,255,0.1)', 'rgba(159,230,255,0.4)', 1.5, 12);
  drawHexIcon(ctx, cx - w / 2 + 16, cy, 7, '#9fe6ff');
  ctx.fillStyle = '#9fe6ff';
  ctx.textAlign = 'left';
  ctx.fillText(`${label} TOKENS`, cx - w / 2 + 27, cy + 4);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = `${word} `;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
}

function wrapTextLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  wrapText(ctx, text, x, y, maxWidth, lineHeight);
  ctx.textAlign = prev;
}
