import React from 'react';
import { AuditEvent, Cert } from '../types';

export const formatDT = (v?: string) => { if (!v) return ''; try { return new Date(v).toLocaleString(); } catch { return v; } };
export const certStatus = (c: { revokedAt?: string; expiresAt?: string }) => c.revokedAt ? 'Revoked' : (c.expiresAt && new Date(c.expiresAt) < new Date() ? 'Expired' : 'Active');
export const auditStatus = (ev: AuditEvent) => {
  if (ev.action === 'cert.issue') return 'Issued';
  if (ev.action === 'cert.revoke') return 'Revoked';
  return ev.action;
};

export const StatusIcon: React.FC<{ cert: Cert | { revokedAt?: string; expiresAt?: string }; className?: string }> = ({ cert, className }) => {
  const status = certStatus(cert);
  const map: Record<string, { cls: string; glyph: string }> = {
    Revoked: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', glyph: '✖' },
    Expired: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', glyph: '⌛' },
    Active: { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', glyph: '✓' }
  };
  const { cls, glyph } = map[status];
  return <span title={status} aria-label={status} className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${cls} ${className || ''}`}>{glyph}</span>;
};

export const SortIcon: React.FC<{ active: boolean; dir: 'asc' | 'desc' }> = ({ active, dir }) => <span className={`inline-block ml-1 text-[10px] ${active ? 'opacity-80' : 'opacity-20 group-hover:opacity-60'}`}>{dir === 'asc' ? '▲' : '▼'}</span>;