'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, HangUpIcon, PhoneIcon, SendIcon } from '@/components/icons';
import {
  cleanTicket,
  EMPTY_TICKET,
  ISSUE_CATEGORIES,
  matchCategory,
  normalizeBookingReference,
  normalizeEmail,
  TICKET_FIELDS,
  validateTicket,
  type TicketErrors,
  type TicketFieldName,
  type TicketFields,
} from '@/lib/support';
import { createVoiceCall, GREETING, type CallState, type TranscriptLine, type VoiceCall, type VoiceField } from '@/lib/voice-call';

const TITLE = 'FlyLo-Air Support';
const HIGHLIGHT_MS = 1600;
const PRIMARY_SETTLE_MS = 600;

type Phase = 'form' | 'sending' | 'received';

export function SupportCall() {
  const [session, setSession] = useState(0);
  return <SupportCallSession key={session} onRestart={() => setSession((value) => value + 1)} />;
}

function SupportCallSession({ onRestart }: { onRestart: () => void }) {
  const [values, setValues] = useState<TicketFields>(EMPTY_TICKET);
  const valuesRef = useRef<TicketFields>(EMPTY_TICKET);
  const [filled, setFilled] = useState<Set<TicketFieldName>>(new Set());
  const [justFilled, setJustFilled] = useState<Set<TicketFieldName>>(new Set());
  const [callState, setCallState] = useState<CallState>('idle');
  const [callMessage, setCallMessage] = useState('');
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [level, setLevel] = useState(0);
  const [errors, setErrors] = useState<TicketErrors>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('form');
  const [ticketId, setTicketId] = useState('');
  const callRef = useRef<VoiceCall | null>(null);
  const usedVoice = useRef(false);
  const timers = useRef<number[]>([]);
  const primaryChangedAt = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const receivedRef = useRef<HTMLHeadingElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const writeField = useCallback((name: TicketFieldName, value: string) => {
    valuesRef.current = { ...valuesRef.current, [name]: value };
    setValues(valuesRef.current);
  }, []);

  const voiceFields = useMemo<VoiceField[]>(() => {
    const read = (name: TicketFieldName) => () => valuesRef.current[name].trim();
    const field = (name: TicketFieldName, normalize: (value: string) => string | undefined): VoiceField => ({
      name,
      label: TICKET_FIELDS.find((item) => item.name === name)?.label ?? name,
      required: true,
      get: read(name),
      set: (value) => {
        const next = normalize(value);
        if (!next) return false;
        writeField(name, next);
        return true;
      },
    });
    return [
      field('fullName', (value) => value.trim()),
      field('bookingReference', normalizeBookingReference),
      field('email', normalizeEmail),
      field('category', matchCategory),
      field('description', (value) => value.trim()),
    ];
  }, [writeField]);

  useEffect(() => {
    const call = createVoiceCall({
      title: TITLE,
      greeting: GREETING,
      fields: voiceFields,
      categories: ISSUE_CATEGORIES,
      onState: (state, message) => {
        setCallState(state);
        setCallMessage(message);
      },
      onTranscript: setLines,
      onLevel: setLevel,
      onFieldSet: (name) => {
        const key = name as TicketFieldName;
        setFilled((current) => new Set(current).add(key));
        setJustFilled((current) => new Set(current).add(key));
        setErrors((current) => ({ ...current, [key]: undefined }));
        timers.current.push(
          window.setTimeout(() => {
            setJustFilled((current) => {
              const next = new Set(current);
              next.delete(key);
              return next;
            });
          }, HIGHLIGHT_MS),
        );
      },
    });
    callRef.current = call;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const state = call.getState();
      if (state !== 'connecting' && state !== 'live') return;
      event.preventDefault();
      call.hangUp();
    };
    document.addEventListener('keydown', onKey);
    const pending = timers.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      pending.forEach((id) => window.clearTimeout(id));
      call.hangUp('idle', '');
      callRef.current = null;
    };
  }, [voiceFields]);

  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const inCall = callState === 'connecting' || callState === 'live';
  const complete = Object.keys(validateTicket(values)).length === 0;
  const primary: 'call' | 'hangup' | 'submit' = inCall
    ? complete && callState === 'live'
      ? 'submit'
      : 'hangup'
    : callState === 'idle' && !complete
      ? 'call'
      : 'submit';
  const missing = TICKET_FIELDS.filter((field) => !values[field.name].trim());

  useEffect(() => {
    primaryChangedAt.current = Date.now();
  }, [primary]);

  const startCall = () => {
    usedVoice.current = true;
    setSummary([]);
    void callRef.current?.start();
    window.setTimeout(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const onChange = (name: TicketFieldName) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    writeField(name, event.target.value);
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === 'sending') return;
    // The primary button turns into Submit mid-call; ignore a click meant for Hang up.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter === primaryRef.current && Date.now() - primaryChangedAt.current < PRIMARY_SETTLE_MS) return;
    const current = valuesRef.current;
    const found = validateTicket(current);
    setErrors(found);
    const messages = TICKET_FIELDS.filter((field) => found[field.name]).map((field) => field.name);
    if (messages.length) {
      setSummary(messages);
      window.setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    setSummary([]);
    if (callRef.current && (callRef.current.getState() === 'live' || callRef.current.getState() === 'connecting')) {
      callRef.current.hangUp('ended', 'Call ended. Sending your ticket…');
    }
    setPhase('sending');
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...cleanTicket(current), channel: usedVoice.current ? 'voice' : 'web' }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; id?: string; status?: string };
      if (response.ok && payload.ok && payload.id) {
        setTicketId(payload.id);
        setPhase('received');
        window.setTimeout(() => receivedRef.current?.focus(), 0);
        return;
      }
      throw new Error(payload.status || 'failed');
    } catch {
      setPhase('form');
      setSummary(['send']);
      window.setTimeout(() => summaryRef.current?.focus(), 0);
    }
  };

  if (phase === 'received') {
    return (
      <section className="card success" aria-labelledby="ticket-received">
        <div className="success-icon">
          <CheckIcon className="btn-icon" />
        </div>
        <p className="eyebrow">Support request</p>
        <h2 id="ticket-received" tabIndex={-1} style={{ fontSize: '1.8rem' }}>
          Ticket received
        </h2>
        <p className="muted">Quote this number if you contact us again.</p>
        <p className="ref" data-testid="ticket-id">
          {ticketId}
        </p>
        <p>
          Thanks, {values.fullName.split(' ')[0] || 'there'}. FlyLo-Air support will email {normalizeEmail(values.email)} with an
          update.
        </p>
        <div className="inline-actions">
          <button type="button" className="btn" onClick={onRestart}>
            Start a new request
          </button>
        </div>
      </section>
    );
  }

  const primaryLabel = phase === 'sending' ? 'Sending…' : primary === 'call' ? 'Call FlyLo-Air Support' : primary === 'hangup' ? 'Hang up' : 'Submit';
  const PrimaryIcon = primary === 'call' ? PhoneIcon : primary === 'hangup' ? HangUpIcon : SendIcon;

  return (
    <section className="card support-card" aria-labelledby="support-form-title">
      <h2 id="support-form-title">Tell us what happened</h2>
      <p className="support-intro">
        Call support in this browser, or type your request. The form fills in while you talk. Unknown details stay blank and
        you can correct any field. Nothing is sent until you press Submit.
      </p>

      <div ref={summaryRef} tabIndex={-1}>
        {summary.length > 0 && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
            {summary[0] === 'send' ? (
              <p>
                <strong>Your ticket could not be sent right now.</strong> Check your connection and press Submit again.
              </p>
            ) : (
              <>
                <p>
                  <strong>Check the highlighted fields, then press Submit again.</strong>
                </p>
                <ul>
                  {summary.map((name) => (
                    <li key={name}>
                      <a href={`#support-${name}`}>{errors[name as TicketFieldName]}</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <form id="support-form" onSubmit={onSubmit} noValidate autoComplete="off" aria-labelledby="support-form-title">
        <div className="support-layout">
          {callState === 'idle' ? (
            <aside className="call-panel" aria-labelledby="how-title">
              <p className="eyebrow">How it works</p>
              <h2 id="how-title">Talk, check, submit</h2>
              <ol className="how-steps">
                <li>Press Call and allow the microphone.</li>
                <li>Say your name, booking reference, email and what went wrong.</li>
                <li>Watch the form fill in, fix anything, then press Submit.</li>
              </ol>
            </aside>
          ) : (
            <section
              ref={panelRef}
              className="call-panel"
              data-call-state={callState}
              aria-labelledby="call-title"
            >
              <p className="eyebrow">Call FlyLo-Air Support</p>
              <h2 id="call-title">{TITLE}</h2>
              <p className="call-state" role="status">
                <span className="call-dot" aria-hidden="true" />
                {callMessage}
              </p>
              <div className="mic-meter" aria-hidden="true">
                <span style={{ transform: `scaleX(${inCall ? Math.max(level, 0.04) : 0.04})` }} />
              </div>
              <h3 className="call-needed-title">Still needed</h3>
              <ul className="call-needed">
                {missing.length === 0 ? (
                  <li>All required fields are filled. Check them, then press Submit.</li>
                ) : (
                  missing.map((field) => <li key={field.name}>{field.label}</li>)
                )}
              </ul>
              <div ref={transcriptRef} className="transcript" aria-live="polite" aria-relevant="additions text" aria-label="Call transcript">
                {lines.length === 0 ? (
                  <p className="transcript-empty">The conversation shows up here.</p>
                ) : (
                  lines.map((line) => (
                    <p key={line.id} className={`transcript-line${line.who === 'You' ? ' is-caller' : ''}`}>
                      <span className="who">{line.who}</span>
                      <span className="said">{line.text}</span>
                    </p>
                  ))
                )}
              </div>
            </section>
          )}

          <div>
            <p className="required-note">All fields are required.</p>
            <div className="form-grid">
              <TicketInput name="fullName" label="Full name" values={values} errors={errors} filled={filled} justFilled={justFilled}>
                <input type="text" autoComplete="off" spellCheck={false} maxLength={120} onChange={onChange('fullName')} />
              </TicketInput>
              <TicketInput
                name="bookingReference"
                label="Booking reference"
                hint="Like FLY-48213. It is on your confirmation email."
                values={values}
                errors={errors}
                filled={filled}
                justFilled={justFilled}
              >
                <input type="text" autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={20} onChange={onChange('bookingReference')} />
              </TicketInput>
              <TicketInput name="email" label="Email" values={values} errors={errors} filled={filled} justFilled={justFilled} full>
                <input type="email" autoComplete="off" spellCheck={false} inputMode="email" maxLength={254} onChange={onChange('email')} />
              </TicketInput>
              <TicketInput name="category" label="Issue category" values={values} errors={errors} filled={filled} justFilled={justFilled} full>
                <select onChange={onChange('category')}>
                  <option value="">Select a category</option>
                  {ISSUE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </TicketInput>
              <TicketInput name="description" label="Description" values={values} errors={errors} filled={filled} justFilled={justFilled} full>
                <textarea rows={5} maxLength={2000} onChange={onChange('description')} />
              </TicketInput>
            </div>
          </div>
        </div>

        <div className="action-bar">
          <button
            ref={primaryRef}
            className={`btn btn-lg btn-primary-action${primary === 'hangup' ? ' btn-danger' : ''}`}
            type={primary === 'submit' ? 'submit' : 'button'}
            disabled={phase === 'sending'}
            onClick={
              primary === 'call'
                ? startCall
                : primary === 'hangup'
                  ? () => callRef.current?.hangUp()
                  : undefined
            }
          >
            <PrimaryIcon className="btn-icon" />
            {primaryLabel}
          </button>
          {inCall && primary === 'submit' && (
            <button type="button" className="btn btn-ghost" onClick={() => callRef.current?.hangUp()}>
              Hang up
            </button>
          )}
          {!inCall && callState !== 'idle' && phase === 'form' && (
            <button type="button" className="btn btn-ghost" onClick={startCall}>
              Call again
            </button>
          )}
          <p className="action-note">
            {inCall ? 'Press Esc to hang up.' : 'Nothing is sent until you press Submit.'}
          </p>
        </div>
      </form>
    </section>
  );
}

function TicketInput({
  name,
  label,
  hint,
  values,
  errors,
  filled,
  justFilled,
  full,
  children,
}: {
  name: TicketFieldName;
  label: string;
  hint?: string;
  values: TicketFields;
  errors: TicketErrors;
  filled: Set<TicketFieldName>;
  justFilled: Set<TicketFieldName>;
  full?: boolean;
  children: React.ReactElement<React.InputHTMLAttributes<HTMLElement>>;
}) {
  const id = `support-${name}`;
  const error = errors[name];
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const classes = ['field', full ? 'full' : '', filled.has(name) ? 'is-filled' : '', justFilled.has(name) ? 'is-just-filled' : '', error ? 'is-invalid' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <label htmlFor={id}>
        {label}
        {filled.has(name) && <span className="filled-tag">Filled from call</span>}
      </label>
      <ChildWithProps element={children} id={id} name={name} value={values[name]} describedBy={describedBy} invalid={Boolean(error)} />
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function ChildWithProps({
  element,
  id,
  name,
  value,
  describedBy,
  invalid,
}: {
  element: React.ReactElement<React.InputHTMLAttributes<HTMLElement>>;
  id: string;
  name: string;
  value: string;
  describedBy?: string;
  invalid: boolean;
}) {
  const Tag = element.type as React.ElementType;
  return (
    <Tag
      {...element.props}
      id={id}
      name={name}
      value={value}
      required
      aria-required="true"
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
    />
  );
}
