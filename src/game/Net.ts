/**
 * Manual-signalling WebRTC link: the two players copy/paste two codes to each
 * other instead of running a signalling server, so co-op works from a purely
 * static deploy. A public STUN server is used for NAT traversal; on the same
 * machine/LAN the host candidates alone are enough.
 */

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function encodeCode(desc: RTCSessionDescriptionInit): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ t: desc.type, s: desc.sdp }))));
}

function decodeCode(code: string): RTCSessionDescriptionInit {
  const raw = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  return { type: raw.t, sdp: raw.s };
}

/** Resolves once ICE candidate gathering finishes (or after a timeout, using whatever we have). */
function waitForIce(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export type NetRole = 'none' | 'host' | 'guest';

export class NetLink {
  role: NetRole = 'none';
  connected = false;

  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  onMessage: ((msg: unknown) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  private attachChannel(ch: RTCDataChannel) {
    this.channel = ch;
    ch.onopen = () => {
      this.connected = true;
      this.onOpen?.();
    };
    ch.onclose = () => {
      this.connected = false;
      this.onClose?.();
    };
    ch.onmessage = (e) => {
      try {
        this.onMessage?.(JSON.parse(e.data));
      } catch {
        // ignore malformed frames rather than tearing the link down
      }
    };
  }

  /** Host step 1: produce the invite code to send to the other player. */
  async createInvite(): Promise<string> {
    this.close();
    this.role = 'host';
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    const ch = pc.createDataChannel('outbreak', { ordered: false, maxRetransmits: 0 });
    this.attachChannel(ch);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    return encodeCode(pc.localDescription!);
  }

  /** Host step 2: consume the reply code the joiner sent back. */
  async acceptReply(code: string): Promise<void> {
    if (!this.pc) throw new Error('Create an invite first.');
    await this.pc.setRemoteDescription(decodeCode(code));
  }

  /** Guest: consume an invite code and produce the reply code to send back. */
  async answerInvite(code: string): Promise<string> {
    this.close();
    this.role = 'guest';
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    pc.ondatachannel = (e) => this.attachChannel(e.channel);
    await pc.setRemoteDescription(decodeCode(code));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    return encodeCode(pc.localDescription!);
  }

  send(msg: unknown) {
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify(msg));
    }
  }

  close() {
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.connected = false;
    this.role = 'none';
  }
}
