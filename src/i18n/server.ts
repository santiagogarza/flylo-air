import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { createI18n, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './index';

/** Cookie first, then Accept-Language, then English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return negotiateLocale((await headers()).get('accept-language'));
});

export async function getI18n() {
  return createI18n(await getLocale());
}
