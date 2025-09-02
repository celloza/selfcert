import { useEffect, useState } from 'react';
import React from 'react';

export function useFocusTrap(active: boolean, ref: React.RefObject<HTMLElement>, onEscape?: () => void) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current; if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex='-1'])"))
      .filter(n => !n.hasAttribute('disabled') && n.offsetParent !== null);
    const first = getFocusable()[0]; if (first) first.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onEscape && onEscape(); }
      if (e.key === 'Tab') {
        const items = getFocusable(); if (!items.length) return;
        let idx = items.indexOf(document.activeElement as HTMLElement);
        if (idx === -1) idx = 0;
        idx = (idx + (e.shiftKey ? -1 : 1) + items.length) % items.length;
        items[idx].focus(); e.preventDefault();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => { document.removeEventListener('keydown', handler, true); if (prev?.focus) prev.focus(); };
  }, [active, ref, onEscape]);
}

export function useSort(initial: { sort: string; dir: 'asc' | 'desc' }) {
  const [sort, setSort] = useState(initial.sort);
  const [dir, setDir] = useState<'asc' | 'desc'>(initial.dir);
  const toggle = (col: string) => { if (col === sort) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSort(col); setDir('asc'); } };
  return { sort, dir, toggle };
}