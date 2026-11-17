import type { Page } from '@playwright/test';

/**
 * Replaces the xAI realtime socket with an in-page fake and stubs /api/voice/session, so a call can
 * connect, receive tool calls and drop without any network or API key.
 */
export async function installFakeVoice(page: Page, options: { mic?: 'ok' | 'denied' | 'missing' } = {}) {
  const mic = options.mic ?? 'ok';
  await page.route('**/api/voice/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: 'fake-secret', expires_at: null }) }),
  );
  await page.addInitScript((micMode: string) => {
    const devices = {
      getUserMedia: async () => {
        if (micMode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
        if (micMode === 'missing') throw new DOMException('Requested device not found', 'NotFoundError');
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        return dest.stream;
      },
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: devices, configurable: true });

    type Listener = (event: { data?: unknown }) => void;
    const sockets: FakeSocket[] = [];
    const sent: unknown[] = [];
    const RealWebSocket = window.WebSocket;

    class FakeSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 0;
      url: string;
      private listeners: Record<string, Listener[]> = {};
      constructor(url: string) {
        this.url = url;
        sockets.push(this);
        setTimeout(() => {
          this.readyState = 1;
          this.fire('open', {});
        }, 20);
      }
      addEventListener(type: string, fn: Listener) {
        (this.listeners[type] ??= []).push(fn);
      }
      removeEventListener(type: string, fn: Listener) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== fn);
      }
      send(data: string) {
        const message = JSON.parse(data);
        sent.push(message);
        if (message.type === 'session.update') setTimeout(() => this.emit({ type: 'session.updated' }), 20);
      }
      close() {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.fire('close', {});
      }
      emit(event: unknown) {
        this.fire('message', { data: JSON.stringify(event) });
      }
      fire(type: string, event: { data?: unknown }) {
        for (const fn of this.listeners[type] ?? []) fn(event);
      }
    }

    const Patched = function (this: unknown, url: string | URL, protocols?: string | string[]) {
      const href = String(url);
      if (href.startsWith('wss://api.x.ai/')) return new FakeSocket(href);
      return new RealWebSocket(url, protocols);
    } as unknown as typeof WebSocket;
    Object.assign(Patched, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    window.WebSocket = Patched;

    let callId = 0;
    (window as unknown as { __voice: unknown }).__voice = {
      sent,
      count: () => sockets.length,
      setField(name: string, value: string) {
        const socket = sockets[sockets.length - 1];
        callId += 1;
        socket.emit({
          type: 'response.function_call_arguments.done',
          call_id: `call-${callId}`,
          name: 'set_field',
          arguments: JSON.stringify({ name, value }),
        });
        socket.emit({ type: 'response.done' });
      },
      say(text: string) {
        sockets[sockets.length - 1].emit({ type: 'response.output_audio_transcript.done', response_id: `r${Date.now()}`, transcript: text });
      },
      drop() {
        const socket = sockets[sockets.length - 1];
        socket.readyState = 3;
        socket.fire('close', {});
      },
    };
  }, mic);
}

export async function voiceSetField(page: Page, name: string, value: string) {
  await page.evaluate(([key, text]) => (window as unknown as { __voice: { setField: (n: string, v: string) => void } }).__voice.setField(key, text), [
    name,
    value,
  ]);
}

export async function voiceDrop(page: Page) {
  await page.evaluate(() => (window as unknown as { __voice: { drop: () => void } }).__voice.drop());
}
