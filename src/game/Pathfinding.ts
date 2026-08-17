import type { Wall } from './Level';
import type { Vec2 } from './types';

/**
 * Navigation grid resolution. Half a wall tile, so a one-tile gap is still two
 * cells wide and enemies can thread it without clipping the corners.
 */
export const NAV_CELL = 25;

/**
 * Clearance baked into the walkability test. Cells this close to geometry are
 * treated as solid, which keeps paths off wall faces instead of grinding along
 * them - the main reason chasers used to hang on corners.
 */
const NAV_PAD = 9;

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * A Dijkstra distance field flooded outward from the players over a window of
 * rooms around them. Enemies read the gradient instead of steering straight at
 * their target, so walls are routed around rather than walked into.
 *
 * One field serves every enemy: the expensive part is the flood, and it is
 * shared, which is why this scales to a full round's worth of chasers.
 */
export class FlowField {
  cols = 0;
  rows = 0;
  originX = 0;
  originY = 0;
  private blocked = new Uint8Array(0);
  private dist = new Float32Array(0);
  private heap: number[] = [];
  private built = false;

  /** True once a flood has produced usable data. */
  get ready(): boolean {
    return this.built;
  }

  build(walls: Wall[], originX: number, originY: number, spanW: number, spanH: number, sources: Vec2[]) {
    this.built = false;
    this.originX = originX;
    this.originY = originY;
    this.cols = Math.max(1, Math.ceil(spanW / NAV_CELL));
    this.rows = Math.max(1, Math.ceil(spanH / NAV_CELL));
    const total = this.cols * this.rows;
    if (this.blocked.length !== total) {
      this.blocked = new Uint8Array(total);
      this.dist = new Float32Array(total);
    }
    this.blocked.fill(0);
    this.dist.fill(Infinity);

    // Rasterise the geometry instead of testing every cell against every wall:
    // walls are few and each one only touches the cells it covers.
    for (const w of walls) {
      const c0 = Math.floor((w.x - NAV_PAD - this.originX) / NAV_CELL);
      const c1 = Math.floor((w.x + w.w + NAV_PAD - this.originX) / NAV_CELL);
      const r0 = Math.floor((w.y - NAV_PAD - this.originY) / NAV_CELL);
      const r1 = Math.floor((w.y + w.h + NAV_PAD - this.originY) / NAV_CELL);
      for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
        const rowBase = r * this.cols;
        for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
          this.blocked[rowBase + c] = 1;
        }
      }
    }

    this.heap.length = 0;
    for (const s of sources) {
      const idx = this.freeCellNear(s.x, s.y);
      if (idx < 0) continue;
      if (this.dist[idx] === 0) continue;
      this.dist[idx] = 0;
      this.push(idx);
    }
    if (this.heap.length === 0) return;

    while (this.heap.length > 0) {
      const cur = this.pop();
      const cd = this.dist[cur];
      const cx = cur % this.cols;
      const cy = (cur - cx) / this.cols;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const ni = ny * this.cols + nx;
        if (this.blocked[ni]) continue;
        // No cutting diagonally past a corner - the body would clip the wall.
        if (dx !== 0 && dy !== 0) {
          if (this.blocked[cy * this.cols + nx] || this.blocked[ny * this.cols + cx]) continue;
        }
        const nd = cd + cost;
        if (nd < this.dist[ni]) {
          this.dist[ni] = nd;
          this.push(ni);
        }
      }
    }
    this.built = true;
  }

  private cellAt(x: number, y: number): number {
    const c = Math.floor((x - this.originX) / NAV_CELL);
    const r = Math.floor((y - this.originY) / NAV_CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private centerX(idx: number): number {
    return this.originX + (idx % this.cols) * NAV_CELL + NAV_CELL / 2;
  }

  private centerY(idx: number): number {
    return this.originY + Math.floor(idx / this.cols) * NAV_CELL + NAV_CELL / 2;
  }

  /**
   * Nearest walkable cell to a world point, searching outward in rings. Players
   * and enemies routinely stand inside the clearance margin, so snapping to a
   * usable cell keeps the field from silently having no source.
   */
  private freeCellNear(x: number, y: number): number {
    const c0 = Math.floor((x - this.originX) / NAV_CELL);
    const r0 = Math.floor((y - this.originY) / NAV_CELL);
    for (let ring = 0; ring <= 3; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (ring > 0 && Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const i = r * this.cols + c;
          if (!this.blocked[i]) return i;
        }
      }
    }
    return -1;
  }

  /**
   * Steering direction at a world point: aim at the centre of the downhill
   * neighbour, and skip ahead one more cell when that is in plain sight. Aiming
   * at cell centres is what pulls bodies through the middle of a doorway.
   */
  directionAt(x: number, y: number): Vec2 | null {
    if (!this.built) return null;
    const here = this.cellAt(x, y);
    if (here < 0) return null;

    const best = this.bestNeighbour(here);
    if (best < 0) return null;

    let goalX = this.centerX(best);
    let goalY = this.centerY(best);
    const next = this.bestNeighbour(best);
    if (next >= 0 && this.lineIsClear(x, y, this.centerX(next), this.centerY(next))) {
      goalX = this.centerX(next);
      goalY = this.centerY(next);
    }

    const dx = goalX - x;
    const dy = goalY - y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return null;
    return { x: dx / d, y: dy / d };
  }

  private bestNeighbour(idx: number): number {
    const cx = idx % this.cols;
    const cy = (idx - cx) / this.cols;
    let best = -1;
    let bestDist = this.blocked[idx] ? Infinity : this.dist[idx];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const ni = ny * this.cols + nx;
      if (this.blocked[ni]) continue;
      if (dx !== 0 && dy !== 0) {
        if (this.blocked[cy * this.cols + nx] || this.blocked[ny * this.cols + cx]) continue;
      }
      if (this.dist[ni] < bestDist) {
        bestDist = this.dist[ni];
        best = ni;
      }
    }
    return best;
  }

  /** Grid-walk line of sight - cheap enough to run per enemy per frame. */
  lineIsClear(x0: number, y0: number, x1: number, y1: number): boolean {
    if (!this.built) return false;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.hypot(dx, dy) / (NAV_CELL * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const idx = this.cellAt(x0 + dx * t, y0 + dy * t);
      if (idx < 0) return false;
      if (this.blocked[idx]) return false;
    }
    return true;
  }

  // --- binary heap keyed on `dist` -------------------------------------

  private push(idx: number) {
    const h = this.heap;
    h.push(idx);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.dist[h[parent]] <= this.dist[h[i]]) break;
      const tmp = h[parent];
      h[parent] = h[i];
      h[i] = tmp;
      i = parent;
    }
  }

  private pop(): number {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let small = i;
        if (l < h.length && this.dist[h[l]] < this.dist[h[small]]) small = l;
        if (r < h.length && this.dist[h[r]] < this.dist[h[small]]) small = r;
        if (small === i) break;
        const tmp = h[small];
        h[small] = h[i];
        h[i] = tmp;
        i = small;
      }
    }
    return top;
  }
}
