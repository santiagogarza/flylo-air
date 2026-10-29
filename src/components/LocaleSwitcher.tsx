'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, GlobeIcon } from '@/components/icons';
import { useI18n, useLocaleSwitch } from '@/i18n/client';
import { LOCALE_CONFIG, LOCALES, type Locale } from '@/i18n/config';

export function LocaleSwitcher() {
  const { t } = useI18n();
  const { locale, pendingLocale, switching, setLocale } = useLocaleSwitch();
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const onSupport = pathname.startsWith('/support');
  const current = LOCALE_CONFIG[pendingLocale];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const count = LOCALES.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };

  const openMenu = (focusIndex: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => focusItem(focusIndex));
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const choose = (next: Locale) => {
    close();
    if (next !== locale) setLocale(next);
  };

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu(LOCALES.indexOf(locale));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(LOCALES.length - 1);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = itemRefs.current.findIndex((item) => item === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(LOCALES.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (event.key.length === 1) {
          const match = LOCALES.findIndex((code) => code.startsWith(event.key.toLowerCase()));
          if (match >= 0) focusItem(match);
        }
    }
  };

  return (
    <div className="locale-switcher" ref={rootRef} data-open={open ? '' : undefined}>
      <button
        ref={buttonRef}
        type="button"
        className="locale-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('locale.button', { name: current.nativeName })}
        aria-busy={switching || undefined}
        onClick={() => (open ? close() : openMenu(LOCALES.indexOf(locale)))}
        onKeyDown={onButtonKeyDown}
      >
        <GlobeIcon className={`locale-globe${switching ? ' is-spinning' : ''}`} />
        <span className="locale-name" lang={pendingLocale}>
          {current.nativeName}
        </span>
        <span className="locale-code" aria-hidden="true">
          {pendingLocale.toUpperCase()}
        </span>
        <ChevronDownIcon className="locale-chevron" />
      </button>

      <div className="locale-popover" hidden={!open}>
        <p className="locale-heading" aria-hidden="true">
          {t('locale.menu')}
        </p>
        <div id={menuId} role="menu" aria-label={t('locale.menu')} onKeyDown={onMenuKeyDown}>
          {LOCALES.map((code, index) => {
            const config = LOCALE_CONFIG[code];
            const active = code === pendingLocale;
            return (
              <button
                key={code}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                tabIndex={-1}
                lang={code}
                className="locale-option"
                onClick={() => choose(code)}
              >
                <span className="locale-option-code" aria-hidden="true">
                  {code.toUpperCase()}
                </span>
                <span className="locale-option-name">{config.nativeName}</span>
                <span className="locale-option-currency" aria-hidden="true">
                  {config.currency}
                </span>
                <CheckIcon className="locale-option-check" />
              </button>
            );
          })}
        </div>
        {onSupport && <p className="locale-note">{t('locale.supportNote')}</p>}
      </div>

      <span className="visually-hidden" role="status">
        {switching ? t('locale.switching') : ''}
      </span>
    </div>
  );
}
