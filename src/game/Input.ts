export class Input {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>();
  private lastKeyCode: string | null = null;
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  private mousePressed = false;

  constructor(canvas: HTMLCanvasElement, onFirstInteraction?: () => void) {
    let unlocked = false;
    const fireFirstInteraction = () => {
      if (unlocked) return;
      unlocked = true;
      onFirstInteraction?.();
    };
    window.addEventListener('keydown', (e) => {
      fireFirstInteraction();
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
        this.lastKeyCode = e.code;
      }
      this.keysDown.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    const trackMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    };
    canvas.addEventListener('mousemove', trackMouse);
    canvas.addEventListener('mousedown', (e) => {
      fireFirstInteraction();
      trackMouse(e);
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Drives the canvas-drawn menus from a touch. A tap has no hover, so the
   * pointer is moved and clicked in the same frame.
   */
  injectClick(x: number, y: number) {
    this.mouseX = x;
    this.mouseY = y;
    this.mousePressed = true;
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  wasMousePressed(): boolean {
    return this.mousePressed;
  }

  /** The code of whatever key was freshly pressed this frame, if any - used for rebind capture. */
  justPressedCode(): string | null {
    return this.lastKeyCode;
  }

  /** Call once per fixed update after consuming this frame's presses. */
  endFrame() {
    this.keysPressed.clear();
    this.lastKeyCode = null;
    this.mousePressed = false;
  }
}
