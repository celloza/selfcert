import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Cert, RootCA } from '../types';
import { useAuth } from '../auth';
import { formatDT, StatusIcon, certStatus } from './utils';
import { useFocusTrap } from './hooks';
import { useToast } from '../toast';

const pageSize = 50;

const MyCerts: React.FC = () => {
  const { account, isAdmin } = useAuth() as any;
  const toast = useToast();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [rootCAs, setRootCAs] = useState<RootCA[]>([]);
  const [viewingCert, setViewingCert] = useState<Cert | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rootCaId, setRootCaId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  // For non-admins validity is fixed (180 days). Admins choose preset months (6/12/18) or blank for backend default.
  const [validDays, setValidDays] = useState<number | ''>(isAdmin ? '' : 180);
  const [backdateDays, setBackdateDays] = useState<number | ''>('');
  const detailRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLFormElement>(null);
  useFocusTrap(!!viewingCert, detailRef, () => setViewingCert(null));
  useFocusTrap(showCreate, createRef, () => setShowCreate(false));

  const loadRoots = async () => { const { data } = await axios.get('/api/rootcas'); setRootCAs(data.items); };
  const load = async (cursor?: string) => {
    setLoading(true);
    try {
      const params: any = { limit: pageSize };
      if (cursor) params.cursor = cursor;
      const { data } = await axios.get('/api/certs', { params });
      const items: Cert[] = data.items;
      const mine = account ? items.filter(c => c.owner === account.username) : items;
      setCerts(prev => cursor ? [...prev, ...mine] : mine);
      setNextCursor(data.nextCursor);
    } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoots(); load(); }, [account?.username]);
  const openView = async (id: string) => { const { data } = await axios.get(`/api/certs/${id}`); if (!account || data.owner === account.username) setViewingCert(data); };

  const resetForm = () => { setRootCaId(''); setDisplayName(''); setDescription(''); setValidDays(isAdmin ? '' : 180); setBackdateDays(''); };
  const openCreate = () => { resetForm(); setShowCreate(true); };
  const closeCreate = () => { if (!creating) setShowCreate(false); };
  const canSubmit = !!rootCaId && !!displayName.trim() && !!description.trim() && (!validDays || (typeof validDays === 'number' && validDays >= 1 && validDays <= 1095)) && (!backdateDays || (typeof backdateDays === 'number' && backdateDays >= 0 && backdateDays <= 30));
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setCreating(true);
    try {
      const body: any = { rootCaId, displayName: displayName.trim() };
  body.description = description.trim();
  if (validDays) body.validDays = validDays; // for non-admin fixed 180 preset
  if (isAdmin && backdateDays) body.backdateDays = backdateDays; // only admins may backdate
      const { data } = await axios.post('/api/certs', body);
      setCerts(prev => [data, ...prev]);
      toast({ type: 'success', message: 'Certificate issued.' });
      setShowCreate(false);
    } catch (err: any) {
      toast({ type: 'error', message: err?.response?.data?.error || 'Issue failed' });
    } finally { setCreating(false); }
  };

  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <h2 className="text-xl font-medium">My Certificates</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Certificates issued to <span className="font-semibold">{account?.username || 'guest (preview)'}</span>.</p>
      </div>
  {!!rootCAs.length && <button onClick={openCreate} className="inline-flex items-center justify-center rounded bg-indigo-600 hover:bg-indigo-500 text-white h-9 w-9 text-lg font-bold" aria-label="Issue Certificate">+</button>}
    </div>
    <div className="overflow-auto border rounded bg-white dark:bg-gray-950 shadow border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"><tr><th className="text-left p-2">Name</th><th className="text-left p-2">Root CA</th><th className="text-left p-2">Created</th><th className="text-left p-2">Expires</th><th className="text-left p-2">Status</th><th className="text-left p-2">Download</th><th className="text-left p-2">View</th></tr></thead>
        <tbody>{certs.map(c => <tr key={c.id} className="border-t border-gray-200 dark:border-gray-700"><td className="p-2">{c.displayName}</td><td className="p-2 text-xs">{rootCAs.find(rc => rc.id===c.rootCaId)?.displayName || c.rootCaId}</td><td className="p-2">{formatDT(c.createdAt)}</td><td className="p-2">{formatDT(c.expiresAt)}</td><td className="p-2"><StatusIcon cert={c} /></td><td className="p-2 space-x-2">{!c.revokedAt ? (<><a href={`/api/certs/${c.id}/pem`} className="text-xs text-indigo-600 hover:underline" download>PEM</a><a href={`/api/certs/${c.id}/bundle`} className="text-xs text-indigo-600 hover:underline" download>Bundle</a></>) : (<span className="text-[10px] text-gray-400 dark:text-gray-600 italic" title="Downloads disabled for revoked certificates">Revoked</span>)}</td><td className="p-2"><button onClick={() => openView(c.id)} className="text-xs text-indigo-600 hover:underline">View</button></td></tr>)}</tbody>
      </table>
    </div>
    {nextCursor && <div><button disabled={loading} onClick={() => load(nextCursor)} className="px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-40">Load more</button></div>}
    {loading && !certs.length && <div className="text-xs text-gray-500">Loading...</div>}
  {viewingCert && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setViewingCert(null)} />
        <div ref={detailRef} role="dialog" aria-modal="true" aria-labelledby="cert-detail-title" className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 space-y-4">
          <h3 id="cert-detail-title" className="text-lg font-semibold">Certificate Details</h3>
          <div className="text-xs grid grid-cols-3 gap-2">
            <div className="font-semibold text-gray-500 dark:text-gray-400">Name</div><div className="col-span-2 break-words">{viewingCert.displayName}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">ID</div><div className="col-span-2 font-mono break-all">{viewingCert.id}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Root CA</div><div className="col-span-2 break-words">{rootCAs.find(rc => rc.id === viewingCert.rootCaId)?.displayName || viewingCert.rootCaId}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Created</div><div className="col-span-2">{formatDT(viewingCert.createdAt)}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Expires</div><div className="col-span-2">{formatDT(viewingCert.expiresAt)}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Status</div><div className="col-span-2 flex items-center gap-2"><StatusIcon cert={viewingCert} /><span className="text-xs text-gray-600 dark:text-gray-400">{certStatus(viewingCert)}</span></div>
            {viewingCert.description && <><div className="font-semibold text-gray-500 dark:text-gray-400">Description</div><div className="col-span-2 break-words">{viewingCert.description}</div></>}
            {Array.isArray(viewingCert.sans) && viewingCert.sans.length > 0 && <><div className="font-semibold text-gray-500 dark:text-gray-400">SANs</div><div className="col-span-2 break-words space-y-1">{viewingCert.sans.map((s,i)=><span key={i} className="inline-block px-2 py-0.5 mr-1 mb-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">{s}</span>)}</div></>}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            {!viewingCert.revokedAt ? (
              <>
                <a href={`/api/certs/${viewingCert.id}/pem`} className="px-3 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500" download>Download PEM</a>
                <a href={`/api/certs/${viewingCert.id}/bundle`} className="px-3 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500" download>Download Bundle</a>
              </>
            ) : (
              <span className="text-[10px] text-gray-500 dark:text-gray-400 italic" title="Downloads disabled for revoked certificates">Downloads disabled</span>
            )}
            <button onClick={() => setViewingCert(null)} className="ml-auto px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">Close</button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-indigo-600">Show PEM</summary>
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto max-h-60 whitespace-pre-wrap break-all text-[10px]">{viewingCert.certPem}</pre>
          </details>
        </div>
      </div>
    )}
    {showCreate && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={closeCreate} />
        <form ref={createRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="issue-cert-title" className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 space-y-5">
          <h3 id="issue-cert-title" className="text-lg font-semibold">Issue Certificate</h3>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Root CA</label>
            <select value={rootCaId} onChange={e=>setRootCaId(e.target.value)} required className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm">
              <option value="">Select root...</option>
              {rootCAs.filter(rc => !rc.notAfter || new Date(rc.notAfter) > new Date()) // exclude expired
                .map(rc => <option key={rc.id} value={rc.id}>{rc.displayName}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Display Name</label>
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={100} required placeholder="e.g. Laptop Auth 2025" className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm" />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} required maxLength={500} rows={3} className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-xs" placeholder="Purpose or device info (required)" />
          </div>
          {isAdmin ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Validity</label>
                <select value={validDays === '' ? '' : String(validDays)} onChange={e=>setValidDays(e.target.value===''?'' : Number(e.target.value))} className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm">
                  <option value="">Default profile</option>
                  <option value={180}>6 months (180d)</option>
                  <option value={365}>12 months (365d)</option>
                  <option value={540}>18 months (540d)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Backdate (days)</label>
                <input type="number" min={0} max={30} value={backdateDays} onChange={e=>setBackdateDays(e.target.value===''?'':Number(e.target.value))} className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm" placeholder="0" />
                <p className="text-[10px] text-gray-500 dark:text-gray-500">0-30 for clock skew tolerance.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <p>Validity fixed at 180 days.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeCreate} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700" disabled={creating}>Cancel</button>
            <button type="submit" disabled={!canSubmit || creating} className="px-4 py-2 rounded bg-indigo-600 disabled:opacity-40 text-white text-sm hover:bg-indigo-500">{creating ? 'Issuing...' : 'Issue'}</button>
          </div>
        </form>
      </div>
    )}
  </div>;
};

export default MyCerts;
