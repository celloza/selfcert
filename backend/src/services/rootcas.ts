import forge from 'node-forge';
import { v4 as uuid } from 'uuid';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { getTableClient } from '../azure/tableClient.js';
import fs from 'fs';
import path from 'path';

// Env configuration
const kvUri = process.env.KEY_VAULT_URI; // Azure Key Vault URI (e.g. https://mykv.vault.azure.net/)
const tableName = process.env.ROOTCAS_TABLE_NAME;

// Local development fallback (in-memory secret store) when KEY_VAULT_URI is not provided.
// This lets developers run the API & create root CAs without provisioning Azure resources.
const useLocalSecrets = !kvUri;
const localSecrets = new Map<string, string>();
let secretClientInstance: SecretClient | undefined;
// In-memory metadata store fallback when no table configured.
const localRootCAs: RootCAMetadata[] = [];

// Lightweight JSON persistence for local dev so data survives process restarts
let rootPersistLoaded = false;
const dataDir = path.join(process.cwd(), 'data');
const rootFile = path.join(dataDir, 'rootcas.json');
function loadLocalRootCAs() {
  if (rootPersistLoaded || tableName) return; // only when not using table storage
  rootPersistLoaded = true;
  try {
    if (fs.existsSync(rootFile)) {
      const parsed = JSON.parse(fs.readFileSync(rootFile, 'utf-8')) as RootCAMetadata[];
      localRootCAs.splice(0, 0, ...parsed);
    }
  } catch (e) {
    console.warn('Failed to load local root CAs', e);
  }
}
function persistLocalRootCAs() {
  if (tableName) return; // only persist when using local mode
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(rootFile, JSON.stringify(localRootCAs, null, 2));
  } catch (e) {
    console.warn('Failed to persist local root CAs', e);
  }
}
loadLocalRootCAs();

async function setSecret(name: string, value: string) {
  if (useLocalSecrets) {
    localSecrets.set(name, value);
    return;
  }
  if (!secretClientInstance) {
    secretClientInstance = new SecretClient(kvUri!, new DefaultAzureCredential());
  }
  await secretClientInstance.setSecret(name, value);
}

async function getSecret(name: string): Promise<string | undefined> {
  if (useLocalSecrets) {
    return localSecrets.get(name);
  }
  if (!secretClientInstance) {
    secretClientInstance = new SecretClient(kvUri!, new DefaultAzureCredential());
  }
  try {
    const s = await secretClientInstance.getSecret(name);
    return s.value;
  } catch {
    return undefined;
  }
}

interface RootCAMetadata {
  id: string;
  displayName: string;
  createdAt: string;
  certPem: string;
  notBefore?: string;
  notAfter?: string;
  sans?: string[];
  fingerprintSha256?: string;
  keyAlgorithm?: string;
  keySize?: number;
}

export async function createRootCA(displayName: string): Promise<RootCAMetadata> {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = new Date().getTime().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);
  const attrs = [{ name: 'commonName', value: displayName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true },
    { name: 'subjectKeyIdentifier' }
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const id = uuid();
  await setSecret(`rootca-${id}-key`, keyPem);
  await setSecret(`rootca-${id}-cert`, certPem);
  const meta: RootCAMetadata = { id, displayName, createdAt: new Date().toISOString(), certPem,
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    sans: [],
    fingerprintSha256: fingerprintCert(cert),
    keyAlgorithm: 'RSA',
    keySize: (keys.publicKey as any).n?.bitLength?.() || 2048
  };
  if (tableName) {
    try {
      const tc = getTableClient(tableName);
      await tc.createEntity({ partitionKey: 'rootca', rowKey: id, displayName, createdAt: meta.createdAt, certPem });
    } catch (e) {
      console.error('Failed to persist root CA metadata', e);
    }
  } else {
    localRootCAs.push(meta);
    persistLocalRootCAs();
  }
  return meta;
}

export async function importRootCA(params: { displayName: string; certPem: string; keyPem: string }): Promise<RootCAMetadata> {
  const { displayName, certPem, keyPem } = params;
  // Parse certificate & key, validate self-signed CA and key match
  let cert: forge.pki.Certificate;
  let priv: forge.pki.PrivateKey;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch (e) {
    throw new Error('certPem invalid');
  }
  try {
    priv = forge.pki.privateKeyFromPem(keyPem);
  } catch (e) {
    throw new Error('keyPem invalid');
  }
  // public key match
  const pubFromKey = forge.pki.setRsaPublicKey((priv as any).n, (priv as any).e);
  const sameMod = (cert.publicKey as any).n?.toString(16) === pubFromKey.n?.toString(16);
  if (!sameMod) throw new Error('key does not match certificate public key');
  // self-signed check
  const subjectStr = cert.subject.attributes.map(a => a.name + '=' + a.value).join(',');
  const issuerStr = cert.issuer.attributes.map(a => a.name + '=' + a.value).join(',');
  if (subjectStr !== issuerStr) throw new Error('certificate is not self-signed');
  // verify signature with its own public key
  const verified = cert.verify(cert);
  if (!verified) throw new Error('certificate signature verification failed');
  // basic constraints CA
  const bc = cert.getExtension('basicConstraints');
  if (!bc || !(bc as any).cA) throw new Error('certificate is not a CA (basicConstraints cA=true missing)');
  // store
  const id = uuid();
  await setSecret(`rootca-${id}-key`, forge.pki.privateKeyToPem(priv));
  await setSecret(`rootca-${id}-cert`, certPem);
  const meta: RootCAMetadata = { id, displayName, createdAt: new Date().toISOString(), certPem: forge.pki.certificateToPem(cert),
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    sans: extractSANs(cert),
    fingerprintSha256: fingerprintCert(cert),
    keyAlgorithm: cert.publicKey && (cert.publicKey as any).n ? 'RSA' : 'Unknown',
    keySize: (cert.publicKey as any).n?.bitLength?.()
  };
  if (tableName) {
    try {
      const tc = getTableClient(tableName);
      await tc.createEntity({ partitionKey: 'rootca', rowKey: id, displayName, createdAt: meta.createdAt, certPem: meta.certPem });
    } catch (e) {
      console.error('Failed to persist imported root CA metadata', e);
    }
  } else {
    localRootCAs.push(meta);
    persistLocalRootCAs();
  }
  return meta;
}

export async function listRootCAs(): Promise<RootCAMetadata[]> {
  if (!tableName) {
    loadLocalRootCAs();
    return [...localRootCAs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  try {
    const tc = getTableClient(tableName);
    const out: RootCAMetadata[] = [];
    for await (const ent of tc.listEntities({ queryOptions: { filter: "PartitionKey eq 'rootca'" } })) {
      const base: RootCAMetadata = { id: ent.rowKey as string, displayName: ent.displayName as string, createdAt: ent.createdAt as string, certPem: ent.certPem as string };
      // derive lightweight validity / fingerprint without extra GET per root
      try {
        const cert = forge.pki.certificateFromPem(base.certPem);
        base.notBefore = cert.validity.notBefore.toISOString();
        base.notAfter = cert.validity.notAfter.toISOString();
      } catch {/* ignore parse errors */}
      out.push(base);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function getRootCA(id: string): Promise<RootCAMetadata | undefined> {
  if (!tableName) {
    loadLocalRootCAs();
    const found = localRootCAs.find(r => r.id === id);
    if (!found) return undefined;
    // derive extras if missing
    if (!found.notBefore || !found.notAfter || !found.fingerprintSha256) {
      try {
        const cert = forge.pki.certificateFromPem(found.certPem);
        found.notBefore = cert.validity.notBefore.toISOString();
        found.notAfter = cert.validity.notAfter.toISOString();
        found.sans = extractSANs(cert);
        found.fingerprintSha256 = fingerprintCert(cert);
        found.keyAlgorithm = cert.publicKey && (cert.publicKey as any).n ? 'RSA' : 'Unknown';
        found.keySize = (cert.publicKey as any).n?.bitLength?.();
      } catch {/* ignore parse issues */}
    }
    return found;
  }
  try {
    const tc = getTableClient(tableName);
    const ent: any = await tc.getEntity('rootca', id);
    const meta: RootCAMetadata = { id, displayName: ent.displayName, createdAt: ent.createdAt, certPem: ent.certPem };
    try {
      const cert = forge.pki.certificateFromPem(meta.certPem);
      meta.notBefore = cert.validity.notBefore.toISOString();
      meta.notAfter = cert.validity.notAfter.toISOString();
      meta.sans = extractSANs(cert);
      meta.fingerprintSha256 = fingerprintCert(cert);
      meta.keyAlgorithm = cert.publicKey && (cert.publicKey as any).n ? 'RSA' : 'Unknown';
      meta.keySize = (cert.publicKey as any).n?.bitLength?.();
    } catch {/* ignore */}
    return meta;
  } catch {
    return undefined;
  }
}

export async function getRootCAPrivateKeyPem(id: string): Promise<string | undefined> {
  return getSecret(`rootca-${id}-key`);
}

// helper: extract SANs from certificate
function extractSANs(cert: forge.pki.Certificate): string[] {
  try {
    const ext: any = cert.getExtension && cert.getExtension('subjectAltName');
    if (!ext || !Array.isArray(ext.altNames)) return [];
    return ext.altNames.map((a: any) => {
      switch (a.type) {
        case 2: return `DNS:${a.value}`; // dNSName
        case 7: return `IP:${a.ip}`; // iPAddress
        case 1: return `email:${a.value}`; // rfc822Name
        default: return a.value || '';
      }
    }).filter(Boolean);
  } catch { return []; }
}

function fingerprintCert(cert: forge.pki.Certificate): string {
  try {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    const hex = md.digest().toHex().toUpperCase();
    return hex.match(/.{2}/g)?.join(':') || hex;
  } catch { return ''; }
}
