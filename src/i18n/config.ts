import type { en } from './messages/en';

export const LOCALES = ['en', 'es', 'fr', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'flylo-locale';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export type LocaleConfig = {
  nativeName: string;
  intl: string;
  currency: 'USD' | 'MXN' | 'EUR' | 'JPY';
  currencyDisplay: 'symbol' | 'code';
  /** Fixed sample exchange rate from USD, for display only. */
  usdRate: number;
};

export const LOCALE_CONFIG: Record<Locale, LocaleConfig> = {
  en: { nativeName: 'English', intl: 'en-US', currency: 'USD', currencyDisplay: 'symbol', usdRate: 1 },
  es: { nativeName: 'Español', intl: 'es-MX', currency: 'MXN', currencyDisplay: 'code', usdRate: 18.5 },
  fr: { nativeName: 'Français', intl: 'fr-FR', currency: 'EUR', currencyDisplay: 'symbol', usdRate: 0.92 },
  ja: { nativeName: '日本語', intl: 'ja-JP', currency: 'JPY', currencyDisplay: 'symbol', usdRate: 150 },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported locale from an Accept-Language header, falling back to English. */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)).find(Boolean);
      return { base: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q[1]) : 1, index };
    })
    .filter((entry) => entry.base && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const match = ranked.find((entry) => isLocale(entry.base))?.base;
  return isLocale(match) ? match : DEFAULT_LOCALE;
}
