/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TENANT_ID?: string;
  readonly VITE_CLIENT_ID?: string;
  readonly VITE_API_SCOPE?: string; // e.g. api://<app-id>/.default or custom scope
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
