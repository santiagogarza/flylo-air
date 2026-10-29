'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useOptimistic, useTransition } from 'react';
import { createI18n, LOCALE_COOKIE, type I18n, type Locale } from './index';

type I18nContextValue = {
  i18n: I18n;
  /** The locale the visitor just picked, shown while the page re-renders in it. */
  pendingLocale: Locale;
  switching: boolean;
  setLocale: (next: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const [switching, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useOptimistic(locale);
  const i18n = useMemo(() => createI18n(locale), [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      startTransition(() => {
        setPendingLocale(next);
        router.refresh();
      });
    },
    [router, setPendingLocale],
  );

  const value = useMemo(() => ({ i18n, pendingLocale, switching, setLocale }), [i18n, pendingLocale, switching, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>.');
  return value;
}

export function useI18n(): I18n {
  return useI18nContext().i18n;
}

export function useLocaleSwitch() {
  const { i18n, pendingLocale, switching, setLocale } = useI18nContext();
  return { locale: i18n.locale, pendingLocale, switching, setLocale };
}
