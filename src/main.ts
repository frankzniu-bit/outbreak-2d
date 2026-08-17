import './style.css';
import { Game } from './game/Game';
import { VIEW_W, VIEW_H } from './game/constants';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="game-root">
    <canvas id="game-canvas"></canvas>
    <div id="coop-panel">
      <div class="coop-card">
        <h2>CO-OP LINK</h2>
        <p>
          No server involved — you and your friend swap two codes by hand (chat, DM, whatever).
          <strong>Host:</strong> press Create Invite, send the code, then paste their reply below and press Accept Reply.
          <strong>Joining:</strong> paste their invite in the lower box and press Answer Invite, then send the generated reply back.
        </p>

        <textarea id="coop-out" readonly placeholder="your code will appear here"></textarea>
        <button class="coop-btn" id="coop-create">1. CREATE INVITE</button>

        <textarea id="coop-in" placeholder="paste the code you were sent here"></textarea>
        <button class="coop-btn" id="coop-accept">2. ACCEPT REPLY</button>

        <div class="coop-divider"></div>
        <p>Joining instead? Paste the invite in the lower box and press Answer Invite, then send the generated reply back to the host.</p>
        <button class="coop-btn" id="coop-answer">ANSWER INVITE</button>

        <div class="coop-status" id="coop-status"></div>
        <div class="coop-divider"></div>
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
