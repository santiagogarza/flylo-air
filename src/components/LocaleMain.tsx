'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { useLocaleSwitch } from '@/i18n/client';

/** The page's <main>: dims while a new language loads, then eases the translated content in. */
export function LocaleMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { locale, switching } = useLocaleSwitch();
  const ref = useRef<HTMLElement>(null);
  const shown = useRef(locale);

  useLayoutEffect(() => {
    if (shown.current === locale) return;
    shown.current = locale;
    if (!ref.current?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ref.current.animate(
      [
        { opacity: 0.35, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
  }, [locale]);

  return (
    <main
      id="main"
      tabIndex={-1}
      ref={ref}
      // Support is English-only, whatever language the rest of the site is in.
      lang={pathname.startsWith('/support') ? 'en' : undefined}
      data-switching={switching ? '' : undefined}
    >
      {children}
    </main>
  );
}
