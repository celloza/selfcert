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

interface AuthState { account?: AccountInfo; token?: string; isAdmin: boolean; loading: boolean; login: () => Promise<void>; logout: () => void; }
const AuthCtx = createContext<AuthState>({ isAdmin: false, loading: false, login: async () => {}, logout: () => {} });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountInfo | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!pca);
  const [initialized, setInitialized] = useState(!pca); // if no pca needed
  const [isAdmin, setIsAdmin] = useState(false);

  async function acquire() {
    if (!pca || !initialized) { setLoading(false); return; }
    const accts = pca.getAllAccounts();
    const acct = accts[0];
    if (!acct) { setLoading(false); return; }
    setAccount(acct);
    try {
      const silent = await pca.acquireTokenSilent({ account: acct, scopes: scopes.length ? scopes : [clientId + '/.default'] });
      setToken(silent.accessToken);
      const roles = (silent.idTokenClaims as any)?.roles || [];
      setIsAdmin(Array.isArray(roles) && roles.map((r: any) => String(r).toLowerCase()).includes('admin'));
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const inter = await pca.acquireTokenPopup({ scopes: scopes.length ? scopes : [clientId + '/.default'] });
        setToken(inter.accessToken);
        const roles = (inter.idTokenClaims as any)?.roles || [];
        setIsAdmin(Array.isArray(roles) && roles.map((r: any) => String(r).toLowerCase()).includes('admin'));
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
    const roles = (res.idTokenClaims as any)?.roles || [];
    setIsAdmin(Array.isArray(roles) && roles.map((r: any) => String(r).toLowerCase()).includes('admin'));
    await acquire();
  };
  const logout = () => { if (pca) pca.logoutPopup(); setAccount(undefined); setToken(undefined); };

  return <AuthCtx.Provider value={{ account, token, isAdmin, loading, login, logout }}>{children}</AuthCtx.Provider>;
};

export function useAuth() { return useContext(AuthCtx); }
