import type { RoomContent, StationKind, FieldUpgrade } from './types';
import {
  ROOM_W,
  ROOM_H,
  ROOM_TILES_X,
  ROOM_TILES_Y,
  CELL_W,
  CELL_H,
  CORRIDOR_LEN,
  CORRIDOR_W,
  WALL_THICK,
  doorCost,
  TILE,
} from './constants';

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 0 = east, 1 = south, 2 = west, 3 = north. */
export type Side = 0 | 1 | 2 | 3;
const SIDE_DX = [1, 0, -1, 0];
const SIDE_DY = [0, 1, 0, -1];
const ALL_SIDES: Side[] = [0, 1, 2, 3];
function opposite(s: Side): Side {
  return ((s + 2) % 4) as Side;
}

export interface RoomInfo {
  index: number;
  col: number;
  row: number;
  /** Outer rect, walls included. */
  x: number;
  y: number;
  w: number;
  h: number;
  content: RoomContent;
  /** Interior cover, in world coordinates, so rooms aren't bare boxes. */
  obstacles: Wall[];
  /** Door index on each side, -1 where the room has no neighbour. */
  links: [number, number, number, number];
  /** Doors are only rolled for a room once the player has actually opened it. */
  expanded: boolean;
  /** Reached through open doors - drives depth, spawn points and the minimap. */
  reached: boolean;
  /** Doors crossed from the start room, which is what a door costs scale on. */
  depth: number;
}

export interface DoorInfo {
  index: number;
  /** The two rooms this joins; `side` is the side of `a` it leaves by. */
  a: number;
  b: number;
  side: Side;
  /** Barrier across the corridor while the door is shut. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /** Corridor centre, used for the buy prompt and its distance test. */
  cx: number;
  cy: number;
  cost: number;
  open: boolean;
}

export interface Corridor {
  /** Walkable rect joining the two rooms, walls excluded. */
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
}

export interface Station {
  kind: StationKind;
  x: number;
  y: number;
  roomIndex: number;
  collected: boolean;
  /** Only set for 'upgrade' stations. */
  perk?: FieldUpgrade;
}

const FIELD_UPGRADES: FieldUpgrade[] = ['vitality', 'power', 'haste', 'reload'];

/**
 * Room architecture, authored on a 12x10 grid of 50px tiles ('#' = wall).
 * The two centre rows and columns are punched clear after conversion, so every
 * template keeps an open cross joining all four doorways and the station in the
 * middle - a layout can never seal a room off or wall a station in.
 */
const ROOM_TEMPLATES: string[][] = [
  // pillar hall
  [
    '............',
    '.#.#.#.#.#..',
    '............',
    '.#.#.#.#.#..',
    '............',
    '............',
    '.#.#.#.#.#..',
    '............',
    '.#.#.#.#.#..',
    '............',
  ],
  // nested vault
  [
    '............',
    '..########..',
    '..#......#..',
    '..#.####.#..',
    '..#.#..#.#..',
    '..#.#..#.#..',
    '..#.####.#..',
    '..#......#..',
    '..########..',
    '............',
  ],
  // alcoves
  [
    '............',
    '.####..####.',
    '.#..#..#..#.',
    '.#..####..#.',
    '.#........#.',
    '.#........#.',
    '.#..####..#.',
    '.#..#..#..#.',
    '.####..####.',
    '............',
  ],
  // staggered barricades
  [
    '............',
    '.#######....',
    '.......#....',
    '....#######.',
    '....#.......',
    '.#######....',
    '.......#....',
    '....#######.',
    '....#.......',
    '............',
  ],
  // corner blocks
  [
    '............',
    '.###....###.',
    '.#........#.',
    '.#........#.',
    '............',
    '............',
    '.#........#.',
    '.#........#.',
    '.###....###.',
    '............',
  ],
  // sparse - a breather between dense rooms
  [
    '............',
    '............',
    '...##..##...',
    '...##..##...',
    '............',
    '............',
    '...##..##...',
    '...##..##...',
    '............',
    '............',
  ],
];

/** Turns a tile template into as few rects as possible by merging runs. */
function templateToWalls(template: string[], originX: number, originY: number, mirrorX: boolean, mirrorY: boolean): Wall[] {
  const rows = ROOM_TILES_Y;
  const cols = ROOM_TILES_X;
  const midCols = [cols / 2 - 1, cols / 2];
  const midRows = [rows / 2 - 1, rows / 2];
  const solid = (row: number, col: number) => {
    if (midRows.includes(row) || midCols.includes(col)) return false;
    const r = mirrorY ? rows - 1 - row : row;
    const c = mirrorX ? cols - 1 - col : col;
    return template[r][c] === '#';
  };

  const out: Wall[] = [];
  for (let row = 0; row < rows; row++) {
    let runStart = -1;
    for (let col = 0; col <= cols; col++) {
      const isSolid = col < cols && solid(row, col);
      if (isSolid && runStart < 0) runStart = col;
      if (!isSolid && runStart >= 0) {
        out.push({
          x: originX + runStart * TILE,
          y: originY + row * TILE,
          w: (col - runStart) * TILE,
          h: TILE,
        });
        runStart = -1;
      }
    }
  }
  return out;
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How many *new* exits a room opens up when the player first walks into it.
 * Zero is allowed for anything but the start room - a facility with no dead ends
 * reads as a corridor with extra steps. The average is comfortably above one, so
 * the frontier still grows however the rolls fall.
 */
function rollExitCount(isStart: boolean): number {
  const roll = Math.random();
  if (isStart) return roll < 0.4 ? 2 : roll < 0.8 ? 3 : 4;
  return roll < 0.24 ? 0 : roll < 0.54 ? 1 : roll < 0.85 ? 2 : 3;
}

/** Chance a room wires itself into an already-generated neighbour, making a loop. */
const LOOP_CHANCE = 0.55;

/**
 * A facility that branches in every direction. Rooms sit on an integer grid and
 * are joined by corridors; a room touches at most four others, one per side, and
 * how many of those exist is rolled fresh every run, so no two layouts match.
 *
 * Generation stays one ring ahead of the player: opening a door reveals the room
 * behind it and only then rolls that room's own exits.
 */
export class Level {
  rooms: RoomInfo[] = [];
  doors: DoorInfo[] = [];
  corridors: Corridor[] = [];
  stations: Station[] = [];
  walls: Wall[] = [];

  private grid = new Map<string, number>();
  private lastTemplate = -1;
  private boxPlaced = false;
  /** Walls bucketed by grid cell, so collision lookups don't rescan the map. */
  private nearCache = new Map<string, Wall[]>();

  constructor() {
    const start = this.addRoom(0, 0, 'start', 0);
    this.expand(start);
    this.ensureFrontier();
  }

  private static key(col: number, row: number): string {
    return `${col},${row}`;
  }

  private rollContent(): RoomContent {
    if (!this.boxPlaced) {
      this.boxPlaced = true;
      return 'mysterybox';
    }
    const roll = Math.random();
    return roll < 0.2 ? 'workbench'
      : roll < 0.38 ? 'upgrade'
      : roll < 0.55 ? 'ammo'
      : roll < 0.72 ? 'treasure'
      : 'empty';
  }

  private rollObstacles(x: number, y: number): Wall[] {
    // never repeat the previous room's layout back-to-back
    let idx = Math.floor(Math.random() * ROOM_TEMPLATES.length);
    if (idx === this.lastTemplate) {
      idx = (idx + 1 + Math.floor(Math.random() * (ROOM_TEMPLATES.length - 1))) % ROOM_TEMPLATES.length;
    }
    this.lastTemplate = idx;
    return templateToWalls(ROOM_TEMPLATES[idx], x + WALL_THICK, y + WALL_THICK, Math.random() < 0.5, Math.random() < 0.5);
  }

  private addRoom(col: number, row: number, content: RoomContent, depth: number): number {
    const index = this.rooms.length;
    const x = col * CELL_W;
    const y = row * CELL_H;
    const room: RoomInfo = {
      index,
      col,
      row,
      x,
      y,
      w: ROOM_W,
      h: ROOM_H,
      content,
      obstacles: this.rollObstacles(x, y),
      links: [-1, -1, -1, -1],
      expanded: false,
      reached: depth === 0,
      depth,
    };
    this.rooms.push(room);
    this.grid.set(Level.key(col, row), index);

    if (content !== 'empty' && content !== 'start') {
      this.stations.push({
        kind: content,
        x: x + ROOM_W / 2,
        y: y + ROOM_H / 2,
        roomIndex: index,
        collected: false,
        perk: content === 'upgrade' ? FIELD_UPGRADES[Math.floor(Math.random() * FIELD_UPGRADES.length)] : undefined,
      });
    }
    return index;
  }

  /** Joins two rooms with a corridor and the shut door that gates it. */
  private link(aIndex: number, bIndex: number, side: Side) {
    const a = this.rooms[aIndex];
    const b = this.rooms[bIndex];
    const horizontal = side === 0 || side === 2;
    const index = this.doors.length;

    let corridor: Corridor;
    if (horizontal) {
      const left = side === 0 ? a : b;
      const cy = a.y + ROOM_H / 2;
      corridor = { x: left.x + ROOM_W, y: cy - CORRIDOR_W / 2, w: CORRIDOR_LEN, h: CORRIDOR_W, horizontal: true };
    } else {
      const top = side === 1 ? a : b;
      const cx = a.x + ROOM_W / 2;
      corridor = { x: cx - CORRIDOR_W / 2, y: top.y + ROOM_H, w: CORRIDOR_W, h: CORRIDOR_LEN, horizontal: false };
    }
    this.corridors.push(corridor);

    const cx = corridor.x + corridor.w / 2;
    const cy = corridor.y + corridor.h / 2;
    const depth = Math.min(a.depth, b.depth);
    this.doors.push({
      index,
      a: aIndex,
      b: bIndex,
      side,
      bx: horizontal ? cx - WALL_THICK / 2 : corridor.x,
      by: horizontal ? corridor.y : cy - WALL_THICK / 2,
      bw: horizontal ? WALL_THICK : corridor.w,
      bh: horizontal ? corridor.h : WALL_THICK,
      cx,
      cy,
      cost: doorCost(depth),
      open: false,
    });
    a.links[side] = index;
    b.links[opposite(side)] = index;
  }

  /**
   * Rolls a room's exits. Free sides either grow a brand new room or, when the
   * cell is already taken, wire into that neighbour - those loop connections are
   * what stop the facility from being a tree you can only backtrack through.
   */
  private expand(roomIndex: number) {
    const room = this.rooms[roomIndex];
    if (room.expanded) return;
    room.expanded = true;

    const free = shuffled(ALL_SIDES).filter((s) => room.links[s] < 0);
    let want = rollExitCount(room.depth === 0);
    for (const side of free) {
      if (want <= 0) break;
      const col = room.col + SIDE_DX[side];
      const row = room.row + SIDE_DY[side];
      const existing = this.grid.get(Level.key(col, row));
      if (existing !== undefined) {
        if (Math.random() < LOOP_CHANCE && this.rooms[existing].links[opposite(side)] < 0) {
          this.link(roomIndex, existing, side);
          want--;
        }
        continue;
      }
      const next = this.addRoom(col, row, this.rollContent(), room.depth + 1);
      this.link(roomIndex, next, side);
      want--;
    }
    this.rebuildWalls();
  }

  private hasFrontier(): boolean {
    return this.doors.some((d) => !d.open && (this.rooms[d.a].reached || this.rooms[d.b].reached));
  }

  /**
   * Dead-end rooms mean a branch can close off, and if every branch closes at
   * once the run has nowhere left to buy into. When that happens the facility
   * grows one more exit off somewhere already opened, so there is always a door
   * to spend points on.
   */
  private ensureFrontier() {
    if (this.hasFrontier()) return;
    for (const room of shuffled(this.rooms.filter((r) => r.reached && r.links.some((l) => l < 0)))) {
      for (const side of shuffled(ALL_SIDES).filter((s) => room.links[s] < 0)) {
        const col = room.col + SIDE_DX[side];
        const row = room.row + SIDE_DY[side];
        const existing = this.grid.get(Level.key(col, row));
        if (existing === undefined) {
          const next = this.addRoom(col, row, this.rollContent(), room.depth + 1);
          this.link(room.index, next, side);
          this.rebuildWalls();
          return;
        }
        // every free side is boxed in - joining an unopened neighbour still
        // gives the player somewhere to go
        if (!this.rooms[existing].reached && this.rooms[existing].links[opposite(side)] < 0) {
          this.link(room.index, existing, side);
          this.rebuildWalls();
          return;
        }
      }
    }
  }

  /** Rooms the player has actually opened up, which is what a run is scored on. */
  depth(): number {
    let n = 0;
    for (const r of this.rooms) if (r.reached) n++;
    return n - 1;
  }

  bounds(): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of this.rooms) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    return { minX, minY, maxX, maxY };
  }

  /** Every side wall of a room, split around whatever doorways it has. */
  private roomWalls(room: RoomInfo, out: Wall[]) {
    const { x, y, w, h } = room;
    const gapY0 = y + h / 2 - CORRIDOR_W / 2;
    const gapY1 = y + h / 2 + CORRIDOR_W / 2;
    const gapX0 = x + w / 2 - CORRIDOR_W / 2;
    const gapX1 = x + w / 2 + CORRIDOR_W / 2;

    for (const side of ALL_SIDES) {
      const open = room.links[side] >= 0;
      if (side === 0 || side === 2) {
        const wx = side === 0 ? x + w - WALL_THICK : x;
        if (!open) {
          out.push({ x: wx, y, w: WALL_THICK, h });
        } else {
          out.push({ x: wx, y, w: WALL_THICK, h: gapY0 - y });
          out.push({ x: wx, y: gapY1, w: WALL_THICK, h: y + h - gapY1 });
        }
      } else {
        const wy = side === 1 ? y + h - WALL_THICK : y;
        if (!open) {
          out.push({ x, y: wy, w, h: WALL_THICK });
        } else {
          out.push({ x, y: wy, w: gapX0 - x, h: WALL_THICK });
          out.push({ x: gapX1, y: wy, w: x + w - gapX1, h: WALL_THICK });
        }
      }
    }
  }

  private rebuildWalls() {
    this.walls = [];
    for (const room of this.rooms) {
      this.roomWalls(room, this.walls);
      for (const o of room.obstacles) this.walls.push(o);
    }
    for (const c of this.corridors) {
      if (c.horizontal) {
        this.walls.push({ x: c.x, y: c.y - WALL_THICK, w: c.w, h: WALL_THICK });
        this.walls.push({ x: c.x, y: c.y + c.h, w: c.w, h: WALL_THICK });
      } else {
        this.walls.push({ x: c.x - WALL_THICK, y: c.y, w: WALL_THICK, h: c.h });
        this.walls.push({ x: c.x + c.w, y: c.y, w: WALL_THICK, h: c.h });
      }
    }
    this.nearCache.clear();
  }

  /** Co-op guests don't simulate the level - they mirror the host's copy. */
  hydrate(rooms: RoomInfo[], doors: DoorInfo[], corridors: Corridor[], stations: Station[]) {
    this.rooms = rooms;
    this.doors = doors;
    this.corridors = corridors;
    this.stations = stations;
    this.grid.clear();
    for (const r of rooms) this.grid.set(Level.key(r.col, r.row), r.index);
    this.rebuildWalls();
  }

  private doorBarriers(): Wall[] {
    return this.doors
      .filter((d) => !d.open)
      .map((d) => ({ x: d.bx, y: d.by, w: d.bw, h: d.bh }));
  }

  allWalls(): Wall[] {
    return [...this.walls, ...this.doorBarriers()];
  }

  /** The room containing a point, or the nearest one when it's in a corridor. */
  roomIndexAt(x: number, y: number): number {
    for (const r of this.rooms) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.index;
    }
    let best = 0;
    let bestDist = Infinity;
    for (const r of this.rooms) {
      const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));
      if (d < bestDist) {
        bestDist = d;
        best = r.index;
      }
    }
    return best;
  }

  /**
   * Collision only ever needs geometry from the cell you're in and its
   * neighbours. Results are bucketed per cell and cached, so a room full of
   * enemies doesn't rescan an ever-growing facility every frame.
   */
  wallsNear(x: number, y: number): Wall[] {
    const col = Math.floor(x / CELL_W);
    const row = Math.floor(y / CELL_H);
    const key = Level.key(col, row);
    const hit = this.nearCache.get(key);
    if (hit) return hit;
    const built = this.wallsInBox(
      (col - 1) * CELL_W,
      (row - 1) * CELL_H,
      (col + 2) * CELL_W,
      (row + 2) * CELL_H,
    );
    this.nearCache.set(key, built);
    return built;
  }

  wallsInBox(x0: number, y0: number, x1: number, y1: number): Wall[] {
    const out: Wall[] = [];
    for (const w of this.walls) {
      if (w.x + w.w >= x0 && w.x <= x1 && w.y + w.h >= y0 && w.y <= y1) out.push(w);
    }
    for (const d of this.doorBarriers()) {
      if (d.x + d.w >= x0 && d.x <= x1 && d.y + d.h >= y0 && d.y <= y1) out.push(d);
    }
    return out;
  }

  distToDoor(doorIndex: number, x: number, y: number): number {
    const d = this.doors[doorIndex];
    return Math.hypot(x - d.cx, y - d.cy);
  }

  /** The nearest shut door that the player can actually reach from where they are. */
  nearestClosedDoor(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const d of this.doors) {
      if (d.open) continue;
      // A door is only buyable from a room you've already opened up, otherwise
      // you could buy through a wall into a room you've never been in.
      if (!this.rooms[d.a].reached && !this.rooms[d.b].reached) continue;
      const dist = this.distToDoor(d.index, x, y);
      if (dist < bestDist) {
        bestDist = dist;
        best = d.index;
      }
    }
    return best;
  }

  buyDoor(index: number): boolean {
    const d = this.doors[index];
    if (!d || d.open) return false;
    d.open = true;
    this.rooms[d.a].reached = true;
    this.rooms[d.b].reached = true;
    this.expand(d.a);
    this.expand(d.b);
    this.ensureFrontier();
    this.rebuildWalls();
    return true;
  }

  /** Rooms the player can currently stand in - spawn points come from these. */
  reachedRooms(): RoomInfo[] {
    return this.rooms.filter((r) => r.reached);
  }

  /** The rooms one open door away from `roomIndex`, plus the room itself. */
  roomAndNeighbours(roomIndex: number): RoomInfo[] {
    const out = [this.rooms[roomIndex]];
    for (const side of ALL_SIDES) {
      const doorIdx = this.rooms[roomIndex].links[side];
      if (doorIdx < 0) continue;
      const door = this.doors[doorIdx];
      if (!door.open) continue;
      out.push(this.rooms[door.a === roomIndex ? door.b : door.a]);
    }
    return out;
  }

  /**
   * Breadth-first route table over open doors: for every room, the door to take
   * to get one step closer to `targetRoom`. This is the coarse tier of enemy
   * navigation - the flow field only covers the cells around the players, so
   * anything further out steers door to door until it arrives in range.
   */
  routeTo(targetRoom: number): Int32Array {
    const route = new Int32Array(this.rooms.length).fill(-1);
    const seen = new Uint8Array(this.rooms.length);
    seen[targetRoom] = 1;
    let frontier = [targetRoom];
    while (frontier.length) {
      const next: number[] = [];
      for (const idx of frontier) {
        for (const side of ALL_SIDES) {
          const doorIdx = this.rooms[idx].links[side];
          if (doorIdx < 0) continue;
          const door = this.doors[doorIdx];
          if (!door.open) continue;
          const other = door.a === idx ? door.b : door.a;
          if (seen[other]) continue;
          seen[other] = 1;
          route[other] = doorIdx;
          next.push(other);
        }
      }
      frontier = next;
    }
    return route;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Chunky tiled walls with a lit top bevel, in the spirit of the reference art.
    const T = 24;
    for (const w of this.walls) {
      ctx.fillStyle = '#242832';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(w.x, w.y, w.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(w.x, w.y + w.h - 3, w.w, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let tx = w.x + T; tx < w.x + w.w; tx += T) {
        ctx.beginPath();
        ctx.moveTo(tx, w.y);
        ctx.lineTo(tx, w.y + w.h);
        ctx.stroke();
      }
      for (let ty = w.y + T; ty < w.y + w.h; ty += T) {
        ctx.beginPath();
        ctx.moveTo(w.x, ty);
        ctx.lineTo(w.x + w.w, ty);
        ctx.stroke();
      }
    }

    for (const d of this.doors) {
      const horizontal = d.side === 0 || d.side === 2;
      if (!d.open) {
        ctx.fillStyle = '#63451d';
        ctx.fillRect(d.bx, d.by, d.bw, d.bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        if (horizontal) {
          for (let ty = d.by + 12; ty < d.by + d.bh; ty += 12) {
            ctx.beginPath();
            ctx.moveTo(d.bx, ty);
            ctx.lineTo(d.bx + d.bw, ty);
            ctx.stroke();
          }
        } else {
          for (let tx = d.bx + 12; tx < d.bx + d.bw; tx += 12) {
            ctx.beginPath();
            ctx.moveTo(tx, d.by);
            ctx.lineTo(tx, d.by + d.bh);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = '#ffb84d';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.bx, d.by, d.bw, d.bh);
        ctx.fillStyle = '#ffd23d';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[F] OPEN — ${d.cost}`, d.cx, d.by - 12);
      } else {
        ctx.strokeStyle = 'rgba(120,220,180,0.25)';
        ctx.lineWidth = 3;
        ctx.strokeRect(d.bx, d.by, d.bw, d.bh);
      }
    }
  }
}

export function circleRectCollide(cx: number, cy: number, r: number, rect: Wall): { x: number; y: number } | null {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq < r * r) {
    const dist = Math.sqrt(distSq) || 0.001;
    const overlap = r - dist;
    return { x: (dx / dist) * overlap, y: (dy / dist) * overlap };
  }
  return null;
}

function overlapsAny(x: number, y: number, r: number, walls: Wall[]): boolean {
  for (const w of walls) {
    if (circleRectCollide(x, y, r, w)) return true;
  }
  return false;
}

/**
 * Moves from a point toward a target in small steps, stopping at the last
 * position that isn't inside geometry. Teleports and very fast dashes must use
 * this - resolving collisions only at the destination lets you land cleanly on
 * the far side of a wall.
 */
export function sweepTo(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  r: number,
  walls: Wall[],
): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return { x: fromX, y: fromY };
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
  let lastX = fromX;
  let lastY = fromY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = fromX + dx * t;
    const ny = fromY + dy * t;
    if (overlapsAny(nx, ny, r, walls)) break;
    lastX = nx;
    lastY = ny;
  }
  return { x: lastX, y: lastY };
}

export function resolveWallCollisions(x: number, y: number, r: number, walls: Wall[]): { x: number; y: number } {
  let px = x;
  let py = y;
  for (const w of walls) {
    const push = circleRectCollide(px, py, r, w);
    if (push) {
      px += push.x;
      py += push.y;
    }
  }
  return { x: px, y: py };
}
