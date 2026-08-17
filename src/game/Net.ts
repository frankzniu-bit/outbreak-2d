/**
 * WebRTC link between the two players.
 *
 * The normal path is a single room code brokered by `SignalRoom`, so nobody has
 * to paste a reply back. The manual two-code exchange is still here as a
 * fallback for networks where the relay is unreachable.
 *
 * A public STUN server is used for NAT traversal; on the same machine/LAN the
 * host candidates alone are enough.
 */

import { SignalRoom, makeRoomCode, normalizeRoomCode } from './Signal';

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
  private room: SignalRoom | null = null;

  onMessage: ((msg: unknown) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  /** Drops the peer connection but leaves any signalling room in place. */
  private resetPeer() {
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.connected = false;
    this.role = 'none';
  }

  private attachChannel(ch: RTCDataChannel) {
    this.channel = ch;
    ch.onopen = () => {
      this.connected = true;
      this.closeRoom();
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
    this.resetPeer();
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
    this.resetPeer();
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

  // ------------------------------------------------------- room-code path

  /**
   * Host side: pick a room code, publish the offer to it and wait for the
   * joiner's answer to come back over the same topic. The caller shows `code`
   * to the player the moment `onCode` fires - the wait can run for minutes.
   */
  async hostRoom(onCode: (code: string) => void, timeoutMs = 180000): Promise<void> {
    this.close();
    const code = makeRoomCode();
    const room = new SignalRoom(code);
    this.room = room;
    await room.open();
    onCode(room.code);

    const offer = await this.createInvite();
    const answered = room.waitFor('answer', timeoutMs);
    await room.publish('offer', offer);
    const answer = await answered;
    await this.acceptReply(answer);
  }

  /** Joiner side: read the offer off the room and publish the answer back. */
  async joinRoom(code: string, timeoutMs = 45000): Promise<void> {
    this.close();
    const room = new SignalRoom(normalizeRoomCode(code));
    this.room = room;
    await room.open();
    const offer = await room.waitFor('offer', timeoutMs);
    const answer = await this.answerInvite(offer);
    await room.publish('answer', answer);
  }

  /** Called once the data channel is live - the relay has done its job. */
  private closeRoom() {
    this.room?.close();
    this.room = null;
  }

  send(msg: unknown) {
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify(msg));
    }
  }

  close() {
    this.closeRoom();
    this.resetPeer();
  }
}
