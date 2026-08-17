import type { Bounds } from './Level';

export class Camera {
  x = 0;
  y = 0;
  private shakeTime = 0;
  private shakeMag = 0;
  offsetX = 0;
  offsetY = 0;

  /** The facility grows in every direction, so the camera clamps to its bounds. */
  follow(targetX: number, targetY: number, viewW: number, viewH: number, bounds: Bounds) {
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    this.x = spanX <= viewW
      ? bounds.minX + spanX / 2 - viewW / 2
      : clamp(targetX - viewW / 2, bounds.minX, bounds.maxX - viewW);
    this.y = spanY <= viewH
      ? bounds.minY + spanY / 2 - viewH / 2
      : clamp(targetY - viewH / 2, bounds.minY, bounds.maxY - viewH);
  }

  shake(magnitude: number, duration: number) {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  update(dt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const falloff = Math.max(0, this.shakeTime);
      this.offsetX = (Math.random() * 2 - 1) * this.shakeMag * falloff;
      this.offsetY = (Math.random() * 2 - 1) * this.shakeMag * falloff;
      if (this.shakeTime <= 0) {
        this.shakeMag = 0;
        this.offsetX = 0;
        this.offsetY = 0;
      }
    }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
