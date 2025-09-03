import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AuditEvent } from '../types';
import { useSort } from './hooks';
import { auditStatus, formatDT, SortIcon } from './utils';

const pageSize = 50;

const AuditLog: React.FC = () => {
  const [items, setItems] = useState<AuditEvent[]>([]);
  // Store last used cursor (no read needed)
  const setCursor = (_v: string | undefined) => { /* no-op holder */ };
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [userFilter, setUserFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const sortCtl = useSort({ sort: 'ts', dir: 'desc' });
  const load = async (c?: string, reset=false) => {
    setLoading(true);
    try {
      const params: any = { limit: pageSize, sort: sortCtl.sort, dir: sortCtl.dir };
      if (c) params.cursor = c;
      if (userFilter) params.user = userFilter;
      if (nameFilter) params.name = nameFilter;
      const { data } = await axios.get('/api/audit', { params });
      setItems(reset ? data.items : [...items, ...data.items]);
      setNextCursor(data.nextCursor);
      setCursor(c);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(undefined, true); }, [userFilter, nameFilter, sortCtl.sort, sortCtl.dir]);
  const reset = () => { setUserFilter(''); setNameFilter(''); };
  return <div className="space-y-4">
    <h2 className="text-xl font-medium">Audit Log</h2>
    <div className="flex gap-3 flex-wrap items-end text-xs">
      <div className="flex flex-col">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">User</label>
        <input className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" placeholder="Filter user" value={userFilter} onChange={e => setUserFilter(e.target.value)} />
      </div>
      <div className="flex flex-col">
        <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Display Name</label>
        <input className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" placeholder="Filter name" value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
      </div>
      <button onClick={reset} className="h-7 px-3 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">Reset</button>
      {loading && <span className="text-gray-500">Loading...</span>}
    </div>
    <div className="overflow-auto border rounded bg-white dark:bg-gray-950 shadow border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <tr className="select-none">
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('ts')}>Time<SortIcon active={sortCtl.sort==='ts'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('actor')}>User<SortIcon active={sortCtl.sort==='actor'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2 cursor-pointer group" onClick={() => sortCtl.toggle('action')}>Action<SortIcon active={sortCtl.sort==='action'} dir={sortCtl.dir} /></th>
            <th className="text-left p-2">Target</th>
            <th className="text-left p-2">Certificate Name</th>
          </tr>
        </thead>
        <tbody>
          {items.map(ev => <tr key={ev.id} className="border-t border-gray-200 dark:border-gray-700"><td className="p-2 whitespace-nowrap">{formatDT(ev.ts)}</td><td className="p-2">{ev.actor}</td><td className="p-2">{auditStatus(ev)}</td><td className="p-2">{ev.targetType}:{ev.targetId}</td><td className="p-2">{ev.details?.displayName || ''}</td></tr>)}
        </tbody>
      </table>
    </div>
    {nextCursor && <button className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 px-3 py-1 rounded" onClick={() => load(nextCursor)}>Load more</button>}
  </div>;
};

export default AuditLog;
