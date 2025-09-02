import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { RootCA } from '../types';
import { useFocusTrap } from './hooks';
import { formatDT } from './utils';
import { useToast } from '../toast';

const RootCAs: React.FC = () => {
  const toast = useToast();
  const [rootcas, setRootcas] = useState<RootCA[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [viewingRoot, setViewingRoot] = useState<RootCA | null>(null);
  const [mode, setMode] = useState<'generate'|'import'>('generate');
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  const createRootRef = useRef<HTMLFormElement>(null);
  const rootDetailRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showCreate, createRootRef, () => closeModal());
  useFocusTrap(!!viewingRoot, rootDetailRef, () => setViewingRoot(null));

  const load = async () => { const { data } = await axios.get('/api/rootcas'); setRootcas(data.items); };
  const [fetchedDetails, setFetchedDetails] = useState<Set<string>>(new Set());
  // lazily enrich each root CA with validity if not provided by list endpoint
  useEffect(() => {
    const missing = rootcas.filter(rc => !rc.notAfter && !fetchedDetails.has(rc.id));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(missing.map(rc => axios.get(`/api/rootcas/${rc.id}`).then(r => r.data).catch(() => null)));
        if (cancelled) return;
        setRootcas(prev => prev.map(rc => {
          const upd = results.find(r => r && r.id === rc.id);
            return upd ? { ...rc, notAfter: upd.notAfter, notBefore: upd.notBefore } : rc;
        }));
        setFetchedDetails(prev => new Set([...Array.from(prev), ...missing.map(m => m.id)]));
      } catch {/* ignore enrichment errors */}
    })();
    return () => { cancelled = true; };
  }, [rootcas, fetchedDetails]);
  useEffect(() => { load(); }, []);
  const openModal = () => { setDisplayName(''); setCertPem(''); setKeyPem(''); setMode('generate'); setShowCreate(true); };
  const closeModal = () => { if (!creating) setShowCreate(false); };
  const create = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!displayName.trim()) return;
    if (mode === 'import' && (!certPem.trim() || !keyPem.trim())) return;
    setCreating(true);
    try {
      if (mode === 'generate') {
        await axios.post('/api/rootcas', { displayName: displayName.trim() });
      } else {
        await axios.post('/api/rootcas/import', { displayName: displayName.trim(), certPem: certPem.trim(), keyPem: keyPem.trim() });
      }
      await load();
      toast({ type: 'success', message: mode==='generate' ? 'Root CA created.' : 'Root CA imported.' });
      setShowCreate(false);
    } catch (err: any) { toast({ type: 'error', message: err?.response?.data?.error || 'Create failed' }); }
    finally { setCreating(false); }
  };
  const openView = async (id: string) => { const { data } = await axios.get(`/api/rootcas/${id}`); setViewingRoot(data); };

  return <div className="space-y-4 relative">
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <h2 className="text-xl font-medium">Root Certification Authorities</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Active internal trust anchors used for issuing end-entity certificates.</p>
      </div>
      <button onClick={openModal} className="inline-flex items-center justify-center rounded bg-indigo-600 hover:bg-indigo-500 text-white h-9 w-9 text-lg font-bold" aria-label="Create Root CA">+</button>
    </div>
    <div className="overflow-auto border rounded bg-white dark:bg-gray-950 shadow border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <tr>
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">ID</th>
            <th className="text-left p-2">Created</th>
            <th className="text-left p-2">Expires</th>
            <th className="text-left p-2">View</th>
          </tr>
        </thead>
        <tbody>
          {rootcas.map(rc => (
            <tr key={rc.id} className="border-t border-gray-200 dark:border-gray-700">
              <td className="p-2">{rc.displayName}</td>
              <td className="p-2 font-mono text-xs">{rc.id}</td>
              <td className="p-2 text-xs">{formatDT(rc.createdAt)}</td>
              <td className="p-2 text-xs" title={rc.notAfter || ''}>{formatDT(rc.notAfter)}</td>
              <td className="p-2"><button onClick={() => openView(rc.id)} className="text-xs text-indigo-600 hover:underline">View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {showCreate && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
        <form ref={createRootRef} onSubmit={create} role="dialog" aria-modal="true" aria-labelledby="create-root-title" className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 space-y-5">
          <h3 id="create-root-title" className="text-lg font-semibold">Create Root CA</h3>
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="text-gray-500 dark:text-gray-400">Mode:</span>
            <div role="radiogroup" aria-label="Root CA Mode" className="flex gap-2">
              <button type="button" onClick={()=>setMode('generate')} className={`px-2 py-1 rounded border text-xs ${mode==='generate' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`} aria-pressed={mode==='generate'}>Generate</button>
              <button type="button" onClick={()=>setMode('import')} className={`px-2 py-1 rounded border text-xs ${mode==='import' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`} aria-pressed={mode==='import'}>Import</button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Display Name</label>
            <input autoFocus className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm" placeholder="e.g. Corporate Root 2025" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          {mode==='import' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Certificate (PEM)</label>
                <textarea rows={10} className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-[11px] font-mono" placeholder="-----BEGIN CERTIFICATE-----" value={certPem} onChange={e=>setCertPem(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Private Key (PEM)</label>
                <textarea rows={10} className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-[11px] font-mono" placeholder="-----BEGIN PRIVATE KEY-----" value={keyPem} onChange={e=>setKeyPem(e.target.value)} />
              </div>
              <p className="md:col-span-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">Certificate must be a self-signed CA with basicConstraints cA=true and match provided private key. Key is stored securely and never displayed again.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700" disabled={creating}>Cancel</button>
            <button type="submit" disabled={!displayName.trim() || creating || (mode==='import' && (!certPem.trim() || !keyPem.trim()))} className="px-4 py-2 rounded bg-indigo-600 disabled:opacity-40 text-white text-sm hover:bg-indigo-500">{creating ? (mode==='import' ? 'Importing...' : 'Creating...') : (mode==='import' ? 'Import' : 'Create')}</button>
          </div>
        </form>
      </div>
    )}
    {viewingRoot && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setViewingRoot(null)} />
        <div ref={rootDetailRef} role="dialog" aria-modal="true" aria-labelledby="root-detail-title" className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 space-y-4">
          <h3 id="root-detail-title" className="text-lg font-semibold">Root CA Details</h3>
          <div className="text-xs grid grid-cols-3 gap-2">
            <div className="font-semibold text-gray-500 dark:text-gray-400">Name</div><div className="col-span-2 break-words">{viewingRoot.displayName}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">ID</div><div className="col-span-2 font-mono break-all">{viewingRoot.id}</div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Created</div><div className="col-span-2">{formatDT(viewingRoot.createdAt)}</div>
            {viewingRoot.notBefore && viewingRoot.notAfter && <>
              <div className="font-semibold text-gray-500 dark:text-gray-400">Validity</div>
              <div className="col-span-2 break-words">{formatDT(viewingRoot.notBefore)} → {formatDT(viewingRoot.notAfter)}</div>
            </>}
            {Array.isArray(viewingRoot.sans) && viewingRoot.sans.length > 0 && <>
              <div className="font-semibold text-gray-500 dark:text-gray-400">SANs</div>
              <div className="col-span-2 break-words space-y-1">{viewingRoot.sans.map((s,i)=><span key={i} className="inline-block px-2 py-0.5 mr-1 mb-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">{s}</span>)}</div>
            </>}
            {viewingRoot.keyAlgorithm && <>
              <div className="font-semibold text-gray-500 dark:text-gray-400">Key</div>
              <div className="col-span-2 break-words">{viewingRoot.keyAlgorithm}{viewingRoot.keySize ? ` ${viewingRoot.keySize}-bit` : ''}</div>
            </>}
            {viewingRoot.fingerprintSha256 && <>
              <div className="font-semibold text-gray-500 dark:text-gray-400">SHA-256</div>
              <div className="col-span-2 font-mono break-all text-[10px]">{viewingRoot.fingerprintSha256}</div>
            </>}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href={`/api/rootcas/${viewingRoot.id}/pem`} className="px-3 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500" download>Download PEM</a>
            <button onClick={() => setViewingRoot(null)} className="ml-auto px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">Close</button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-indigo-600">Show PEM</summary>
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto max-h-60 whitespace-pre-wrap break-all text-[10px]">{viewingRoot.certPem}</pre>
          </details>
        </div>
      </div>
    )}
  </div>;
};

export default RootCAs;
