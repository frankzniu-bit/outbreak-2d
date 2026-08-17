interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
}

export class Particles {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];

  burst(x: number, y: number, color: string, count = 10, speed = 180) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  floatText(x: number, y: number, text: string, color = '#fff') {
    this.texts.push({ x, y, vy: -50, life: 0.7, maxLife: 0.7, text, color });
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 4 * dt;
      p.vy *= 1 - 4 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) {
      t.y += t.vy * dt;
      t.vy *= 1 - 2 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    for (const t of this.texts) {
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

/** Points that visibly fly from a kill location into the player, then get "sucked in". */
export class PointFlyers {
  private flyers: { x: number; y: number; amount: number; t: number }[] = [];
  private onCollect: (amount: number) => void;

  constructor(onCollect: (amount: number) => void) {
    this.onCollect = onCollect;
  }

  spawn(x: number, y: number, amount: number) {
    this.flyers.push({ x, y, amount, t: 0 });
  }

  update(dt: number, targetX: number, targetY: number) {
    for (const f of this.flyers) {
      f.t += dt;
      const dx = targetX - f.x;
      const dy = targetY - f.y;
      const dist = Math.hypot(dx, dy) || 1;
      const pullSpeed = 260 + f.t * 500;
      const step = Math.min(dist, pullSpeed * dt);
      f.x += (dx / dist) * step;
      f.y += (dy / dist) * step;
      if (dist < 12) {
        this.onCollect(f.amount);
        f.amount = -1;
      }
    }
    this.flyers = this.flyers.filter((f) => f.amount >= 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#ffd23d';
    ctx.strokeStyle = '#7a5a00';
    for (const f of this.flyers) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
