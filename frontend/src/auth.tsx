import React, { createContext, useContext, useEffect, useState } from 'react';
import { PublicClientApplication, InteractionRequiredAuthError, AccountInfo } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_TENANT_ID as string | undefined;
const clientId = import.meta.env.VITE_CLIENT_ID as string | undefined;
const authority = tenantId && clientId ? `https://login.microsoftonline.com/${tenantId}` : undefined;
const scopes = (import.meta.env.VITE_API_SCOPE as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];

const pca = (clientId && authority) ? new PublicClientApplication({
  auth: {
    clientId,
    authority,
    redirectUri: window.location.origin, // ensures reply address matches registered SPA URI
    postLogoutRedirectUri: window.location.origin
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
}) : undefined;

interface AuthState { account?: AccountInfo; token?: string; isAdmin: boolean; loading: boolean; login: () => Promise<void>; logout: () => void; rawRoles: string[]; rawGroups: string[]; }
const AuthCtx = createContext<AuthState>({ isAdmin: false, loading: false, login: async () => {}, logout: () => {}, rawRoles: [], rawGroups: [] });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountInfo | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!pca);
  const [initialized, setInitialized] = useState(!pca); // if no pca needed
  const [isAdmin, setIsAdmin] = useState(false);
  const [rawRoles, setRawRoles] = useState<string[]>([]);
  const [rawGroups, setRawGroups] = useState<string[]>([]);

  function deriveIsAdmin(roles: any, groups: any) {
    const roleList = Array.isArray(roles) ? roles.map(r => String(r)) : [];
    const groupList = Array.isArray(groups) ? groups.map(g => String(g)) : [];
    setRawRoles(roleList);
    setRawGroups(groupList);
    const roleAdmin = roleList.map(r => r.toLowerCase()).includes('admin');
    // Optional: allow group-based admin via env list (comma separated GUIDs)
    const adminGroupIds = (import.meta.env.VITE_ADMIN_GROUP_IDS as string | undefined)?.split(',').map(s=>s.trim()).filter(Boolean) || [];
    const groupAdmin = adminGroupIds.length > 0 && groupList.some(g => adminGroupIds.includes(g));
    setIsAdmin(roleAdmin || groupAdmin);
  }

  function parseAccessTokenClaims(accessToken?: string): { roles?: any; groups?: any } {
    if (!accessToken) return {};
    try {
      const parts = accessToken.split('.'); if (parts.length < 2) return {};
      const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch { return {}; }
  }

  async function acquire() {
    if (!pca || !initialized) { setLoading(false); return; }
    const accts = pca.getAllAccounts();
    const acct = accts[0];
    if (!acct) { setLoading(false); return; }
    setAccount(acct);
    try {
      const silent = await pca.acquireTokenSilent({ account: acct, scopes: scopes.length ? scopes : [clientId + '/.default'] });
      setToken(silent.accessToken);
      let idRoles = (silent.idTokenClaims as any)?.roles || [];
      let idGroups = (silent.idTokenClaims as any)?.groups || [];
      if ((!idRoles || idRoles.length === 0) && (!idGroups || idGroups.length === 0)) {
        const atClaims = parseAccessTokenClaims(silent.accessToken);
        if (Array.isArray(atClaims.roles)) idRoles = atClaims.roles;
        if (Array.isArray(atClaims.groups)) idGroups = atClaims.groups;
      }
      deriveIsAdmin(idRoles, idGroups);
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const inter = await pca.acquireTokenPopup({ scopes: scopes.length ? scopes : [clientId + '/.default'] });
        setToken(inter.accessToken);
        let idRoles = (inter.idTokenClaims as any)?.roles || [];
        let idGroups = (inter.idTokenClaims as any)?.groups || [];
        if ((!idRoles || idRoles.length === 0) && (!idGroups || idGroups.length === 0)) {
          const atClaims = parseAccessTokenClaims(inter.accessToken);
          if (Array.isArray(atClaims.roles)) idRoles = atClaims.roles;
          if (Array.isArray(atClaims.groups)) idGroups = atClaims.groups;
        }
        deriveIsAdmin(idRoles, idGroups);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!pca) { setInitialized(true); return; }
    pca.initialize()
      .then(() => { setInitialized(true); acquire(); })
      .catch((err) => { console.warn('MSAL initialize failed', err); setInitialized(true); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async () => {
    if (!pca) return;
    if (!initialized) return; // still initializing
    const res = await pca.loginPopup({ scopes: scopes.length ? scopes : [clientId + '/.default'] });
    setAccount(res.account || undefined);
    let idRoles = (res.idTokenClaims as any)?.roles || [];
    let idGroups = (res.idTokenClaims as any)?.groups || [];
    if ((!idRoles || idRoles.length === 0) && (!idGroups || idGroups.length === 0)) {
      const atClaims = parseAccessTokenClaims(res.accessToken);
      if (Array.isArray(atClaims.roles)) idRoles = atClaims.roles;
      if (Array.isArray(atClaims.groups)) idGroups = atClaims.groups;
    }
    deriveIsAdmin(idRoles, idGroups);
    await acquire();
  };
  const logout = () => { if (pca) pca.logoutPopup(); setAccount(undefined); setToken(undefined); };

  return <AuthCtx.Provider value={{ account, token, isAdmin, loading, login, logout, rawRoles, rawGroups }}>{children}</AuthCtx.Provider>;
};

export function useAuth() { return useContext(AuthCtx); }
