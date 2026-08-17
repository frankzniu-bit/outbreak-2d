import './style.css';
import { Game } from './game/Game';
import { VIEW_W, VIEW_H } from './game/constants';
import { inject } from '@vercel/analytics';

inject();

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-root">
    <canvas id="game-canvas"></canvas>
    <div id="coop-panel">
      <div class="coop-card">
        <div class="coop-banner">
          <span class="coop-gem">◆</span>
          <h2>CO-OP LINK</h2>
          <span class="coop-gem">◆</span>
        </div>
        <p class="coop-sub">Two survivors, one facility. No server — just swap two codes.</p>

        <div class="coop-lane">
          <div class="coop-lane-head"><span class="coop-badge">HOST</span> start the run</div>
          <button class="coop-btn primary" id="coop-create"><span class="coop-step">1</span> CREATE INVITE</button>
          <textarea id="coop-out" readonly placeholder="your code appears here — send it to your partner"></textarea>
          <button class="coop-btn primary" id="coop-accept"><span class="coop-step">3</span> ACCEPT REPLY</button>
        </div>

        <div class="coop-or"><span>OR</span></div>

        <div class="coop-lane">
          <div class="coop-lane-head"><span class="coop-badge join">JOIN</span> drop into their run</div>
          <textarea id="coop-in" placeholder="paste the code you were sent here"></textarea>
          <button class="coop-btn primary" id="coop-answer"><span class="coop-step">2</span> ANSWER INVITE</button>
        </div>

        <div class="coop-status" id="coop-status"></div>
        <button class="coop-btn secondary" id="coop-close">CLOSE</button>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;

/** Scale the canvas element to fill the viewport while preserving aspect ratio.
 *  Explicit pixel sizing (rather than object-fit) keeps getBoundingClientRect
 *  accurate so mouse-to-world coordinate mapping stays correct. */
function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const game = new Game(canvas);
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
