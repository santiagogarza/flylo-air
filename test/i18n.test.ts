import { describe, expect, it } from 'vitest';
import {
  createI18n,
  currencyNote,
  formatDisplayDate,
  formatDisplayDuration,
  formatDisplayPrice,
  interpolate,
  isLocale,
  LOCALE_CONFIG,
  LOCALES,
  MESSAGES,
  negotiateLocale,
  type MessageKey,
} from '@/i18n';
import { AIRPORTS } from '@/lib/airports';
import { formatTripDate, searchFlights } from '@/lib/flights';
import { validateCard } from '@/lib/payment';
import { formatCents } from '@/lib/pricing';

const spaces = (text: string | null) => text?.replace(/\s/g, ' ');
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const englishKeys = Object.keys(MESSAGES.en).sort() as MessageKey[];

describe('dictionaries', () => {
  it.each(LOCALES)('%s has exactly the English keys, all filled in', (locale) => {
    const messages = MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(englishKeys);
    for (const key of englishKeys) {
      expect(messages[key].trim(), `${locale}: ${key}`).not.toBe('');
    }
  });

  it.each(LOCALES)('%s keeps the same {placeholders} as English', (locale) => {
    for (const key of englishKeys) {
      expect(placeholders(MESSAGES[locale][key]), `${locale}: ${key}`).toEqual(placeholders(MESSAGES.en[key]));
    }
  });

  it('names every airport city and fare perk', () => {
    const [flight] = searchFlights('SFO', 'JFK', '2026-11-12');
    for (const locale of LOCALES) {
      const i18n = createI18n(locale);
      for (const airport of AIRPORTS) expect(MESSAGES[locale]).toHaveProperty(`city.${airport.code}`);
      for (const fare of flight.fares) {
        fare.perks.forEach((_, index) => expect(MESSAGES[locale]).toHaveProperty(`perk.${fare.key}.${index}`));
        expect(i18n.fare(fare.key)).not.toBe('');
      }
    }
  });

  it('matches the site data in English', () => {
    const i18n = createI18n('en');
    for (const airport of AIRPORTS) expect(i18n.city(airport.code)).toBe(airport.city);
    for (const fare of searchFlights('SFO', 'JFK', '2026-11-12')[0].fares) {
      expect(i18n.fare(fare.key)).toBe(fare.name);
      fare.perks.forEach((perk, index) => expect(i18n.perk(fare.key, index, '')).toBe(perk));
    }
  });

  it('translates every card validation message', () => {
    const messages = [
      ...Object.values(validateCard({ name: '', number: '1', expiry: '', cvc: '' })),
      ...Object.values(validateCard({ name: 'A', number: '4242424242424242', expiry: '01/20', cvc: '123' })),
    ];
    expect(messages).toHaveLength(5);
    for (const message of messages) {
      expect(createI18n('en').error(message)).toBe(message);
      for (const locale of ['es', 'fr', 'ja'] as const) expect(createI18n(locale).error(message)).not.toBe(message);
    }
    expect(createI18n('ja').error('Something new')).toBe('Something new');
  });
});

describe('locale detection', () => {
  it('reads Accept-Language by quality, defaulting to English', () => {
    expect(negotiateLocale('ja-JP,ja;q=0.9,en-US;q=0.8')).toBe('ja');
    expect(negotiateLocale('de-DE,fr-CA;q=0.7,es;q=0.9')).toBe('es');
    expect(negotiateLocale('es-419')).toBe('es');
    expect(negotiateLocale('FR')).toBe('fr');
    expect(negotiateLocale('de-DE,de;q=0.9')).toBe('en');
    expect(negotiateLocale('ja;q=0, fr;q=0.2')).toBe('fr');
    expect(negotiateLocale('')).toBe('en');
    expect(negotiateLocale(null)).toBe('en');
  });

  it('only accepts supported cookie values', () => {
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('formatting', () => {
  it('formats trip dates per locale', () => {
    expect(formatDisplayDate('en', '2026-11-12')).toBe('Thu, Nov 12');
    expect(formatDisplayDate('en', '2026-11-12')).toBe(formatTripDate('2026-11-12'));
    expect(formatDisplayDate('es', '2026-11-12')).toBe('jue 12 de nov');
    expect(formatDisplayDate('fr', '2026-11-12')).toBe('jeu. 12 nov.');
    expect(formatDisplayDate('ja', '2026-11-12')).toBe('11月12日(木)');
  });

  it('formats durations per locale', () => {
    expect(formatDisplayDuration('en', 330)).toBe('5h 30m');
    expect(formatDisplayDuration('en', 120)).toBe('2h');
    expect(formatDisplayDuration('es', 330)).toBe('5 h 30 min');
    expect(formatDisplayDuration('fr', 65)).toBe('1 h 5 min');
    expect(formatDisplayDuration('ja', 330)).toBe('5時間30分');
    expect(formatDisplayDuration('ja', 120)).toBe('2時間');
  });

  it('shows prices in the display currency using the sample rates', () => {
    expect(formatDisplayPrice('en', 12999)).toBe('$129.99');
    expect(spaces(formatDisplayPrice('es', 12999))).toBe('MXN 2,404.82');
    expect(spaces(formatDisplayPrice('fr', 12999))).toBe('119,59 €');
    expect(formatDisplayPrice('ja', 12999)).toBe('￥19,499');
    expect(formatDisplayPrice('ja', 4500)).toBe('￥6,750');
  });

  it('matches the USD formatting exactly in English', () => {
    for (const cents of [0, 999, 12999, 123456]) expect(formatDisplayPrice('en', cents)).toBe(formatCents(cents));
  });

  it('explains that non-USD prices are charged in USD', () => {
    expect(currencyNote('en')).toBeNull();
    expect(spaces(currencyNote('es'))).toBe('Precios en MXN; el cobro se hace en USD. Tipo de cambio de muestra: 1 USD = 18.50 MXN.');
    expect(spaces(currencyNote('fr'))).toBe('Prix affichés en €, débités en USD. Taux d’exemple : 1 USD = 0,92 EUR.');
    expect(currencyNote('ja')).toBe('料金は￥で表示、お支払いは米ドル（USD）です。参考レート：1 USD = 150 JPY');
    expect(Object.values(LOCALE_CONFIG).map((config) => config.currency)).toEqual(['USD', 'MXN', 'EUR', 'JPY']);
  });

  it('picks plural forms and fills placeholders', () => {
    expect(createI18n('en').tc('common.travelers', 1)).toBe('1 traveler');
    expect(createI18n('en').tc('common.travelers', 3)).toBe('3 travelers');
    expect(createI18n('fr').tc('common.travelers', 2)).toBe('2 voyageurs');
    expect(createI18n('ja').tc('common.travelers', 2)).toBe('2名');
    expect(createI18n('es').t('common.route', { from: 'Seattle', to: 'Los Ángeles' })).toBe('De Seattle a Los Ángeles');
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
