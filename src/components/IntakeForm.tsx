'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckIcon, HangUpIcon, PhoneIcon, SendIcon } from '@/components/icons';
import { createSubmitGuard } from '@/lib/submit-guard';
import {
  cleanTicket,
  matchCategory,
  normalizeBookingReference,
  normalizeEmail,
  validateTicket,
  type TicketFieldName,
  type TicketFields,
} from '@/lib/support';
import { createVoiceCall, type CallState, type TranscriptLine, type VoiceCall, type VoiceField } from '@/lib/voice-call';
import type { ScenarioConfig, ScenarioField } from '@/scenarios/types';
import {
  cleanScenarioFields,
  interpretFieldInput,
  matchScenarioCategory,
  normalizeField,
  overLimitMessage,
  validateScenario,
} from '@/scenarios/validate';

const HIGHLIGHT_MS = 1600;
const PRIMARY_SETTLE_MS = 600;

type Phase = 'form' | 'sending' | 'received';

export function IntakeForm({ scenario }: { scenario: ScenarioConfig }) {
  const [session, setSession] = useState(0);
  return <IntakeSession key={`${scenario.id}-${session}`} scenario={scenario} onRestart={() => setSession((value) => value + 1)} />;
}

function IntakeSession({ scenario, onRestart }: { scenario: ScenarioConfig; onRestart: () => void }) {
  const empty = useMemo(() => Object.fromEntries(scenario.fields.map((field) => [field.key, ''])), [scenario]);
  const [values, setValues] = useState<Record<string, string>>(empty);
  const valuesRef = useRef(values);
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [justFilled, setJustFilled] = useState<Set<string>>(new Set());
  const [callState, setCallState] = useState<CallState>('idle');
  const [callMessage, setCallMessage] = useState('');
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [level, setLevel] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('form');
  const [ticketId, setTicketId] = useState('');
  const callRef = useRef<VoiceCall | null>(null);
  const usedVoice = useRef(false);
  const timers = useRef<number[]>([]);
  const primaryChangedAt = useRef(0);
  const guard = useRef(createSubmitGuard());
  const summaryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const receivedRef = useRef<HTMLHeadingElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const writeField = useCallback((name: string, value: string) => {
    valuesRef.current = { ...valuesRef.current, [name]: value };
    setValues(valuesRef.current);
  }, []);

  const voiceFields = useMemo<VoiceField[]>(() => {
    if (scenario.legacyPayload) {
      const read = (name: TicketFieldName) => () => (valuesRef.current[name] ?? '').trim();
      const field = (name: TicketFieldName, normalize: (value: string) => string | undefined): VoiceField => ({
        name,
        label: scenario.fields.find((item) => item.key === name)?.label ?? name,
        required: true,
        get: read(name),
        set: (value) => {
          const next = normalize(value);
          if (!next) return false;
          writeField(name, next);
          setErrors((current) => ({ ...current, [name]: undefined }));
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
    }
    return scenario.fields.map((field) => ({
      name: field.key,
      label: field.label,
      required: field.required,
      rejectHint: field.messages?.pattern || field.messages?.invalid,
      get: () => (valuesRef.current[field.key] ?? '').trim(),
      set: (value) => {
        if (field.type === 'select') {
          const matched = matchScenarioCategory(value, scenario.categories, scenario.categoryAliases);
          if (!matched) return false;
          writeField(field.key, matched);
          setErrors((current) => ({ ...current, [field.key]: undefined }));
          return true;
        }
        const result = interpretFieldInput(field, value, scenario.categories);
        if (!result.value) return false;
        writeField(field.key, result.value);
        setErrors((current) => ({ ...current, [field.key]: result.error }));
        return true;
      },
    }));
  }, [scenario, writeField]);

  useEffect(() => {
    const call = createVoiceCall({
      title: scenario.voice.title,
      greeting: scenario.voice.greeting,
      fields: voiceFields,
      categories: scenario.categories,
      instructions: scenario.voice.instructions,
      keyterms: scenario.voice.keyterms,
      valueDescription: scenario.voice.valueDescription,
      onState: (state, message) => {
        setCallState(state);
        setCallMessage(message);
      },
      onTranscript: setLines,
      onLevel: setLevel,
      onFieldSet: (name) => {
        setFilled((current) => new Set(current).add(name));
        setJustFilled((current) => new Set(current).add(name));
        timers.current.push(
          window.setTimeout(() => {
            setJustFilled((current) => {
              const next = new Set(current);
              next.delete(name);
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
  }, [scenario, voiceFields]);

  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const validationErrors = scenario.legacyPayload
    ? validateTicket(values as TicketFields)
    : validateScenario(scenario, values);
  const complete = Object.keys(validationErrors).length === 0;
  const inCall = callState === 'connecting' || callState === 'live';
  const primary: 'call' | 'hangup' | 'submit' = inCall
    ? complete && callState === 'live'
      ? 'submit'
      : 'hangup'
    : callState === 'idle' && !complete
      ? 'call'
      : 'submit';
  const missing = scenario.fields.filter((field) => field.required && !(values[field.key] ?? '').trim());
  const started = missing.length < scenario.fields.filter((field) => field.required).length;

  useEffect(() => {
    primaryChangedAt.current = Date.now();
  }, [primary]);

  useEffect(() => {
    if (phase === 'received') receivedRef.current?.focus();
  }, [phase]);

  const startCall = () => {
    usedVoice.current = true;
    setSummary([]);
    void callRef.current?.start();
    window.setTimeout(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const onChange = (field: ScenarioField) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const raw = event.target.value;
    if (scenario.legacyPayload) {
      writeField(field.key, raw);
    } else {
      const normalized = normalizeField(field, raw);
      writeField(field.key, field.pattern && patternOk(field.pattern, normalized) ? normalized : raw);
      const limit = overLimitMessage(field, normalized);
      if (limit) {
        setErrors((current) => ({ ...current, [field.key]: limit }));
        return;
      }
    }
    if (errors[field.key]) setErrors((current) => ({ ...current, [field.key]: undefined }));
  };

  const onBlur = (field: ScenarioField) => () => {
    if (scenario.legacyPayload) return;
    const result = interpretFieldInput(field, valuesRef.current[field.key] ?? '', scenario.categories);
    if (result.value) writeField(field.key, result.value);
    if (result.value && result.error) setErrors((current) => ({ ...current, [field.key]: result.error }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === 'sending') return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter === primaryRef.current && Date.now() - primaryChangedAt.current < PRIMARY_SETTLE_MS) return;
    if (!guard.current.tryBegin()) return;

    let sent = false;
    try {
      const current = valuesRef.current;
      if (scenario.legacyPayload) {
        const found = validateTicket(current as TicketFields);
        setErrors(found);
        const messages = scenario.fields.filter((field) => found[field.key as TicketFieldName]).map((field) => field.key);
        if (messages.length) {
          setSummary(messages);
          window.setTimeout(() => summaryRef.current?.focus(), 0);
          return;
        }
      } else {
        const normalized = cleanScenarioFields(scenario, current);
        valuesRef.current = normalized;
        setValues(normalized);
        const found = validateScenario(scenario, normalized);
        setErrors(found);
        const messages = scenario.fields.filter((field) => found[field.key]).map((field) => field.key);
        if (messages.length) {
          setSummary(messages);
          window.setTimeout(() => summaryRef.current?.focus(), 0);
          return;
        }
      }
      setSummary([]);
      if (callRef.current && (callRef.current.getState() === 'live' || callRef.current.getState() === 'connecting')) {
        callRef.current.hangUp('ended', 'Call ended. Sending your ticket…');
      }
      setPhase('sending');
      const channel = usedVoice.current ? 'voice' : 'web';
      const body = scenario.legacyPayload
        ? { ...cleanTicket(valuesRef.current as TicketFields), channel }
        : { scenario: scenario.id, channel, fields: cleanScenarioFields(scenario, valuesRef.current) };
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; id?: string; status?: string };
      if (response.ok && payload.ok && payload.id) {
        sent = true;
        setTicketId(payload.id);
        setPhase('received');
        return;
      }
      throw new Error(payload.status || 'failed');
    } catch {
      setPhase('form');
      setSummary(['send']);
      window.setTimeout(() => summaryRef.current?.focus(), 0);
    } finally {
      if (!sent) guard.current.end();
    }
  };

  const ui = scenario.ui;

  if (phase === 'received') {
    return (
      <section className="card success" aria-labelledby={ui.receivedId}>
        <div className="success-icon">
          <CheckIcon className="btn-icon" />
        </div>
        <p className="eyebrow">{ui.successEyebrow}</p>
        <h2 id={ui.receivedId} ref={receivedRef} tabIndex={-1} style={{ fontSize: '1.8rem' }}>
          {ui.successTitle}
        </h2>
        <p className="muted">{ui.successHint}</p>
        <p className="ref" data-testid="ticket-id">
          {ticketId}
        </p>
        <p>{ui.successMessage(values, ticketId)}</p>
        <div className="inline-actions">
          <button type="button" className="btn" onClick={onRestart}>
            {ui.restartLabel}
          </button>
        </div>
      </section>
    );
  }

  const primaryLabel = phase === 'sending' ? ui.sendingLabel : primary === 'call' ? ui.callLabel : primary === 'hangup' ? ui.hangUpLabel : ui.submitLabel;
  const PrimaryIcon = primary === 'call' ? PhoneIcon : primary === 'hangup' ? HangUpIcon : SendIcon;

  return (
    <section className="card support-card" aria-labelledby={ui.titleId}>
      <h2 id={ui.titleId}>{ui.formTitle}</h2>
      <p className="support-intro">{ui.formIntro}</p>
      {ui.showDemoLine && scenario.voice.demoLine && (
        <p className="demo-line">
          <strong>Try saying: </strong>
          {scenario.voice.demoLine}
        </p>
      )}
      {ui.portalLink && (
        <p className="intake-portal">
          <Link href={ui.portalLink.href}>{ui.portalLink.label}</Link>
        </p>
      )}

      <div ref={summaryRef} tabIndex={-1}>
        {summary.length > 0 && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
            {summary[0] === 'send' ? (
              <p>
                <strong>{ui.sendErrorTitle}</strong> {ui.sendErrorBody}
              </p>
            ) : (
              <>
                <p>
                  <strong>{ui.invalidTitle}</strong>
                </p>
                <ul>
                  {summary.map((name) => (
                    <li key={name}>
                      <a href={`#${ui.fieldIdPrefix}-${name}`}>{errors[name]}</a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <form id={ui.formId} onSubmit={onSubmit} noValidate autoComplete="off" aria-labelledby={ui.titleId}>
        <div className="support-layout">
          {callState === 'idle' ? (
            <aside className="call-panel" aria-labelledby="how-title">
              <p className="eyebrow">{ui.howEyebrow}</p>
              <h2 id="how-title">{ui.howTitle}</h2>
              <ol className="how-steps">
                {ui.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </aside>
          ) : (
            <section ref={panelRef} className="call-panel" data-call-state={callState} aria-labelledby="call-title">
              <p className="eyebrow">{ui.callEyebrow}</p>
              <h2 id="call-title">{scenario.voice.title}</h2>
              <p className="call-state" role="status">
                <span className="call-dot" aria-hidden="true" />
                {callMessage}
              </p>
              <div className="mic-meter" aria-hidden="true">
                <span style={{ transform: `scaleX(${inCall ? Math.max(level, 0.04) : 0.04})` }} />
              </div>
              <h3 className="call-needed-title">Still needed</h3>
              <ul className="call-needed">
                {missing.length === 0 ? <li>{ui.allFilled}</li> : missing.map((field) => <li key={field.key}>{field.label}</li>)}
              </ul>
              <div ref={transcriptRef} className="transcript" aria-live="polite" aria-relevant="additions text" aria-label="Call transcript">
                {lines.length === 0 ? (
                  <p className="transcript-empty">{ui.transcriptEmpty}</p>
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
            <p className="required-note">{ui.requiredNote}</p>
            <div className="form-grid">
              {scenario.fields.map((field) => (
                <FieldControl
                  key={field.key}
                  field={field}
                  scenario={scenario}
                  value={values[field.key] ?? ''}
                  error={errors[field.key]}
                  filled={filled.has(field.key)}
                  justFilled={justFilled.has(field.key)}
                  onChange={onChange(field)}
                  onBlur={onBlur(field)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="action-bar">
          <button
            ref={primaryRef}
            className={`btn btn-lg btn-primary-action${primary === 'hangup' ? ' btn-danger' : ''}`}
            type={primary === 'submit' ? 'submit' : 'button'}
            disabled={phase === 'sending'}
            onClick={primary === 'call' ? startCall : primary === 'hangup' ? () => callRef.current?.hangUp() : undefined}
          >
            <PrimaryIcon className="btn-icon" />
            {primaryLabel}
          </button>
          {!inCall && primary === 'call' && started && (
            <button type="submit" className="btn btn-ghost">
              {ui.submitLabel}
            </button>
          )}
          {inCall && primary === 'submit' && (
            <button type="button" className="btn btn-ghost" onClick={() => callRef.current?.hangUp()}>
              {ui.hangUpLabel}
            </button>
          )}
          {!inCall && callState !== 'idle' && phase === 'form' && (
            <button type="button" className="btn btn-ghost" onClick={startCall}>
              {ui.callAgainLabel}
            </button>
          )}
          <p className="action-note">{inCall ? ui.inCallNote : ui.idleNote}</p>
        </div>
      </form>
    </section>
  );
}

function FieldControl({
  field,
  scenario,
  value,
  error,
  filled,
  justFilled,
  onChange,
  onBlur,
}: {
  field: ScenarioField;
  scenario: ScenarioConfig;
  value: string;
  error?: string;
  filled: boolean;
  justFilled: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
}) {
  const id = `${scenario.ui.fieldIdPrefix}-${field.key}`;
  // A maxlength attribute would silently cut pasted text, so scenario forms show a counter and a limit error instead.
  const showCount = !scenario.legacyPayload && !!field.maxLength && (field.type === 'textarea' || value.length > field.maxLength * 0.8);
  const over = !!field.maxLength && value.length > field.maxLength;
  const describedBy =
    [field.hint ? `${id}-hint` : '', showCount ? `${id}-count` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const classes = ['field', field.full ? 'full' : '', filled ? 'is-filled' : '', justFilled ? 'is-just-filled' : '', error ? 'is-invalid' : '']
    .filter(Boolean)
    .join(' ');
  const common = {
    id,
    name: field.key,
    value,
    onChange,
    onBlur: scenario.legacyPayload ? undefined : onBlur,
    required: field.required || undefined,
    'aria-required': field.required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    maxLength: scenario.legacyPayload ? field.maxLength : undefined,
    placeholder: field.placeholder,
    autoComplete: field.input?.autoComplete,
    spellCheck: field.input?.spellCheck,
    autoCapitalize: field.input?.autoCapitalize,
    inputMode: field.input?.inputMode,
  };
  return (
    <div className={classes}>
      <label htmlFor={id}>
        {field.label}
        {filled && <span className="filled-tag">{scenario.ui.filledTag}</span>}
      </label>
      {field.type === 'textarea' ? (
        <textarea {...common} rows={field.rows ?? 5} />
      ) : field.type === 'select' ? (
        <select {...common}>
          <option value="">{field.emptyOption ?? 'Select'}</option>
          {(field.options ?? scenario.categories).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} type={field.type === 'email' ? 'email' : 'text'} />
      )}
      {field.hint && (
        <p className="hint" id={`${id}-hint`}>
          {field.hint}
        </p>
      )}
      {showCount && field.maxLength && (
        <p className={`char-count${over ? ' is-over' : ''}`} id={`${id}-count`}>
          {value.length.toLocaleString('en-US')} / {field.maxLength.toLocaleString('en-US')} characters
          {over && ` (${(value.length - field.maxLength).toLocaleString('en-US')} over)`}
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

function patternOk(source: string, value: string): boolean {
  try {
    return new RegExp(source).test(value);
  } catch {
    return false;
  }
}
