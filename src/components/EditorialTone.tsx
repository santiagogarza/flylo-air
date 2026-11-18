'use client';

import { useEffect } from 'react';

/** Paints the shared page chrome when a scenario uses the editorial theme. */
export function EditorialTone({ editorial }: { editorial: boolean }) {
  useEffect(() => {
    if (!editorial) return;
    document.body.classList.add('intake-editorial-page');
    return () => document.body.classList.remove('intake-editorial-page');
  }, [editorial]);
  return null;
}
