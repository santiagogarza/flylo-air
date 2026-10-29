'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Book', match: (path: string) => path === '/' || path.startsWith('/results') || path.startsWith('/checkout') },
  { href: '/support/', label: 'Support', match: (path: string) => path.startsWith('/support') },
];

export function SiteNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((link) => {
        const exact = pathname === link.href || `${pathname}/` === link.href;
        const current = link.match(pathname) ? (exact ? 'page' : 'true') : undefined;
        return (
          <Link key={link.href} href={link.href} aria-current={current}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
