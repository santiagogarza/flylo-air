import { createElement, Fragment, type ReactNode } from 'react';
import { findAirport } from '@/lib/airports';
import type { FareKey } from '@/lib/flights';
import { LOCALE_CONFIG, type Locale, type MessageKey, type Messages } from './config';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { ja } from './messages/ja';

export * from './config';

export const MESSAGES: Record<Locale, Messages> = { en, es, fr, ja };

type Vars = Record<string, string | number>;
type PluralBase = MessageKey extends infer K ? (K extends `${infer Base}.one` ? Base : never) : never;

export function interpolate(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

const currencyFormatters = new Map<Locale, Intl.NumberFormat>();
const dateFormatters = new Map<Locale, Intl.DateTimeFormat>();

function currencyFormatter(locale: Locale): Intl.NumberFormat {
  let formatter = currencyFormatters.get(locale);
  if (!formatter) {
    const config = LOCALE_CONFIG[locale];
    formatter = new Intl.NumberFormat(config.intl, {
      style: 'currency',
      currency: config.currency,
      currencyDisplay: config.currencyDisplay,
    });
    currencyFormatters.set(locale, formatter);
  }
  return formatter;
}

/** Display-only: converts a USD amount with the locale's fixed sample rate. Charges always stay in USD. */
export function formatDisplayPrice(locale: Locale, usdCents: number): string {
  return currencyFormatter(locale).format((usdCents / 100) * LOCALE_CONFIG[locale].usdRate);
}

export function displayCurrencySymbol(locale: Locale): string {
  return currencyFormatter(locale).formatToParts(0).find((part) => part.type === 'currency')?.value ?? LOCALE_CONFIG[locale].currency;
}

/** The "prices shown in ¥, charged in USD" note, or null when the locale already displays USD. */
export function currencyNote(locale: Locale): string | null {
  const config = LOCALE_CONFIG[locale];
  if (config.currency === 'USD') return null;
  const rate = new Intl.NumberFormat(config.intl, {
    minimumFractionDigits: Number.isInteger(config.usdRate) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(config.usdRate);
  return interpolate(MESSAGES[locale]['currency.note'], { currency: displayCurrencySymbol(locale), rate, code: config.currency });
}

export function formatDisplayDate(locale: Locale, isoDate: string): string {
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE_CONFIG[locale].intl, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${isoDate}T12:00:00Z`));
}

export function formatDisplayDuration(locale: Locale, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const messages = MESSAGES[locale];
  return m ? interpolate(messages['duration.hoursMinutes'], { h, m }) : interpolate(messages['duration.hours'], { h });
}

export function createI18n(locale: Locale) {
  const messages = MESSAGES[locale];
  const plurals = new Intl.PluralRules(LOCALE_CONFIG[locale].intl);
  const t = (key: MessageKey, vars?: Vars) => interpolate(messages[key], vars);
  const lookup = (key: string): string | undefined => (key in messages ? messages[key as MessageKey] : undefined);

  return {
    locale,
    config: LOCALE_CONFIG[locale],
    t,
    /** Plural-aware lookup: `tc('common.travelers', 2)` reads `common.travelers.one` or `.other`. */
    tc: (base: PluralBase, count: number, vars?: Vars) =>
      t(`${base}.${plurals.select(count) === 'one' ? 'one' : 'other'}` as MessageKey, { count, ...vars }),
    /** Like `t`, but `{name}` placeholders can be React nodes (links, emphasis). */
    rich: (key: MessageKey, nodes: Record<string, ReactNode>): ReactNode =>
      messages[key]
        .split(/(\{\w+\})/)
        .filter(Boolean)
        .map((part, index) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          return createElement(Fragment, { key: index }, name && name in nodes ? nodes[name] : part);
        }),
    city: (code: string) => lookup(`city.${code}`) ?? findAirport(code)?.city ?? code,
    fare: (key: FareKey) => t(`fare.${key}`),
    perk: (key: FareKey, index: number, fallback: string) => lookup(`perk.${key}.${index}`) ?? fallback,
    date: (isoDate: string) => formatDisplayDate(locale, isoDate),
    duration: (minutes: number) => formatDisplayDuration(locale, minutes),
    price: (usdCents: number) => formatDisplayPrice(locale, usdCents),
    currencyNote: () => currencyNote(locale),
    /** Translates a known English error from card validation or the checkout API; unknown text passes through. */
    error: (english: string) => {
      const key = ENGLISH_ERRORS.get(english);
      return key ? messages[key] : english;
    },
  };
}

const ENGLISH_ERRORS = new Map(
  (Object.keys(en) as MessageKey[]).filter((key) => key.startsWith('error.')).map((key) => [en[key] as string, key]),
);

export type I18n = ReturnType<typeof createI18n>;
