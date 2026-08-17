import type { RoomContent, StationKind } from './types';
import { WORLD_H, ROOM_W, DOOR_BASE_COST, DOOR_COST_STEP } from './constants';

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
}

const WALL_THICK = 24;
const DOOR_GAP = 150;

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
    this.rooms.push({ index: 0, xStart: 0, xEnd: ROOM_W, content: 'start' });
    this.generateNextRoom();
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
      content = roll < 0.3 ? 'workbench' : roll < 0.55 ? 'treasure' : 'empty';
    }

    const room: RoomInfo = { index, xStart: index * ROOM_W, xEnd: (index + 1) * ROOM_W, content };
    this.rooms.push(room);

    if (content === 'mysterybox' || content === 'workbench' || content === 'treasure') {
      this.stations.push({
        kind: content,
        x: room.xStart + ROOM_W / 2,
        y: WORLD_H / 2,
        roomIndex: index,
        collected: false,
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
