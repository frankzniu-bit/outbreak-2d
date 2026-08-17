export class Camera {
  x = 0;
  y = 0;
  private shakeTime = 0;
  private shakeMag = 0;
  offsetX = 0;
  offsetY = 0;

  follow(targetX: number, targetY: number, viewW: number, viewH: number, worldW: number, worldH: number) {
    this.x = clamp(targetX - viewW / 2, 0, Math.max(0, worldW - viewW));
    this.y = clamp(targetY - viewH / 2, 0, Math.max(0, worldH - viewH));
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
