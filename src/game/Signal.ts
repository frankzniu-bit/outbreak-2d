/**
 * Room-code rendezvous.
 *
 * WebRTC needs both sides to exchange a description, which is why co-op used to
 * demand that players copy an invite code *and* paste a reply code back. That
 * second code is the part everybody hated, so the exchange now runs over a free
 * public pub/sub broker (ntfy.sh): the host announces a short room code, both
 * descriptions travel over that topic automatically, and the joiner only ever
 * types the one code.
 *
 * No account, no key and no server of our own - the game still deploys as a
 * static bundle. The manual copy/paste path is kept as a fallback for networks
 * where the broker is unreachable.
 */

/**
 * Any ntfy-compatible broker works here. Point `VITE_SIGNAL_BROKER` at a
 * self-hosted ntfy instance to keep signalling off the public service.
 */
export const BROKER = (import.meta.env.VITE_SIGNAL_BROKER as string | undefined)?.replace(/\/$/, '') || 'https://ntfy.sh';
/** How far back a late subscriber reads, so the joiner can arrive after the host. */
const LOOKBACK = '15m';
/** ntfy caps a message at 4KB; stay well under it and reassemble on the far side. */
const CHUNK_SIZE = 1200;

// No 0/O/1/I: these get read aloud and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(length = 5): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function topicFor(code: string): string {
  return `outbreak2d-rtc-${normalizeRoomCode(code).toLowerCase()}`;
}

interface Envelope {
  /** 'offer' from the host, 'answer' from the joiner. */
  k: 'offer' | 'answer';
  /** Groups the chunks of one payload together. */
  id: string;
  i: number;
  n: number;
  p: string;
}

/**
 * A live subscription to one room. Chunks are reassembled here so callers only
 * ever see whole payloads.
 */
export class SignalRoom {
  readonly code: string;
  private source: EventSource | null = null;
  private buffers = new Map<string, { parts: string[]; have: number; n: number; kind: Envelope['k'] }>();
  private handlers: ((kind: Envelope['k'], payload: string) => void)[] = [];
  /** Payload ids this peer published, so it ignores the echo of its own messages. */
  private mine = new Set<string>();

  constructor(code: string) {
    this.code = normalizeRoomCode(code);
  }

  onPayload(fn: (kind: Envelope['k'], payload: string) => void) {
    this.handlers.push(fn);
  }

  /** Opens the stream. Resolves once the broker accepts the subscription. */
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${BROKER}/${topicFor(this.code)}/sse?since=${LOOKBACK}`;
      const es = new EventSource(url);
      this.source = es;
      let settled = false;

      const fail = () => {
        if (settled) return;
        settled = true;
        es.close();
        reject(new Error('could not reach the matchmaking relay'));
      };

      es.onopen = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      es.onerror = fail;
      es.onmessage = (ev) => this.ingest(ev.data);

      // EventSource never times out on its own; do not leave the UI hanging.
      setTimeout(fail, 8000);
    });
  }

  private ingest(raw: string) {
    let frame: { event?: string; message?: string };
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.event !== 'message' || !frame.message) return;

    let env: Envelope;
    try {
      env = JSON.parse(frame.message);
    } catch {
      return;
    }
    if (!env || (env.k !== 'offer' && env.k !== 'answer') || typeof env.p !== 'string') return;
    if (this.mine.has(env.id)) return;

    let buf = this.buffers.get(env.id);
    if (!buf) {
      buf = { parts: new Array(env.n).fill(''), have: 0, n: env.n, kind: env.k };
      this.buffers.set(env.id, buf);
    }
    // ntfy replays history, so the same chunk can legitimately arrive twice
    if (buf.parts[env.i]) return;
    buf.parts[env.i] = env.p;
    buf.have++;
    if (buf.have < buf.n) return;

    this.buffers.delete(env.id);
    const payload = buf.parts.join('');
    for (const fn of this.handlers) fn(buf.kind, payload);
  }

  async publish(kind: Envelope['k'], payload: string): Promise<void> {
    const id = makeRoomCode(8);
    this.mine.add(id);
    const chunks: string[] = [];
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) chunks.push(payload.slice(i, i + CHUNK_SIZE));
    const url = `${BROKER}/${topicFor(this.code)}`;
    for (let i = 0; i < chunks.length; i++) {
      const env: Envelope = { k: kind, id, i, n: chunks.length, p: chunks[i] };
      const res = await fetch(url, {
        method: 'POST',
        // A plain body keeps this a simple CORS request - no preflight.
        body: JSON.stringify(env),
      });
      if (!res.ok) throw new Error(`relay rejected the message (${res.status})`);
    }
  }

  /** Resolves with the first payload of the given kind, or rejects on timeout. */
  waitFor(kind: Envelope['k'], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('nobody answered in time')), timeoutMs);
      this.onPayload((k, payload) => {
        if (k !== kind) return;
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  close() {
    this.source?.close();
    this.source = null;
    this.handlers = [];
    this.buffers.clear();
  }
}
