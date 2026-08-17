import type { NetLink } from './Net';

/** Wires the copy/paste co-op signalling panel (declared in index markup) to a NetLink. */
export class CoopUI {
  private panel: HTMLElement;
  private out: HTMLTextAreaElement;
  private input: HTMLTextAreaElement;
  private status: HTMLElement;
  private btnCreate: HTMLButtonElement;
  private btnAccept: HTMLButtonElement;
  private btnAnswer: HTMLButtonElement;
  private btnClose: HTMLButtonElement;

  private link: NetLink;
  private onClosed: () => void;

  constructor(link: NetLink, onClosed: () => void) {
    this.link = link;
    this.onClosed = onClosed;
    this.panel = document.getElementById('coop-panel')!;
    this.out = document.getElementById('coop-out') as HTMLTextAreaElement;
    this.input = document.getElementById('coop-in') as HTMLTextAreaElement;
    this.status = document.getElementById('coop-status')!;
    this.btnCreate = document.getElementById('coop-create') as HTMLButtonElement;
    this.btnAccept = document.getElementById('coop-accept') as HTMLButtonElement;
    this.btnAnswer = document.getElementById('coop-answer') as HTMLButtonElement;
    this.btnClose = document.getElementById('coop-close') as HTMLButtonElement;

    this.btnCreate.onclick = () => this.handleCreate();
    this.btnAccept.onclick = () => this.handleAccept();
    this.btnAnswer.onclick = () => this.handleAnswer();
    this.btnClose.onclick = () => this.close();
  }

  private setStatus(text: string) {
    this.status.textContent = text;
  }

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
