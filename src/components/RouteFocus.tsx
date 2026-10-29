'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Client-side navigations remove the focused link from the page, which drops keyboard and
// screen reader users back on <body>. Move focus to the new page's heading instead.
export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = document.getElementById('main');
    if (!main || main.contains(document.activeElement)) return;
    const heading = main.querySelector<HTMLElement>('h1');
    const target = heading ?? main;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }, [pathname]);

  return null;
}
