import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/icons';
import { LocaleMain } from '@/components/LocaleMain';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { SiteNav } from '@/components/SiteNav';
import { I18nProvider } from '@/i18n/client';
import { getI18n } from '@/i18n/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: {
      default: t('meta.title'),
      template: '%s · FlyLo-Air',
    },
    description: t('meta.description'),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#0b2545',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale}>
          <a className="skip-link" href="#main">
            {t('layout.skip')}
          </a>
          <header className="site-header">
            <div className="wrap">
              <Link href="/" className="brand" aria-label={t('layout.home')}>
                <LogoMark className="brand-mark" />
                <span className="brand-text">
                  FlyLo<span className="brand-air">-Air</span>
                </span>
              </Link>
              <div className="header-actions">
                <SiteNav />
                <LocaleSwitcher />
              </div>
            </div>
          </header>
          <LocaleMain>{children}</LocaleMain>
          <footer className="site-footer">
            <div className="wrap">
              <p>
                <span className="sample-badge">{t('footer.badge')}</span>
                {t('footer.note')}
              </p>
              <p>
                <Link href="/support/">{t('footer.contact')}</Link>
              </p>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
