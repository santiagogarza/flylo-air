'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GateMap } from '@/components/GateMap';
import { BagIcon, CheckIcon, ClockIcon, DownloadIcon, FlipIcon, LogoMark, PlaneIcon, SunIcon } from '@/components/icons';
import { InstallSheet, useInstallPrompt } from '@/components/InstallSheet';
import { PassCountdown } from '@/components/PassCountdown';
import { PassQr } from '@/components/PassQr';
import { departureTime, formatPreviewOffset, passStatus, type BoardingPass as Pass } from '@/lib/boarding';
import { downloadPassPng } from '@/lib/pass-png';

const MINUTE = 60_000;
const PREVIEW_MAX = 180;
const PREVIEW_MIN = -10;

const PRESETS = [
  { label: '2h 50m before', minutes: 170 },
  { label: 'Boarding', minutes: 35 },
  { label: 'Final call', minutes: 23 },
  { label: 'Gate closed', minutes: 10 },
  { label: 'Departed', minutes: -3 },
];

function clockLabel(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
}

export function BoardingPass({ pass }: { pass: Pass }) {
  const departure = useMemo(() => departureTime(pass).getTime(), [pass]);
  const [realNow, setRealNow] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [boosted, setBoosted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const qrButtonRef = useRef<HTMLButtonElement>(null);
  const installButtonRef = useRef<HTMLButtonElement>(null);
  const boostCloseRef = useRef<HTMLButtonElement>(null);
  const { canPrompt, installed, install } = useInstallPrompt();

  useEffect(() => {
    const tick = () => setRealNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, []);

  const ready = realNow !== null;
  const now = (realNow ?? departure - 3 * 60 * MINUTE) + (offset ?? 0);
  const previewing = offset !== null;
  const status = passStatus(departure, pass.zone, now);
  const remaining = status.target === null ? 0 : status.target - now;
  const minutesBefore = Math.round((departure - now) / MINUTE);
  const sliderValue = previewing ? Math.min(-PREVIEW_MIN, Math.max(-PREVIEW_MAX, -minutesBefore)) : -PREVIEW_MAX;

  const travelTo = (minutes: number) => setOffset(departure - minutes * MINUTE - Date.now());

  const closeBoost = useCallback(() => {
    setBoosted(false);
    window.setTimeout(() => qrButtonRef.current?.focus(), 0);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    window.setTimeout(() => installButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!boosted) return;
    boostCloseRef.current?.focus();
    let lock: { release: () => Promise<void> } | undefined;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wakeLock
      ?.request('screen')
      .then((sentinel) => {
        lock = sentinel;
      })
      .catch(() => undefined);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBoost();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      lock?.release().catch(() => undefined);
    };
  }, [boosted, closeBoost]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const onCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    setFlipped((value) => !value);
  };

  const onCardKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFlipped((value) => !value);
    }
  };

  const onDownload = async () => {
    setSaving(true);
    try {
      const file = await downloadPassPng(pass);
      setToast(`Saved ${file}`);
    } catch {
      setToast('Could not save the pass on this device.');
    } finally {
      setSaving(false);
    }
  };

  const name = pass.passenger.display;
  const qrTitle = `Boarding pass code for ${name}, ${pass.flightNumber}, seat ${pass.seat}`;

  return (
    <div className="pass-stage-grid">
      <div className="pass-intro">
        <p className="eyebrow">Mobile boarding pass</p>
        <h1>
          {pass.from.city} <span aria-hidden="true">→</span>
          <span className="visually-hidden"> to </span> {pass.to.city}
        </h1>
        <p className="pass-intro-lead">
          {name} · {pass.flightNumber} · {pass.dateLabel} at {pass.departs}
        </p>
        <ul className="pass-tips">
          <li>
            <SunIcon className="btn-icon" /> Tap the code to brighten it for the gate scanner.
          </li>
          <li>
            <FlipIcon className="btn-icon" /> Tap the pass or press Enter to flip it for bags and the gate map.
          </li>
          <li>
            <DownloadIcon className="btn-icon" /> Add it to your Home Screen or save it as a PNG.
          </li>
        </ul>
        <p className="pass-sample">
          <span className="sample-badge">SAMPLE</span> Fly more. Pay less. Not valid for travel.
        </p>
      </div>

      <div className={`phone${boosted ? ' is-boosted' : ''}`}>
        <div className="phone-screen">
          <div className="phone-status" aria-hidden="true">
            <span>{ready ? clockLabel(now) : '9:41'}</span>
            <span className="phone-island" />
            <span className="phone-indicators">
              <i />
              <i />
              <i />
              <b />
            </span>
          </div>
          <div className="phone-scroll">
            <div className="phone-bar">
              <Link href="/" className="phone-back">
                ‹ Trips
              </Link>
              <span>Boarding pass</span>
              <span className="phone-bar-spacer" />
            </div>

            <div
              className={`pass${flipped ? ' is-flipped' : ''}`}
              data-phase={status.phase}
              tabIndex={0}
              role="group"
              aria-roledescription="boarding pass"
              aria-label={`Boarding pass, ${flipped ? 'back' : 'front'}. Press Enter to flip.`}
              onClick={onCardClick}
              onKeyDown={onCardKey}
            >
              <div className="pass-inner">
                <section className="pass-face pass-front" aria-hidden={flipped} inert={flipped}>
                  <header className="pass-head">
                    <span className="pass-brand">
                      <LogoMark className="pass-logo" />
                      <span>
                        FlyLo<span className="brand-air">-Air</span>
                      </span>
                    </span>
                    <span className="pass-head-flight">
                      <small>Boarding pass</small>
                      {pass.flightNumber}
                    </span>
                  </header>

                  <div className="pass-route">
                    <div>
                      <span className="pass-code">{pass.from.code}</span>
                      <span className="pass-city">{pass.from.city}</span>
                    </div>
                    <div className="pass-plane" aria-hidden="true">
                      <span className="pass-plane-line" />
                      <PlaneIcon className="pass-plane-icon" />
                      <span className="pass-plane-line" />
                      <small>{pass.duration}</small>
                    </div>
                    <div className="pass-route-to">
                      <span className="pass-code">{pass.to.code}</span>
                      <span className="pass-city">{pass.to.city}</span>
                    </div>
                  </div>

                  <dl className="pass-fields">
                    <div className="pass-field pass-field-wide">
                      <dt>Passenger</dt>
                      <dd>{name}</dd>
                    </div>
                    <div className="pass-field pass-field-seat">
                      <dt>Seat</dt>
                      <dd>{pass.seat}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Flight</dt>
                      <dd>{pass.flightNumber}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Date</dt>
                      <dd>{pass.dateShort}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Departs</dt>
                      <dd>{pass.departs}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Boards</dt>
                      <dd>{pass.boards}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Gate</dt>
                      <dd>{pass.gate}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Terminal</dt>
                      <dd>{pass.terminal}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Zone</dt>
                      <dd>{pass.zone}</dd>
                    </div>
                    <div className="pass-field">
                      <dt>Fare</dt>
                      <dd>{pass.fareName}</dd>
                    </div>
                  </dl>

                  <div className="pass-tear" aria-hidden="true" />

                  <div className="pass-status">
                    <p className="pass-status-label" aria-live="polite">
                      <span className="pass-status-dot" aria-hidden="true" />
                      {ready ? status.label : 'Checking the clock…'}
                    </p>
                    <div className="pass-status-row">
                      {status.target !== null && <PassCountdown remainingMs={remaining} ready={ready} />}
                      <p className="pass-status-caption">
                        {status.target === null ? 'Thanks for flying FlyLo-Air' : status.targetLabel}
                      </p>
                    </div>
                  </div>

                  <button ref={qrButtonRef} type="button" className="pass-qr" onClick={() => setBoosted(true)} aria-label={`${qrTitle}. Tap to boost brightness`}>
                    <PassQr value={pass.bcbp} title={qrTitle} className="pass-qr-code" />
                  </button>
                  <p className="pass-hint">
                    <SunIcon className="pass-hint-icon" /> Tap code to brighten · Tap pass to flip
                  </p>
                </section>

                <section className="pass-face pass-back" aria-hidden={!flipped} inert={!flipped}>
                  <header className="pass-back-head">
                    <span className="pass-brand">
                      <LogoMark className="pass-logo" />
                      <span>Trip details</span>
                    </span>
                    <span className="pass-back-ref">
                      <small>Booking code</small>
                      {pass.pnr}
                    </span>
                  </header>

                  <h2 className="pass-back-title">
                    <BagIcon className="btn-icon" /> Bag allowance · {pass.fareName}
                  </h2>
                  <ul className="pass-perks">
                    {pass.perks.map((perk) => (
                      <li key={perk}>
                        <CheckIcon className="pass-perk-icon" /> {perk}
                      </li>
                    ))}
                  </ul>

                  <h2 className="pass-back-title">
                    <PlaneIcon className="btn-icon" /> Gate map
                  </h2>
                  <GateMap gate={pass.gate} terminal={pass.terminal} walkMinutes={pass.walkMinutes} />

                  <dl className="pass-back-facts">
                    <div>
                      <dt>Aircraft</dt>
                      <dd>{pass.aircraft}</dd>
                    </div>
                    <div>
                      <dt>Arrives</dt>
                      <dd>
                        {pass.arrives}
                        {pass.arrivesNextDay ? ' +1' : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Cabin</dt>
                      <dd>{pass.cabin}</dd>
                    </div>
                  </dl>

                  <p className="pass-fine">
                    SAMPLE boarding pass for FlyLo-Air, a fictional airline. Not valid for travel. Boarding starts 40 minutes before departure
                    and the gate closes 15 minutes before. Have your ID ready at the gate. Times are local to the departure airport. Fly more.
                    Pay less.
                  </p>
                  <p className="pass-hint pass-hint-back">
                    <FlipIcon className="pass-hint-icon" /> Tap to flip back
                  </p>
                </section>
              </div>
            </div>

            <div className="pass-actions">
              <button type="button" className="pass-action" onClick={() => setFlipped((value) => !value)} aria-pressed={flipped}>
                <FlipIcon className="btn-icon" />
                {flipped ? 'Show front' : 'Bags & map'}
              </button>
              <button ref={installButtonRef} type="button" className="pass-action" onClick={() => setSheetOpen(true)}>
                <span className="pass-action-plus" aria-hidden="true">
                  +
                </span>
                Home Screen
              </button>
              <button type="button" className="pass-action" onClick={onDownload} disabled={saving}>
                <DownloadIcon className="btn-icon" />
                {saving ? 'Saving…' : 'Download pass'}
              </button>
            </div>
          </div>

          <p className={`pass-toast${toast ? ' is-visible' : ''}`} role="status">
            {toast}
          </p>

          {boosted && (
            <div className="phone-overlay qr-boost" role="dialog" aria-modal="true" aria-label="Boarding pass code, brightness boosted" onClick={closeBoost}>
              <p className="qr-boost-tag">
                <SunIcon className="btn-icon" /> Brightness boosted
              </p>
              <PassQr value={pass.bcbp} title={qrTitle} className="qr-boost-code" />
              <p className="qr-boost-meta">
                <strong>{name}</strong>
                {pass.flightNumber} · {pass.from.code} → {pass.to.code} · Seat {pass.seat} · Zone {pass.zone}
              </p>
              <button ref={boostCloseRef} type="button" className="btn qr-boost-done" onClick={closeBoost}>
                Done
              </button>
            </div>
          )}

          {sheetOpen && (
            <InstallSheet
              onClose={closeSheet}
              canPrompt={canPrompt}
              installed={installed}
              onInstall={() => {
                install().catch(() => undefined);
              }}
            />
          )}
        </div>
      </div>

      <aside className="pass-demo" aria-labelledby="demo-title">
        <p className="eyebrow">Presenter mode</p>
        <h2 id="demo-title">
          <ClockIcon className="btn-icon" /> Time travel
        </h2>
        <p className="muted pass-demo-lead">Slide to preview the pass at any point before departure. The clock keeps ticking from there.</p>
        <label htmlFor="time-travel" className="pass-demo-value">
          {previewing ? formatPreviewOffset(minutesBefore) : 'Live: using the real time now'}
        </label>
        <input
          id="time-travel"
          type="range"
          min={-PREVIEW_MAX}
          max={-PREVIEW_MIN}
          step={1}
          value={sliderValue}
          onChange={(event) => travelTo(-Number(event.target.value))}
          aria-valuetext={previewing ? formatPreviewOffset(minutesBefore) : 'Live time'}
          className="pass-slider"
        />
        <div className="pass-slider-scale" aria-hidden="true">
          <span>3h before</span>
          <span>Departs</span>
        </div>
        <div className="pass-presets" role="group" aria-label="Jump to a moment">
          {PRESETS.map((preset) => (
            <button key={preset.label} type="button" className="pass-chip" onClick={() => travelTo(preset.minutes)}>
              {preset.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost pass-live" onClick={() => setOffset(null)} disabled={!previewing}>
          Back to live time
        </button>
        <dl className="pass-demo-facts">
          <div>
            <dt>Boarding starts</dt>
            <dd>{pass.boards}</dd>
          </div>
          <div>
            <dt>Gate closes</dt>
            <dd>15 min before</dd>
          </div>
          <div>
            <dt>Status now</dt>
            <dd>{ready ? status.label : '…'}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
