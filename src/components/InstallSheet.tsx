'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ShareIcon } from '@/components/icons';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === 'accepted') setInstalled(true);
  };

  return { canPrompt: promptEvent !== null, installed, install };
}

type Props = {
  onClose: () => void;
  canPrompt: boolean;
  installed: boolean;
  onInstall: () => void;
};

export function InstallSheet({ onClose, canPrompt, installed, onInstall }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    setIsApple(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apple = (
    <li key="apple">
      <h3>iPhone or iPad (Safari)</h3>
      <ol>
        <li>
          Tap <ShareIcon className="sheet-inline-icon" /> <strong>Share</strong> in the toolbar.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Tap <strong>Add</strong>. Your pass opens full screen, no browser bars.
        </li>
      </ol>
    </li>
  );
  const android = (
    <li key="android">
      <h3>Android (Chrome)</h3>
      <ol>
        <li>
          Tap the <strong>⋮</strong> menu.
        </li>
        <li>
          Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.
        </li>
        <li>Confirm, then find FlyLo Pass next to your other apps.</li>
      </ol>
    </li>
  );

  return (
    <div className="phone-overlay sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <img src="/boarding-pass/icons/icon-192.png" alt="" width={56} height={56} className="sheet-app-icon" />
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              Add to Home Screen
            </p>
            <h2 id="install-title">Keep your pass one tap away</h2>
          </div>
        </div>
        {installed ? (
          <p className="sheet-done">
            <CheckIcon className="btn-icon" /> You&apos;re all set. FlyLo Pass is on your Home Screen.
          </p>
        ) : (
          <>
            <p className="muted sheet-lead">Open it at the gate in one tap, even when the line is long and your signal isn&apos;t.</p>
            {canPrompt && (
              <button type="button" className="btn sheet-install" onClick={onInstall}>
                Install FlyLo Pass
              </button>
            )}
            <ul className="sheet-steps">{isApple ? [apple, android] : [android, apple]}</ul>
            <p className="sheet-note">On a laptop? Chrome and Edge show an install icon in the address bar.</p>
          </>
        )}
        <button ref={closeRef} type="button" className="btn btn-ghost sheet-close" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
