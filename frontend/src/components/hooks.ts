import { useEffect, useState, useRef } from 'react';
import React from 'react';

export function useFocusTrap(active: boolean, ref: React.RefObject<HTMLElement>, onEscape?: () => void) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape; // keep latest handler without re-running trap
  const prevActiveEl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) {
      // restore focus when deactivating
      if (prevActiveEl.current && typeof prevActiveEl.current.focus === 'function') {
        prevActiveEl.current.focus();
      }
      prevActiveEl.current = null;
      return;
    }
    const el = ref.current; if (!el) return;
    prevActiveEl.current = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex='-1'])"))
      .filter(n => !n.hasAttribute('disabled') && n.offsetParent !== null);
    // Focus the first focusable ONLY once when trap activates
    const first = getFocusable()[0]; if (first) first.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); escapeRef.current && escapeRef.current(); }
      if (e.key === 'Tab') {
        const items = getFocusable(); if (!items.length) return;
        let idx = items.indexOf(document.activeElement as HTMLElement);
        if (idx === -1) idx = 0;
        idx = (idx + (e.shiftKey ? -1 : 1) + items.length) % items.length;
        items[idx].focus(); e.preventDefault();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => { document.removeEventListener('keydown', handler, true); };
  }, [active, ref]);
}

export function useSort(initial: { sort: string; dir: 'asc' | 'desc' }) {
  const [sort, setSort] = useState(initial.sort);
  const [dir, setDir] = useState<'asc' | 'desc'>(initial.dir);
  const toggle = (col: string) => { if (col === sort) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSort(col); setDir('asc'); } };
  return { sort, dir, toggle };
}