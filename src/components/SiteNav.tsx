'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/config';

const LINKS: { href: string; label: MessageKey; match: (path: string) => boolean }[] = [
  { href: '/', label: 'nav.book', match: (path: string) => path === '/' || path.startsWith('/results') || path.startsWith('/checkout') },
  { href: '/support/', label: 'nav.support', match: (path: string) => path.startsWith('/support') },
];

export function SiteNav() {
  const pathname = usePathname() ?? '/';
  const { t } = useI18n();
  return (
    <nav className="site-nav" aria-label={t('nav.label')}>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={link.match(pathname) ? 'page' : undefined}>
          {t(link.label)}
        </Link>
      ))}
    </nav>
  );
}
