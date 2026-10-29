'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IntentPrefetchLink } from '@/components/IntentPrefetchLink';

const LINKS = [
  { href: '/', label: 'Book', match: (path: string) => path === '/' || path.startsWith('/results') || path.startsWith('/checkout'), prefetchOnIntent: false },
  { href: '/support/', label: 'Support', match: (path: string) => path.startsWith('/support'), prefetchOnIntent: true },
];

export function SiteNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((link) => {
        const NavLink = link.prefetchOnIntent ? IntentPrefetchLink : Link;
        return (
          <NavLink key={link.href} href={link.href} aria-current={link.match(pathname) ? 'page' : undefined}>
            {link.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
