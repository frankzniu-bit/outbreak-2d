import type { NetLink } from './Net';
import { normalizeRoomCode } from './Signal';

/**
 * Wires the co-op panel (declared in the index markup) to a NetLink.
 *
 * The headline flow is a single room code: the host creates one, the joiner
 * types it, and the descriptions are swapped behind the scenes. The manual
 * copy/paste exchange stays available in the collapsed section for networks
 * where the relay is unreachable.
 */
export class CoopUI {
  private panel: HTMLElement;
  private status: HTMLElement;

  // room-code flow
  private btnHost: HTMLButtonElement;
  private btnJoin: HTMLButtonElement;
  private btnCopy: HTMLButtonElement;
  private codeInput: HTMLInputElement;
  private roomBox: HTMLElement;
  private roomCode: HTMLElement;

  // manual fallback
  private out: HTMLTextAreaElement;
  private input: HTMLTextAreaElement;
  private btnCreate: HTMLButtonElement;
  private btnAccept: HTMLButtonElement;
  private btnAnswer: HTMLButtonElement;
  private manual: HTMLDetailsElement;

  private btnClose: HTMLButtonElement;

  private link: NetLink;
  private onClosed: () => void;
  private busy = false;

  constructor(link: NetLink, onClosed: () => void) {
    this.link = link;
    this.onClosed = onClosed;
    this.panel = document.getElementById('coop-panel')!;
    this.status = document.getElementById('coop-status')!;

    this.btnHost = document.getElementById('coop-host') as HTMLButtonElement;
    this.btnJoin = document.getElementById('coop-join') as HTMLButtonElement;
    this.btnCopy = document.getElementById('coop-copy') as HTMLButtonElement;
    this.codeInput = document.getElementById('coop-code') as HTMLInputElement;
    this.roomBox = document.getElementById('coop-room')!;
    this.roomCode = document.getElementById('coop-room-code')!;

    this.out = document.getElementById('coop-out') as HTMLTextAreaElement;
    this.input = document.getElementById('coop-in') as HTMLTextAreaElement;
    this.btnCreate = document.getElementById('coop-create') as HTMLButtonElement;
    this.btnAccept = document.getElementById('coop-accept') as HTMLButtonElement;
    this.btnAnswer = document.getElementById('coop-answer') as HTMLButtonElement;
    this.manual = document.getElementById('coop-manual') as HTMLDetailsElement;

    this.btnClose = document.getElementById('coop-close') as HTMLButtonElement;

    this.btnHost.onclick = () => this.handleHost();
    this.btnJoin.onclick = () => this.handleJoin();
    this.btnCopy.onclick = () => this.copyCode();
    this.codeInput.oninput = () => {
      this.codeInput.value = normalizeRoomCode(this.codeInput.value);
    };
    this.codeInput.onkeydown = (e) => {
      if (e.key === 'Enter') this.handleJoin();
    };

    this.btnCreate.onclick = () => this.handleCreate();
    this.btnAccept.onclick = () => this.handleAccept();
    this.btnAnswer.onclick = () => this.handleAnswer();
    this.btnClose.onclick = () => this.close();
  }

  private setStatus(text: string) {
    this.status.textContent = text;
  }

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.btnHost.disabled = busy;
    this.btnJoin.disabled = busy;
  }

  // ------------------------------------------------------ room-code flow

  private async handleHost() {
    if (this.busy) return;
    this.setBusy(true);
    this.setStatus('Opening a room…');
    try {
      await this.link.hostRoom((code) => {
        this.roomCode.textContent = code;
        this.roomBox.hidden = false;
        this.setStatus('Room open — give your partner this code. Waiting for them to join…');
      });
      this.setStatus('Partner found — linking up…');
    } catch (err) {
      this.setStatus(`${(err as Error).message}. You can still link up manually below.`);
      this.manual.open = true;
    } finally {
      this.setBusy(false);
    }
  }

  private async handleJoin() {
    if (this.busy) return;
    const code = normalizeRoomCode(this.codeInput.value);
    if (code.length < 4) return this.setStatus('Enter the room code your partner gave you.');
    this.setBusy(true);
    this.setStatus(`Looking for room ${code}…`);
    try {
      await this.link.joinRoom(code);
      this.setStatus('Found it — linking up…');
    } catch (err) {
      this.setStatus(`Could not join ${code}: ${(err as Error).message}.`);
    } finally {
      this.setBusy(false);
    }
  }

  private async copyCode() {
    const code = this.roomCode.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      this.setStatus(`Copied ${code} — send it over. Still waiting for your partner…`);
    } catch {
      this.setStatus(`Copy blocked by the browser — the code is ${code}.`);
    }
  }

  // ------------------------------------------------- manual fallback flow

  private async handleCreate() {
    this.setStatus('Generating invite…');
    this.btnCreate.disabled = true;
    try {
      const code = await this.link.createInvite();
      this.out.value = code;
      this.out.select();
      this.setStatus('Invite ready — send it over, then paste their reply below.');
    } catch (err) {
      this.setStatus(`Could not create invite: ${(err as Error).message}`);
    } finally {
      this.btnCreate.disabled = false;
    }
  }

  private async handleAccept() {
    const code = this.input.value.trim();
    if (!code) return this.setStatus('Paste the reply code you were sent first.');
    this.setStatus('Connecting…');
    try {
      await this.link.acceptReply(code);
      this.setStatus('Reply accepted — waiting for the channel to open…');
    } catch (err) {
      this.setStatus(`That reply did not work: ${(err as Error).message}`);
    }
  }

  private async handleAnswer() {
    const code = this.input.value.trim();
    if (!code) return this.setStatus('Paste the invite code you were sent first.');
    this.setStatus('Generating reply…');
    this.btnAnswer.disabled = true;
    try {
      const reply = await this.link.answerInvite(code);
      this.out.value = reply;
      this.out.select();
      this.setStatus('Reply ready — send this back to the host.');
    } catch (err) {
      this.setStatus(`That invite did not work: ${(err as Error).message}`);
    } finally {
      this.btnAnswer.disabled = false;
    }
  }

  get isOpen(): boolean {
    return this.panel.classList.contains('open');
  }

  open() {
    this.panel.classList.add('open');
    this.setStatus(this.link.connected ? 'Connected.' : '');
  }

  close() {
    this.panel.classList.remove('open');
    this.onClosed();
  }

  notifyConnected() {
    this.setStatus('Connected! Closing…');
    setTimeout(() => this.close(), 600);
  }
}
