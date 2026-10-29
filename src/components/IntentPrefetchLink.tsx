'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch' | 'onMouseEnter' | 'onFocus' | 'onTouchStart'> & { href: string };

// Prefetches when someone heads for the link (hover, focus, touch) instead of as soon as it is
// in the viewport. Used for links to the support page, which carries the voice call code.
export function IntentPrefetchLink({ href, ...props }: Props) {
  const router = useRouter();
  const prefetch = () => router.prefetch(href);
  return <Link {...props} href={href} prefetch={false} onMouseEnter={prefetch} onFocus={prefetch} onTouchStart={prefetch} />;
}
