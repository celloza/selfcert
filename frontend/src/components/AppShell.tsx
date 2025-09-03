import React, { useEffect, useState, useRef } from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import Instructions from '../Instructions';
import { useAuth } from '../auth';
import axios from 'axios';
import MyCerts from './MyCerts';
import AdminCerts from './AdminCerts';
import RootCAs from './RootCAs';
import AuditLog from './AuditLog';
import { useFocusTrap } from './hooks';

// focus trap now imported from hooks

const Home = () => <div className="space-y-4"><h1 className="text-2xl font-semibold">SelfCert Portal</h1><p className="text-gray-600 dark:text-gray-400">Issue and manage client certificates.</p></div>;

const AppShell: React.FC = () => {
  const { account, login, logout, loading, isAdmin, token } = useAuth() as any;
  // Preview mode allows showing admin sections to unauthenticated users for demo.
  // Controlled via VITE_PREVIEW_ALL ("true" enables). Defaults to false.
  const previewAll = (import.meta.env.VITE_PREVIEW_ALL === 'true');
  const uiIsAdmin = isAdmin || (!account && previewAll);
  const [collapsed, setCollapsed] = useState(false);
  const [themePref, setThemePref] = useState<'light'|'dark'|'system'>(() => (localStorage.getItem('themePref') as any) || 'system');
  const [showPrefs, setShowPrefs] = useState(false);
  const prefsRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showPrefs, prefsRef, () => setShowPrefs(false));
  useEffect(() => { if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`; else delete axios.defaults.headers.common['Authorization']; }, [token]);
  const applyTheme = (pref: 'light'|'dark'|'system') => {
    const mode = pref === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.setAttribute('data-theme', mode);
  };
  useEffect(() => { applyTheme(themePref); if (themePref === 'system') { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const h = () => applyTheme('system'); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); } }, [themePref]);
  const updateTheme = (v: 'light'|'dark'|'system') => { localStorage.setItem('themePref', v); setThemePref(v); applyTheme(v); };
  const navItemClass = ({ isActive }: { isActive: boolean }) => `flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${isActive ? 'bg-indigo-600 text-white dark:bg-indigo-500' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`;
  return (
    <div className="h-screen overflow-hidden flex bg-gray-50 dark:bg-gray-900">
      <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all`}>
        <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(c => !c)} className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">
            <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          {!collapsed && <Link to="/" className="block text-sm font-semibold text-indigo-700 dark:text-indigo-400 flex-1">{import.meta.env.VITE_APP_NAME || 'SelfCert'}</Link>}
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <NavLink to="/instructions" className={navItemClass}><span aria-hidden>📘</span>{!collapsed && <span>Instructions</span>}</NavLink>
          <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800" role="separator" />
          {(account || previewAll) && !collapsed && <div className="px-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">User</div>}
          {(account || previewAll) && <NavLink to="/certs" className={navItemClass}><span aria-hidden>🔑</span>{!collapsed && <span>My Certificates</span>}</NavLink>}
          {uiIsAdmin && <>
            <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800" role="separator" />
            {!collapsed && <div className="px-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Administration</div>}
            <NavLink to="/rootcas" className={navItemClass}><span aria-hidden>🏛️</span>{!collapsed && <span>Root CAs</span>}</NavLink>
            <NavLink to="/admin/certs" className={navItemClass}><span aria-hidden>🗂️</span>{!collapsed && <span>All Certificates</span>}</NavLink>
            <NavLink to="/admin/audit" className={navItemClass}><span aria-hidden>📝</span>{!collapsed && <span>Audit Log</span>}</NavLink>
          </>}
        </nav>
        <div className={`border-t border-gray-200 dark:border-gray-800 p-3 text-sm flex flex-col gap-2 ${collapsed ? 'items-center' : ''}`}>
          {loading && <span className="text-gray-500 dark:text-gray-400 text-xs">Auth...</span>}
          {!loading && !account && <button onClick={login} className={`bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white rounded ${collapsed ? 'w-8 h-8 flex items-center justify-center text-xs' : 'w-full px-3 py-2 text-sm flex items-center gap-2'}`}>{collapsed ? '🔐' : <>🔐<span>Login</span></>}</button>}
          {!loading && account && <>
            <div className={`flex flex-col ${collapsed ? 'items-center' : ''}`}>
              <span className={`font-medium text-gray-800 dark:text-gray-100 truncate ${collapsed ? 'text-xs' : ''}`} title={account.username}>{collapsed ? '👤' : account.username}</span>
              {isAdmin && !collapsed && <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">Admin</span>}
            </div>
            <button onClick={logout} className={`bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded ${collapsed ? 'w-8 h-8 flex items-center justify-center text-xs' : 'w-full px-3 py-2 text-sm flex items-center gap-2'}`}>{collapsed ? '⏻' : <>⏻<span>Logout</span></>}</button>
          </>}
          <button onClick={() => window.open('/api/docs','_blank','noopener')} className={`bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded ${collapsed ? 'w-8 h-8 flex items-center justify-center text-[10px]' : 'w-full px-3 py-2 text-xs flex items-center gap-2'}`}>{collapsed ? '📑' : <>📑<span>API Docs</span></>}</button>
          <button onClick={() => setShowPrefs(true)} className={`bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded ${collapsed ? 'w-8 h-8 flex items-center justify-center text-[10px]' : 'w-full px-3 py-2 text-xs flex items-center gap-2'}`}>{collapsed ? '⚙️' : <>⚙️<span>Preferences</span></>}</button>
          {!collapsed && <span className="text-[10px] text-gray-400 dark:text-gray-600">v0.1 UI</span>}
        </div>
      </aside>
      <main className="flex-1 h-screen overflow-y-auto p-8 space-y-8 text-gray-900 dark:text-gray-100">
        <Routes>
          <Route path="/" element={account ? <Home /> : <Instructions />} />
          <Route path="/instructions" element={<Instructions />} />
          <Route path="/certs" element={(account || previewAll) ? <MyCerts /> : <Instructions />} />
          {uiIsAdmin && <Route path="/admin/certs" element={<AdminCerts />} />}
          {uiIsAdmin && <Route path="/rootcas" element={<RootCAs />} />}
          {uiIsAdmin && <Route path="/admin/audit" element={<AuditLog />} />}
        </Routes>
      </main>
      {showPrefs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPrefs(false)} />
          <div ref={prefsRef} role="dialog" aria-modal="true" aria-labelledby="prefs-title" className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-5">
            <h3 id="prefs-title" className="text-lg font-semibold">Preferences</h3>
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium text-gray-700 dark:text-gray-300 mb-1">Theme</legend>
              {['light','dark','system'].map(t => <label key={t} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="theme" value={t} checked={themePref===t} onChange={() => updateTheme(t as any)} /><span>{t==='system'?'System (Auto)':t[0].toUpperCase()+t.slice(1)}</span></label>)}
            </fieldset>
            <div className="flex justify-end pt-2"><button onClick={() => setShowPrefs(false)} className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppShell;
