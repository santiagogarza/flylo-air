import { defaultVoiceInstructions, GREETING, KEYTERMS } from './voice-instructions';

export const MIC_DENIED_MESSAGE = 'The microphone is blocked. Allow it in the browser, or use the form.';
export const MIC_UNAVAILABLE_MESSAGE = 'The microphone could not be opened. Use the form.';
export const CALL_DROPPED_MESSAGE = 'The call was interrupted. Use the form.';

const MODEL = 'grok-voice-latest';
const SAMPLE_RATE = 24000;

export { GREETING, KEYTERMS };

export type CallState = 'idle' | 'connecting' | 'live' | 'ended' | 'denied' | 'error';

export type VoiceField = {
  name: string;
  label: string;
  required: boolean;
  get: () => string;
  set: (value: string) => boolean;
  /** Spoken to the agent when set() rejects a value. Omit to keep the default sentence. */
  rejectHint?: string;
};

export type TranscriptLine = {
  id: string;
  who: string;
  text: string;
};

export type VoiceCallOptions = {
  title: string;
  greeting: string;
  fields: VoiceField[];
  categories: readonly string[];
  instructions?: string;
  keyterms?: readonly string[];
  valueDescription?: string;
  onState: (state: CallState, message: string) => void;
  onTranscript: (lines: TranscriptLine[]) => void;
  onFieldSet: (name: string) => void;
  onLevel: (level: number) => void;
};

type ServerEvent = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  item_id?: string;
  response_id?: string;
  transcript?: string;
  delta?: string;
  text?: string;
};

export type VoiceCall = {
  start: () => Promise<void>;
  hangUp: (next?: CallState, message?: string) => void;
  getState: () => CallState;
};

export const ENDED_MESSAGE = 'Call ended. Check the form, then press Submit.';

export function createVoiceCall(options: VoiceCallOptions): VoiceCall {
  let state: CallState = 'idle';
  let socket: WebSocket | null = null;
  let audio: AudioContext | null = null;
  let stream: MediaStream | null = null;
  const playback: { at: number; sources: AudioBufferSourceNode[] } = { at: 0, sources: [] };
  let pendingTools: ServerEvent[] = [];
  let lines: TranscriptLine[] = [];

  const current = (): CallState => state;

  const setState = (next: CallState, message: string) => {
    state = next;
    options.onState(next, message);
  };

  const stopAudio = () => {
    for (const source of playback.sources.splice(0)) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    playback.at = 0;
  };

  const hangUp = (next: CallState = 'ended', message = ENDED_MESSAGE) => {
    const open = socket;
    socket = null;
    setState(next, message);
    open?.close();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    stopAudio();
    void audio?.close().catch(() => undefined);
    audio = null;
    options.onLevel(0);
  };

  const start = async () => {
    if (state === 'connecting' || state === 'live') return;
    lines = [];
    options.onTranscript(lines);
    pendingTools = [];
    setState('connecting', 'Connecting…');

    if (typeof window === 'undefined' || !('AudioContext' in window) || !navigator.mediaDevices?.getUserMedia) {
      hangUp('error', 'This browser cannot make voice calls. Use the form.');
      return;
    }

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    audio = context;
    void context.resume();
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        hangUp('denied', MIC_DENIED_MESSAGE);
      } else {
        hangUp('error', MIC_UNAVAILABLE_MESSAGE);
      }
      return;
    }
    if (current() !== 'connecting') {
      mic.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = mic;

    let secret: string;
    try {
      const response = await fetch('/api/voice/session', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { value?: string; error?: string };
      if (!response.ok || !payload.value) {
        hangUp('error', payload.error || 'The call could not be started. Use the form.');
        return;
      }
      secret = payload.value;
    } catch {
      hangUp('error', 'The call could not be started. Use the form.');
      return;
    }
    if (current() !== 'connecting') return;

    const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${MODEL}`, [`xai-client-secret.${secret}`]);
    socket = ws;
    ws.addEventListener('error', () => {
      if (socket === ws && (state === 'connecting' || state === 'live')) {
        hangUp('error', CALL_DROPPED_MESSAGE);
      }
    });
    ws.addEventListener('close', () => {
      if (socket === ws && (state === 'connecting' || state === 'live')) {
        hangUp('error', CALL_DROPPED_MESSAGE);
      }
    });
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let message: ServerEvent;
      try {
        message = JSON.parse(event.data) as ServerEvent;
      } catch {
        return;
      }
      onEvent(ws, context, message);
    });
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: sessionConfig(options.fields, options.categories, {
            instructions: options.instructions,
            keyterms: options.keyterms,
            valueDescription: options.valueDescription,
          }),
        }),
      );
    });

    waitFor(ws, 'session.updated')
      .then(async () => {
        if (socket !== ws) return;
        await startMic(context, mic, ws, options.onLevel);
        if (socket !== ws) return;
        setState('live', 'Live. The microphone is on.');
        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'force_message',
              role: 'assistant',
              interruptible: true,
              content: [{ type: 'output_text', text: options.greeting }],
            },
          }),
        );
      })
      .catch(() => {
        if (socket === ws && state === 'connecting') hangUp('error', 'The call could not be started. Use the form.');
      });
  };

  function onEvent(ws: WebSocket, context: AudioContext, event: ServerEvent) {
    const type = event.type ?? '';
    if (type === 'input_audio_buffer.speech_started') stopAudio();
    if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
      const delta = event.delta;
      if (delta) playPcm(context, delta, playback);
    }
    if (type.includes('input_audio_transcription')) {
      const id = `caller-${event.item_id || 'caller'}`;
      const text = event.transcript || event.delta || '';
      if (type.endsWith('.delta') && event.delta) appendLine(id, 'You', event.delta);
      else if (text) replaceLine(id, 'You', text);
    }
    if (type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta') {
      const id = `agent-${event.response_id || 'agent'}`;
      appendLine(id, options.title, event.delta || event.transcript || '');
    }
    if (type === 'response.output_audio_transcript.done') {
      const id = `agent-${event.response_id || 'agent'}`;
      if (event.transcript) replaceLine(id, options.title, event.transcript);
    }
    if (type === 'response.function_call_arguments.done') pendingTools.push(event);
    if (type === 'response.done' && pendingTools.length && socket === ws) {
      const batch = pendingTools.splice(0);
      for (const call of batch) {
        const result = applyTool(call);
        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) },
          }),
        );
      }
      ws.send(JSON.stringify({ type: 'response.create' }));
    }
    if (type === 'error' && (state === 'live' || state === 'connecting')) {
      hangUp('error', CALL_DROPPED_MESSAGE);
    }
  }

  function applyTool(event: ServerEvent) {
    let args: { name?: string; value?: string } = {};
    try {
      args = JSON.parse(event.arguments || '{}') as { name?: string; value?: string };
    } catch {
      args = {};
    }
    const field = options.fields.find((item) => item.name === args.name);
    const value = typeof args.value === 'string' ? args.value.replace(/\\n/g, '\n').trim() : '';
    if (!field || !value) {
      return { ok: false, error: 'Unknown or empty field.', stillNeeded: missingNames() };
    }
    if (!field.set(value)) {
      return { ok: false, error: field.rejectHint || `That value does not fit ${field.label}.`, stillNeeded: missingNames() };
    }
    options.onFieldSet(field.name);
    return { ok: true, name: field.name, value: field.get(), stillNeeded: missingNames() };
  }

  function missingNames() {
    return options.fields.filter((field) => field.required && !field.get()).map((field) => field.label);
  }

  function replaceLine(id: string, who: string, text: string) {
    if (!text.trim()) return;
    const index = lines.findIndex((line) => line.id === id);
    const line = { id, who, text: text.trim() };
    lines = index >= 0 ? lines.map((item, i) => (i === index ? line : item)) : [...lines, line];
    options.onTranscript(lines);
  }

  function appendLine(id: string, who: string, delta: string) {
    if (!delta) return;
    const existing = lines.find((line) => line.id === id);
    if (!existing) replaceLine(id, who, delta);
    else {
      lines = lines.map((line) => (line.id === id ? { ...line, text: `${line.text}${delta}` } : line));
      options.onTranscript(lines);
    }
  }

  return { start, hangUp, getState: current };
}

export function sessionConfig(
  fields: Pick<VoiceField, 'name' | 'label'>[],
  categories: readonly string[],
  voice?: { instructions?: string; keyterms?: readonly string[]; valueDescription?: string },
) {
  const names = fields.map((field) => field.name);
  return {
    voice: 'eve',
    instructions: voice?.instructions ?? defaultVoiceInstructions(fields, categories),
    turn_detection: { type: 'server_vad' },
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: SAMPLE_RATE },
        transcription: {
          model: 'grok-transcribe',
          keyterms: voice?.keyterms ? [...voice.keyterms] : KEYTERMS,
        },
      },
      output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } },
    },
    tools: [
      {
        type: 'function',
        name: 'set_field',
        description: 'Save one English form field the caller has actually provided.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: names },
            value: {
              type: 'string',
              description:
                voice?.valueDescription ??
                'English text. Do not send a guess. For category, send one of the issue categories exactly. For description, send the complete updated English description, not only the newest detail.',
            },
          },
          required: ['name', 'value'],
        },
      },
    ],
  };
}

async function startMic(context: AudioContext, stream: MediaStream, ws: WebSocket, onLevel: (level: number) => void) {
  const source = context.createMediaStreamSource(stream);
  const worklet = `
    class MicProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (channel) this.port.postMessage(channel.slice(0));
        return true;
      }
    }
    registerProcessor('mic-processor', MicProcessor);
  `;
  const url = URL.createObjectURL(new Blob([worklet], { type: 'application/javascript' }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(context, 'mic-processor');
  const pending: number[] = [];
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const samples = resample(event.data, context.sampleRate, SAMPLE_RATE);
    let sum = 0;
    for (const sample of samples) {
      pending.push(sample);
      sum += sample * sample;
    }
    const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
    onLevel(Math.max(0.04, Math.min(1, rms * 5)));
    while (pending.length >= SAMPLE_RATE / 10) {
      const frame = new Float32Array(pending.splice(0, SAMPLE_RATE / 10));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: floatToBase64Pcm16(frame) }));
    }
  };
  source.connect(node);
}

function playPcm(context: AudioContext, base64: string, playback: { at: number; sources: AudioBufferSourceNode[] }) {
  const floats = base64ToFloat32(base64);
  if (!floats.length) return;
  const buffer = context.createBuffer(1, floats.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(floats);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const now = context.currentTime;
  if (playback.at < now) playback.at = now;
  source.start(playback.at);
  playback.at += buffer.duration;
  playback.sources.push(source);
  source.onended = () => {
    const index = playback.sources.indexOf(source);
    if (index >= 0) playback.sources.splice(index, 1);
  };
}

function waitFor(ws: WebSocket, type: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, 8000);
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as { type?: string };
        if (message.type === type) {
          cleanup();
          resolve();
        }
      } catch {
        /* ignore */
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error('closed'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
  });
}

function resample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const mix = pos - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

function floatToBase64Pcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToFloat32(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const output = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < output.length; i += 1) output[i] = view.getInt16(i * 2, true) / 32768;
  return output;
}
