import './style.css';
import { Game } from './game/Game';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="game-root">
    <canvas id="game-canvas"></canvas>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const game = new Game(canvas);
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
