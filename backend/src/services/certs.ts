import forge from 'node-forge';
import { v4 as uuid } from 'uuid';
import { getRootCAPrivateKeyPem, getRootCA } from './rootcas.js';
import { record } from './audit.js';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { getTableClient } from '../azure/tableClient.js';
import fs from 'fs';
import path from 'path';

export interface IssuedCert {
  id: string;
  rootCaId: string;
  owner: string;
  displayName: string;
  description?: string;
  certPem: string;
  createdAt: string;
  revokedAt?: string;
  expiresAt?: string;
  sans?: string[]; // Subject Alternative Names (e.g., DNS:foo.example, IP:1.2.3.4)
}

const certsTable = process.env.CERTS_TABLE_NAME;
const revokeTable = process.env.REVOKE_TABLE_NAME;
const kvUri = process.env.KEY_VAULT_URI;
const useLocalSecrets = !kvUri;
// In-memory fallbacks for local dev (no Azure Tables / KeyVault)
const localCerts: IssuedCert[] = [];

// JSON persistence for local dev (no Azure Tables) so certs survive restart
let localLoaded = false;
const dataDir = path.join(process.cwd(), 'data');
const certFile = path.join(dataDir, 'certs.json');
function loadLocalCerts() {
  if (localLoaded || certsTable) return; // only local mode
  localLoaded = true;
  try {
    if (fs.existsSync(certFile)) {
      const parsed = JSON.parse(fs.readFileSync(certFile, 'utf-8')) as IssuedCert[];
      localCerts.splice(0, 0, ...parsed);
    }
  } catch (e) { console.warn('Failed to load local certs', e); }
}
function persistLocalCerts() {
  if (certsTable) return;
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(certFile, JSON.stringify(localCerts, null, 2));
  } catch (e) { console.warn('Failed to persist local certs', e); }
}
loadLocalCerts();
const localSecrets = new Map<string, string>();
let kvClientInstance: SecretClient | undefined;

function kvClient(): SecretClient {
  if (!kvUri) throw new Error('KEY_VAULT_URI not set');
  if (!kvClientInstance) kvClientInstance = new SecretClient(kvUri, new DefaultAzureCredential());
  return kvClientInstance;
}

async function storeCertKey(id: string, keyPem: string) {
  if (useLocalSecrets) { localSecrets.set(`cert-${id}-key`, keyPem); return; }
  try { await kvClient().setSecret(`cert-${id}-key`, keyPem); } catch (err) { console.error('store cert key failed', err); }
}

async function getCertKey(id: string): Promise<string | undefined> {
  if (useLocalSecrets) return localSecrets.get(`cert-${id}-key`);
  try { const s = await kvClient().getSecret(`cert-${id}-key`); return s.value; } catch { return undefined; }
}

export async function issueCertificate(params: { rootCaId: string; displayName: string; description?: string; actor: string; backdateDays?: number; validDays?: number; }): Promise<IssuedCert & { keyPem: string }> {
  const { rootCaId, displayName, description, actor, backdateDays = 0, validDays = 365 } = params;
  const rootMeta = await getRootCA(rootCaId);
  if (!rootMeta) throw new Error('Root CA not found');
  const rootKeyPem = await getRootCAPrivateKeyPem(rootCaId);
  if (!rootKeyPem) throw new Error('Root CA key unavailable');
  const rootCert = forge.pki.certificateFromPem(rootMeta.certPem);
  const rootKey = forge.pki.privateKeyFromPem(rootKeyPem);
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = new Date().getTime().toString(16);
  const now = new Date();
  const notBefore = new Date(now.getTime() - backdateDays * 24 * 60 * 60 * 1000);
  const notAfter = new Date(notBefore.getTime() + validDays * 24 * 60 * 60 * 1000);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  const subjAttrs = [{ name: 'commonName', value: displayName }];
  cert.setSubject(subjAttrs);
  cert.setIssuer(rootCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(rootKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const id = uuid();
  const createdAt = notBefore.toISOString();
  // Extract SANs (none expected in generate mode unless future enhancement adds them)
  let sans: string[] | undefined;
  try {
    const sanExt = (cert as any).getExtension ? (cert as any).getExtension('subjectAltName') : undefined;
    if (sanExt && Array.isArray(sanExt.altNames)) {
      sans = sanExt.altNames.map((n: any) => {
        if (n.type === 2) return `DNS:${n.value}`; // DNS
        if (n.type === 7) return `IP:${n.ip || n.value}`; // IP
        if (n.type === 1) return `EMAIL:${n.value}`; // RFC822
        return undefined;
      }).filter(Boolean) as string[];
    }
  } catch {}
  const out: IssuedCert = { id, rootCaId, owner: actor, displayName, description, certPem, createdAt, sans };
  if (certsTable) {
    try {
      const tc = getTableClient(certsTable);
      await tc.createEntity({ partitionKey: actor, rowKey: id, rootCaId, displayName, description, createdAt, certPem });
    } catch (err) { console.error('persist cert failed', err); }
  } else {
    localCerts.push(out);
    persistLocalCerts();
  }
  await storeCertKey(id, keyPem);
  record({ actor, action: 'cert.issue', targetType: 'cert', targetId: id, details: { rootCaId, displayName } });
  return { ...out, keyPem };
}

export async function issueCertificateFromCSR(params: { rootCaId: string; csrPem: string; actor: string; displayName?: string; description?: string; backdateDays?: number; validDays?: number; }): Promise<IssuedCert> {
  const { rootCaId, csrPem, actor, description, backdateDays = 0, validDays = 365 } = params;
  let { displayName } = params;
  const rootMeta = await getRootCA(rootCaId);
  if (!rootMeta) throw new Error('Root CA not found');
  const rootKeyPem = await getRootCAPrivateKeyPem(rootCaId);
  if (!rootKeyPem) throw new Error('Root CA key unavailable');
  // Parse CSR
  let csr: any;
  try { csr = forge.pki.certificationRequestFromPem(csrPem); } catch { throw new Error('Invalid CSR PEM'); }
  if (!csr.verify()) throw new Error('CSR signature invalid');
  if (!displayName) {
  const cnAttr = csr.subject.attributes.find((a: any) => a.name === 'commonName');
    if (!cnAttr || !cnAttr.value) throw new Error('displayName missing and CSR has no commonName');
    displayName = String(cnAttr.value);
  }
  if (displayName.length > 100) throw new Error('displayName too long (max 100)');
  if (!/^[\w .,'()\-]+$/u.test(displayName)) throw new Error('displayName has invalid characters');
  const rootCert = forge.pki.certificateFromPem(rootMeta.certPem);
  const rootKey = forge.pki.privateKeyFromPem(rootKeyPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey;
  cert.serialNumber = new Date().getTime().toString(16);
  const now = new Date();
  const notBefore = new Date(now.getTime() - backdateDays * 24 * 60 * 60 * 1000);
  const notAfter = new Date(notBefore.getTime() + validDays * 24 * 60 * 60 * 1000);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  // Use CSR subject directly
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer(rootCert.subject.attributes);
  // Basic extensions; SANs or others would need parsing from CSR attributes (future enhancement)
  const extensions: any[] = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'subjectKeyIdentifier' }
  ];
  try {
    // CSR may contain an extensionRequest attribute with extensions (incl. subjectAltName)
    const extReq = csr.getAttribute && csr.getAttribute({ name: 'extensionRequest' });
    if (extReq && Array.isArray(extReq.extensions)) {
      const san = extReq.extensions.find((e: any) => e.name === 'subjectAltName');
      if (san && Array.isArray(san.altNames)) {
        // Whitelist & constrain SAN entries
        const altNames = san.altNames.filter((n: any) => ['DNS','IP','RFC822'].includes(n.type === 2 ? 'DNS' : n.type === 7 ? 'IP' : n.type === 1 ? 'RFC822' : ''))
          .slice(0, 50);
        if (altNames.length) {
          // Map node-forge CSR altNames to certificate extension altNames
            const mapped = san.altNames.map((n: any) => {
              if (n.type === 2) return { type: 2, value: n.value }; // DNS
              if (n.type === 7) return { type: 7, ip: n.ip || n.value }; // IP
              if (n.type === 1) return { type: 1, value: n.value }; // RFC822 email
              return undefined;
            }).filter(Boolean);
          if (mapped.length) extensions.push({ name: 'subjectAltName', altNames: mapped });
        }
      }
    }
  } catch (err) { console.warn('CSR SAN parse failed', err); }
  cert.setExtensions(extensions);
  cert.sign(rootKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  const id = uuid();
  const createdAt = notBefore.toISOString();
  // Extract SANs from extensions we set
  let sans: string[] | undefined;
  try {
    const sanExt = (cert as any).getExtension ? (cert as any).getExtension('subjectAltName') : undefined;
    if (sanExt && Array.isArray(sanExt.altNames)) {
      sans = sanExt.altNames.map((n: any) => {
        if (n.type === 2) return `DNS:${n.value}`;
        if (n.type === 7) return `IP:${n.ip || n.value}`;
        if (n.type === 1) return `EMAIL:${n.value}`;
        return undefined;
      }).filter(Boolean) as string[];
    }
  } catch {}
  const out: IssuedCert = { id, rootCaId, owner: actor, displayName, description, certPem, createdAt, sans };
  if (certsTable) {
    try {
      const tc = getTableClient(certsTable);
      await tc.createEntity({ partitionKey: actor, rowKey: id, rootCaId, displayName, description, createdAt, certPem });
    } catch (err) { console.error('persist cert failed', err); }
  } else {
    localCerts.push(out);
    persistLocalCerts();
  }
  record({ actor, action: 'cert.issue', targetType: 'cert', targetId: id, details: { rootCaId, displayName, method: 'csr' } });
  return out;
}

export async function listCertificates(opts: { actor: string; isAdmin: boolean }): Promise<IssuedCert[]> {
  if (!certsTable) {
    loadLocalCerts();
    const mine = opts.isAdmin ? localCerts : localCerts.filter(c => c.owner === opts.actor);
    return [...mine].map(c => {
      if (!c.expiresAt || !c.sans) {
        try {
          const parsed = forge.pki.certificateFromPem(c.certPem);
          if (!c.expiresAt) c.expiresAt = parsed.validity.notAfter.toISOString();
          if (!c.sans) {
            const sanExt = (parsed as any).getExtension && (parsed as any).getExtension('subjectAltName');
            if (sanExt && Array.isArray(sanExt.altNames)) {
              c.sans = sanExt.altNames.map((n: any) => {
                if (n.type === 2) return `DNS:${n.value}`;
                if (n.type === 7) return `IP:${n.ip || n.value}`;
                if (n.type === 1) return `EMAIL:${n.value}`;
                return undefined;
              }).filter(Boolean) as string[];
            }
          }
        } catch {}
      }
      return c;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const tc = getTableClient(certsTable);
  const items: IssuedCert[] = [];
  if (opts.isAdmin) {
    for await (const ent of tc.listEntities()) {
  items.push({ id: ent.rowKey as string, rootCaId: ent.rootCaId as string, owner: ent.partitionKey as string, displayName: ent.displayName as string, description: ent.description as string | undefined, certPem: ent.certPem as string, createdAt: ent.createdAt as string });
    }
  } else {
    for await (const ent of tc.listEntities({ queryOptions: { filter: `PartitionKey eq '${opts.actor}'` } })) {
  items.push({ id: ent.rowKey as string, rootCaId: ent.rootCaId as string, owner: ent.partitionKey as string, displayName: ent.displayName as string, description: ent.description as string | undefined, certPem: ent.certPem as string, createdAt: ent.createdAt as string });
    }
  }
  if (revokeTable) {
    try {
      const rtc = getTableClient(revokeTable);
      const revoked: Record<string, string> = {};
      for await (const ent of rtc.listEntities({ queryOptions: { filter: "PartitionKey eq 'revoked'" } })) {
        revoked[ent.rowKey as string] = ent.revokedAt as string;
      }
      items.forEach(i => { if (revoked[i.id]) i.revokedAt = revoked[i.id]; });
    } catch (err) { console.error('merge revocations failed', err); }
  }
  items.forEach(i => {
    if (!i.expiresAt || !i.sans) {
      try {
        const parsed = forge.pki.certificateFromPem(i.certPem);
        if (!i.expiresAt) i.expiresAt = parsed.validity.notAfter.toISOString();
        if (!i.sans) {
          const sanExt = (parsed as any).getExtension && (parsed as any).getExtension('subjectAltName');
          if (sanExt && Array.isArray(sanExt.altNames)) {
            i.sans = sanExt.altNames.map((n: any) => {
              if (n.type === 2) return `DNS:${n.value}`;
              if (n.type === 7) return `IP:${n.ip || n.value}`;
              if (n.type === 1) return `EMAIL:${n.value}`;
              return undefined;
            }).filter(Boolean) as string[];
          }
        }
      } catch {}
    }
  });
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCertificate(id: string): Promise<IssuedCert | undefined> {
  if (!certsTable) { loadLocalCerts(); return localCerts.find(c => c.id === id); }
  const tc = getTableClient(certsTable);
  for await (const ent of tc.listEntities()) {
    if (ent.rowKey === id) {
  const cert: IssuedCert = { id: ent.rowKey as string, rootCaId: ent.rootCaId as string, owner: ent.partitionKey as string, displayName: ent.displayName as string, description: ent.description as string | undefined, certPem: ent.certPem as string, createdAt: ent.createdAt as string };
      if (revokeTable) {
        try {
          const rtc = getTableClient(revokeTable);
          const rev = await rtc.getEntity('revoked', id);
          cert.revokedAt = rev.revokedAt as string;
        } catch { /* not revoked */ }
      }
  try {
    const parsed = forge.pki.certificateFromPem(cert.certPem);
    cert.expiresAt = parsed.validity.notAfter.toISOString();
    const sanExt = (parsed as any).getExtension ? (parsed as any).getExtension('subjectAltName') : undefined;
    if (sanExt && Array.isArray(sanExt.altNames)) {
      cert.sans = sanExt.altNames.map((n: any) => {
        if (n.type === 2) return `DNS:${n.value}`;
        if (n.type === 7) return `IP:${n.ip || n.value}`;
        if (n.type === 1) return `EMAIL:${n.value}`;
        return undefined;
      }).filter(Boolean) as string[];
    }
  } catch {}
      return cert;
    }
  }
  return undefined;
}

export async function revokeCertificate(id: string, actor: string) {
  // If a revoke table is configured (Azure mode), persist revocation there.
  if (revokeTable) {
    const rtc = getTableClient(revokeTable);
    const revokedAt = new Date().toISOString();
    // fetch certificate metadata to enrich audit (may be undefined if not found)
    const certMeta = await getCertificate(id);
    await rtc.upsertEntity({ partitionKey: 'revoked', rowKey: id, revokedAt });
    record({ actor, action: 'cert.revoke', targetType: 'cert', targetId: id, details: { revokedAt, displayName: certMeta?.displayName, rootCaId: certMeta?.rootCaId } });
    return revokedAt;
  }
  // Local fallback (no Azure revoke table): mark in local certs JSON.
  if (!certsTable) {
    loadLocalCerts();
    const cert = localCerts.find(c => c.id === id);
    if (!cert) throw new Error('Certificate not found');
    if (!cert.revokedAt) {
      cert.revokedAt = new Date().toISOString();
      persistLocalCerts();
      record({ actor, action: 'cert.revoke', targetType: 'cert', targetId: id, details: { revokedAt: cert.revokedAt, displayName: cert.displayName, rootCaId: cert.rootCaId } });
    }
    return cert.revokedAt!;
  }
  // We are in Azure cert storage mode but no revoke table configured: treat as unsupported.
  throw new Error('Revocation not supported: REVOKE_TABLE_NAME not configured');
}
