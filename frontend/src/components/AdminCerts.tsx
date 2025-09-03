import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Cert, RootCA } from '../types';
import { useFocusTrap, useSort } from './hooks';
import { formatDT, StatusIcon, certStatus, SortIcon } from './utils';
import { useToast } from '../toast';

const pageSize = 25;

const AdminCerts: React.FC = () => {
  const toast = useToast();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [rootCAs, setRootCAs] = useState<RootCA[]>([]);
  const [viewingCert, setViewingCert] = useState<Cert | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [filterOwner, setFilterOwner] = useState('');
  const [filterRoot, setFilterRoot] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterName, setFilterName] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [owners, setOwners] = useState<string[]>([]);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const adminDetailRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!!viewingCert, adminDetailRef, () => setViewingCert(null));
  const sortCtl = useSort({ sort: 'createdAt', dir: 'desc' });

  const loadRoots = async () => { const { data } = await axios.get('/api/rootcas'); setRootCAs(data.items); };
  const buildParams = (cursor?: string) => { const params: any = { limit: pageSize, sort: sortCtl.sort, dir: sortCtl.dir }; if (cursor) params.cursor = cursor; if (filterOwner) params.user = filterOwner; if (filterRoot) params.rootCa = filterRoot; if (filterStatus) params.status = filterStatus; if (filterName) params.name = filterName; return params; };
  const load = async (cursor?: string, reset=false) => { setLoadingList(true); try { const params = buildParams(cursor); const { data } = await axios.get('/api/certs', { params }); setCerts(prev => (cursor && !reset) ? [...prev, ...data.items] : data.items); setNextCursor(data.nextCursor); } finally { setLoadingList(false); } };
  const populateOwners = async () => { try { const { data } = await axios.get('/api/certs', { params: { limit: 500 } }); const uniq = Array.from(new Set<string>(data.items.map((c: Cert)=>c.owner))).sort(); setOwners(uniq); } catch {/* ignore */} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoots(); load(); populateOwners(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(undefined, true); }, [filterOwner, filterRoot, filterStatus, filterName]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(undefined, true); }, [sortCtl.sort, sortCtl.dir]);
  const openView = async (id: string) => { const { data } = await axios.get(`/api/certs/${id}`); setViewingCert(data); };
  const revoke = async (id: string) => { try { const { data } = await axios.post(`/api/certs/${id}/revoke`); const when = data.revokedAt || new Date().toISOString(); setCerts(prev => prev.map(c => c.id===id?{...c, revokedAt: when}:c)); if (viewingCert?.id===id) setViewingCert({ ...viewingCert, revokedAt: when }); toast({ type: 'success', message: 'Certificate revoked.' }); } catch (e: any) { toast({ type: 'error', message: e?.response?.data?.error || 'Revoke failed' }); } };
  const resetFilters = () => { setFilterOwner(''); setFilterRoot(''); setFilterStatus(''); setFilterName(''); };

  return <div className="space-y-4">
    <div>
      <h2 className="text-xl font-medium">All Certificates</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">All issued certificates across every root CA (admin view).</p>
    </div>
    <div className="flex flex-wrap gap-3 items-end text-xs">
      <div className="flex flex-col">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">User</label>
        <select value={filterOwner} onChange={e=>setFilterOwner(e.target.value)} className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <option value="">All</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Root CA</label>
        <select value={filterRoot} onChange={e=>setFilterRoot(e.target.value)} className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <option value="">All</option>
          {rootCAs.map(rc => <option key={rc.id} value={rc.id}>{rc.displayName}</option>)}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</label>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Name</label>
        <input value={filterName} onChange={e=>setFilterName(e.target.value)} placeholder="Search name" className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" />
      </div>
      <button onClick={resetFilters} className="h-7 px-3 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">Reset</button>
      {loadingList && <span className="text-gray-500">Loading...</span>}
    </div>
    <div className="overflow-auto border rounded bg-white dark:bg-gray-950 shadow border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <tr className="select-none">
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('owner')}>User<SortIcon active={sortCtl.sort==='owner'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('displayName')}>Name<SortIcon active={sortCtl.sort==='displayName'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('rootCaId')}>Root CA<SortIcon active={sortCtl.sort==='rootCaId'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('createdAt')}>Created<SortIcon active={sortCtl.sort==='createdAt'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('expiresAt')}>Expires<SortIcon active={sortCtl.sort==='expiresAt'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('status')}>Status<SortIcon active={sortCtl.sort==='status'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2">Download</th>
            <th className="text-left p-2">View</th>
          </tr>
        </thead>
        <tbody>
          {certs.map(c => <tr key={c.id} className="border-t border-gray-200 dark:border-gray-700"><td className="p-2">{c.owner}</td><td className="p-2">{c.displayName}</td><td className="p-2 text-xs">{rootCAs.find(rc => rc.id===c.rootCaId)?.displayName || c.rootCaId}</td><td className="p-2">{formatDT(c.createdAt)}</td><td className="p-2">{formatDT(c.expiresAt)}</td><td className="p-2"><StatusIcon cert={c} /></td><td className="p-2 space-x-2">{!c.revokedAt ? (<><a href={`/api/certs/${c.id}/pem`} className="text-xs text-indigo-600 hover:underline" download>PEM</a><a href={`/api/certs/${c.id}/bundle`} className="text-xs text-indigo-600 hover:underline" download>Bundle</a></>) : (<span className="text-[10px] text-gray-400 dark:text-gray-600 italic" title="Downloads disabled for revoked certificates">Revoked</span>)}</td><td className="p-2"><button onClick={() => openView(c.id)} className="text-xs text-indigo-600 hover:underline">View</button></td></tr>)}
        </tbody>
      </table>
    </div>
    {nextCursor && <div><button onClick={() => load(nextCursor)} className="px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700">Load more</button></div>}
    {viewingCert && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setViewingCert(null)} />
        <div ref={adminDetailRef} role="dialog" aria-modal="true" aria-labelledby="admin-cert-detail-title" className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 space-y-4">
          <h3 id="admin-cert-detail-title" className="text-lg font-semibold">Certificate Details</h3>
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
            {!viewingCert.revokedAt && !confirmRevoke && <button onClick={() => setConfirmRevoke(true)} className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-500">Revoke</button>}
            {!viewingCert.revokedAt && confirmRevoke && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-600 dark:text-red-400 font-medium">Confirm?</span>
                <button onClick={() => { revoke(viewingCert.id); setConfirmRevoke(false); }} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500">Yes</button>
                <button onClick={() => setConfirmRevoke(false)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">No</button>
              </div>
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
  </div>;
};

export default AdminCerts;
