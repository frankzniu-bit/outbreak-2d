import type { RoomContent, StationKind, FieldUpgrade } from './types';
import { WORLD_H, ROOM_W, DOOR_BASE_COST, DOOR_COST_STEP, TILE } from './constants';

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomInfo {
  index: number;
  xStart: number;
  xEnd: number;
  content: RoomContent;
  /** Interior cover, in world coordinates, so rooms aren't bare boxes. */
  obstacles: Wall[];
}

export interface DoorInfo {
  x: number;
  gapTop: number;
  gapBottom: number;
  cost: number;
  open: boolean;
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

const WALL_THICK = 24;
const DOOR_GAP = 150;

const FIELD_UPGRADES: FieldUpgrade[] = ['vitality', 'power', 'haste', 'reload'];

/**
 * Room architecture, authored on a 18x20 grid of 50px tiles ('#' = wall).
 * Rows 7-12 are deliberately left open in every template: that band contains
 * both the door corridors at the room edges and the station at the centre, so
 * a layout can never seal the player out of a room or wall in a station.
 */
const ROOM_TEMPLATES: string[][] = [
  // quad chambers
  [
    '..................',
    '..#####....#####..',
    '..#...#....#...#..',
    '..#...#....#...#..',
    '..#.###....###.#..',
    '..#............#..',
    '..#####....#####..',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..#####....#####..',
    '..#...#....#...#..',
    '..#.###....###.#..',
    '..#...#....#...#..',
    '..#####....#####..',
    '..................',
    '..................',
  ],
  // nested vault
  [
    '..................',
    '....##########....',
    '....#........#....',
    '....#..####..#....',
    '....#..#..#..#....',
    '....#..#..#..#....',
    '....#..####..#....',
    '....#........#....',
    '..................',
    '..................',
    '..................',
    '..................',
    '....#........#....',
    '....#..####..#....',
    '....#..#..#..#....',
    '....#..#..#..#....',
    '....#..####..#....',
    '....##########....',
    '..................',
    '..................',
  ],
  // pillar hall
  [
    '..................',
    '...##...##...##...',
    '...##...##...##...',
    '..................',
    '...##...##...##...',
    '...##...##...##...',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '...##...##...##...',
    '...##...##...##...',
    '..................',
    '...##...##...##...',
    '...##...##...##...',
    '..................',
    '..................',
  ],
  // staggered barricades
  [
    '..................',
    '..#########.......',
    '..........#.......',
    '.......#########..',
    '.......#..........',
    '..#########.......',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '.......#########..',
    '.......#..........',
    '..#########.......',
    '..........#.......',
    '.......#########..',
    '..................',
    '..................',
  ],
  // alcoves
  [
    '..................',
    '..####......####..',
    '..#..#......#..#..',
    '..#..########..#..',
    '..#............#..',
    '..####......####..',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..####......####..',
    '..#............#..',
    '..#..########..#..',
    '..#..#......#..#..',
    '..####......####..',
    '..................',
    '..................',
  ],
  // sparse - a breather between dense rooms
  [
    '..................',
    '..................',
    '..................',
    '.....##......##...',
    '.....##......##...',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '...##......##.....',
    '...##......##.....',
    '..................',
    '..................',
    '..................',
  ],
];

/** Turns a tile template into as few rects as possible by merging runs. */
function templateToWalls(template: string[], xStart: number, mirrored: boolean): Wall[] {
  const out: Wall[] = [];
  const cols = template[0].length;
  for (let row = 0; row < template.length; row++) {
    const line = template[row];
    let runStart = -1;
    for (let col = 0; col <= cols; col++) {
      const solid = col < cols && line[mirrored ? cols - 1 - col : col] === '#';
      if (solid && runStart < 0) runStart = col;
      if (!solid && runStart >= 0) {
        out.push({
          x: xStart + runStart * TILE,
          y: row * TILE,
          w: (col - runStart) * TILE,
          h: TILE,
        });
        runStart = -1;
      }
    }
  }
  return out;
}

/**
 * An endless, procedurally-extending facility: rooms are generated on demand as the
 * player buys through the frontier door, like segments in an endless runner. The first
 * room always holds the mystery box (core loop guarantee); everything past that is randomized.
 */
export class Level {
  rooms: RoomInfo[] = [];
  doors: DoorInfo[] = [];
  stations: Station[] = [];
  walls: Wall[] = [];

  constructor() {
    this.rooms.push({ index: 0, xStart: 0, xEnd: ROOM_W, content: 'start', obstacles: [] });
    this.generateNextRoom();
  }

  private lastTemplate = -1;

  private rollObstacles(xStart: number): Wall[] {
    // never repeat the previous room's layout back-to-back
    let idx = Math.floor(Math.random() * ROOM_TEMPLATES.length);
    if (idx === this.lastTemplate) idx = (idx + 1 + Math.floor(Math.random() * (ROOM_TEMPLATES.length - 1))) % ROOM_TEMPLATES.length;
    this.lastTemplate = idx;
    return templateToWalls(ROOM_TEMPLATES[idx], xStart, Math.random() < 0.5);
  }

  totalWidth(): number {
    return this.rooms.length * ROOM_W;
  }

  depth(): number {
    return this.rooms.length - 1;
  }

  private generateNextRoom() {
    const index = this.rooms.length;
    let content: RoomContent;
    if (index === 1) {
      content = 'mysterybox';
    } else {
      const roll = Math.random();
      content =
        roll < 0.2 ? 'workbench'
        : roll < 0.38 ? 'upgrade'
        : roll < 0.55 ? 'ammo'
        : roll < 0.72 ? 'treasure'
        : 'empty';
    }

    const xStart = index * ROOM_W;
    const room: RoomInfo = { index, xStart, xEnd: xStart + ROOM_W, content, obstacles: this.rollObstacles(xStart) };
    this.rooms.push(room);

    if (content !== 'empty') {
      this.stations.push({
        kind: content,
        x: room.xStart + ROOM_W / 2,
        y: WORLD_H / 2,
        roomIndex: index,
        collected: false,
        perk: content === 'upgrade' ? FIELD_UPGRADES[Math.floor(Math.random() * FIELD_UPGRADES.length)] : undefined,
      });
    }

    const gapTop = WORLD_H / 2 - DOOR_GAP / 2;
    const gapBottom = WORLD_H / 2 + DOOR_GAP / 2;
    this.doors.push({
      x: index * ROOM_W,
      gapTop,
      gapBottom,
      cost: DOOR_BASE_COST + (index - 1) * DOOR_COST_STEP,
      open: false,
    });

    this.rebuildWalls();
  }

  private rebuildWalls() {
    const totalW = this.totalWidth();
    this.walls = [
      { x: 0, y: 0, w: totalW, h: WALL_THICK },
      { x: 0, y: WORLD_H - WALL_THICK, w: totalW, h: WALL_THICK },
      { x: 0, y: 0, w: WALL_THICK, h: WORLD_H },
      { x: totalW - WALL_THICK, y: 0, w: WALL_THICK, h: WORLD_H },
    ];
    for (const door of this.doors) {
      this.walls.push({ x: door.x, y: 0, w: WALL_THICK, h: door.gapTop });
      this.walls.push({ x: door.x, y: door.gapBottom, w: WALL_THICK, h: WORLD_H - door.gapBottom });
    }
    for (const room of this.rooms) {
      for (const o of room.obstacles) this.walls.push(o);
    }
  }

  /** Co-op guests don't simulate the level - they mirror the host's copy. */
  hydrate(rooms: RoomInfo[], doors: DoorInfo[], stations: Station[]) {
    this.rooms = rooms;
    this.doors = doors;
    this.stations = stations;
    this.rebuildWalls();
  }

  private doorBarriers(): Wall[] {
    return this.doors
      .filter((d) => !d.open)
      .map((d) => ({ x: d.x, y: d.gapTop, w: WALL_THICK, h: d.gapBottom - d.gapTop }));
  }

  allWalls(): Wall[] {
    return [...this.walls, ...this.doorBarriers()];
  }

  roomIndexAt(x: number): number {
    return Math.max(0, Math.min(this.rooms.length - 1, Math.floor(x / ROOM_W)));
  }

  /**
   * Collision only ever needs geometry from the room you're in and its
   * neighbours. Template rooms produce far more rects than the old block
   * layouts, so testing every wall in an endless facility would get expensive.
   */
  wallsNear(x: number): Wall[] {
    const idx = this.roomIndexAt(x);
    const lo = (idx - 1) * ROOM_W;
    const hi = (idx + 2) * ROOM_W;
    const out: Wall[] = [];
    for (const w of this.walls) {
      if (w.x + w.w >= lo && w.x <= hi) out.push(w);
    }
    for (const d of this.doorBarriers()) {
      if (d.x + d.w >= lo && d.x <= hi) out.push(d);
    }
    return out;
  }

  distToDoor(doorIndex: number, x: number, y: number): number {
    const d = this.doors[doorIndex];
    const midY = (d.gapTop + d.gapBottom) / 2;
    return Math.hypot(x - (d.x + WALL_THICK / 2), y - midY);
  }

  nearestClosedDoor(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    this.doors.forEach((d, i) => {
      if (d.open) return;
      const dist = this.distToDoor(i, x, y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  buyDoor(index: number): boolean {
    const d = this.doors[index];
    if (!d || d.open) return false;
    d.open = true;
    if (index === this.doors.length - 1) this.generateNextRoom();
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Chunky tiled walls with a lit top bevel, in the spirit of the reference art.
    const TILE = 24;
    for (const w of this.walls) {
      ctx.fillStyle = '#242832';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(w.x, w.y, w.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(w.x, w.y + w.h - 3, w.w, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let tx = w.x + TILE; tx < w.x + w.w; tx += TILE) {
        ctx.beginPath();
        ctx.moveTo(tx, w.y);
        ctx.lineTo(tx, w.y + w.h);
        ctx.stroke();
      }
      for (let ty = w.y + TILE; ty < w.y + w.h; ty += TILE) {
        ctx.beginPath();
        ctx.moveTo(w.x, ty);
        ctx.lineTo(w.x + w.w, ty);
        ctx.stroke();
      }
    }

    for (const d of this.doors) {
      const h = d.gapBottom - d.gapTop;
      if (!d.open) {
        ctx.fillStyle = '#63451d';
        ctx.fillRect(d.x, d.gapTop, WALL_THICK, h);
        // plank slats
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        for (let ty = d.gapTop + 12; ty < d.gapBottom; ty += 12) {
          ctx.beginPath();
          ctx.moveTo(d.x, ty);
          ctx.lineTo(d.x + WALL_THICK, ty);
          ctx.stroke();
        }
        ctx.strokeStyle = '#ffb84d';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x, d.gapTop, WALL_THICK, h);
        ctx.fillStyle = '#ffd23d';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[F] OPEN — ${d.cost}`, d.x + WALL_THICK / 2, d.gapTop - 10);
      } else {
        ctx.strokeStyle = 'rgba(120,220,180,0.25)';
        ctx.lineWidth = 3;
        ctx.strokeRect(d.x, d.gapTop, WALL_THICK, h);
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
