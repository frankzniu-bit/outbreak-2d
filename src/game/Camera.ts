export class Camera {
  x = 0;
  y = 0;
  private shakeTime = 0;
  private shakeMag = 0;
  offsetX = 0;
  offsetY = 0;

  /**
   * The player is always dead centre and the facility moves around them. Clamping
   * to the level's bounds used to slide the player off-centre whenever they were
   * near an edge of the generated map, which made the framing depend on which way
   * the layout happened to grow.
   */
  follow(targetX: number, targetY: number, viewW: number, viewH: number) {
    this.x = targetX - viewW / 2;
    this.y = targetY - viewH / 2;
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
