import './style.css';
import { Game } from './game/Game';
import { VIEW_W, VIEW_H } from './game/constants';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** Co-op lobby markup, omitted entirely from the portal build. */
const COOP_PANEL_HTML = `
    <div id="coop-panel">
      <div class="coop-card">
        <div class="coop-banner">
          <span class="coop-gem">◆</span>
          <h2>CO-OP LINK</h2>
          <span class="coop-gem">◆</span>
        </div>
        <p class="coop-sub">Two survivors, one facility. One room code — that's it.</p>

        <div class="coop-lane">
          <div class="coop-lane-head"><span class="coop-badge">HOST</span> start the run</div>
          <button class="coop-btn primary" id="coop-host">CREATE ROOM</button>
          <div class="coop-room" id="coop-room" hidden>
            <span class="coop-room-label">ROOM CODE</span>
            <span class="coop-room-code" id="coop-room-code">-----</span>
            <button class="coop-btn tiny" id="coop-copy">COPY</button>
          </div>
        </div>

        <div class="coop-or"><span>OR</span></div>

        <div class="coop-lane">
          <div class="coop-lane-head"><span class="coop-badge join">JOIN</span> drop into their run</div>
          <div class="coop-join">
            <input id="coop-code" class="coop-code-input" maxlength="7" placeholder="ROOM CODE" autocomplete="off" spellcheck="false" />
            <button class="coop-btn primary" id="coop-join">JOIN</button>
          </div>
        </div>

        <div class="coop-status" id="coop-status"></div>

        <details class="coop-manual" id="coop-manual">
          <summary>Relay blocked? Use the manual code exchange</summary>
          <p class="coop-manual-note">Only needed when the matchmaking relay can't be reached. Host presses 1, sends the code; joiner pastes it, presses 2 and sends the reply back; host pastes that and presses 3.</p>
          <button class="coop-btn secondary" id="coop-create"><span class="coop-step">1</span> CREATE INVITE</button>
          <textarea id="coop-out" readonly placeholder="your code appears here — send it to your partner"></textarea>
          <textarea id="coop-in" placeholder="paste the code you were sent here"></textarea>
          <button class="coop-btn secondary" id="coop-answer"><span class="coop-step">2</span> ANSWER INVITE</button>
          <button class="coop-btn secondary" id="coop-accept"><span class="coop-step">3</span> ACCEPT REPLY</button>
        </details>

        <button class="coop-btn secondary" id="coop-close">CLOSE</button>
      </div>
    </div>
`;

app.innerHTML = `
  <div id="game-root">
    <canvas id="game-canvas"></canvas>
    ${__PORTAL_BUILD__ ? '' : COOP_PANEL_HTML}
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;

const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0;

/** Scale the canvas element to fill the viewport while preserving aspect ratio.
 *  Explicit pixel sizing (rather than object-fit) keeps getBoundingClientRect
 *  accurate so pointer-to-world coordinate mapping stays correct.
 *
 *  On phones the visual viewport is the honest one: window.innerHeight ignores
 *  the collapsing browser chrome, which would size the canvas past the bottom
 *  of the screen and put the touch buttons out of reach. */
function fitCanvas() {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;

  // The game is 16:9 and needs the long edge: in portrait a phone would render
  // it as a letterboxed strip too small to aim in, so ask for a turn instead.
  document.body.classList.toggle('portrait-blocked', isTouch && vh > vw);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));
window.visualViewport?.addEventListener('resize', fitCanvas);

// Stop the page itself from panning, zooming or bouncing under the game.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const game = new Game(canvas);
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
