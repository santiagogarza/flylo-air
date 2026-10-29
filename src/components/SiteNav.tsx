'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Book', match: (path: string) => path === '/' || path.startsWith('/results') || path.startsWith('/checkout') },
  { href: '/trips', label: 'Manage trip', match: (path: string) => path.startsWith('/trips') },
  { href: '/support/', label: 'Support', match: (path: string) => path.startsWith('/support') },
];

export function SiteNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={link.match(pathname) ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
