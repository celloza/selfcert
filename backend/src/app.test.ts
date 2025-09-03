import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from './index.js';
import { clearAllRootCAs, createRootCA, listRootCAs, getRootCAPrivateKeyPem } from './services/rootcas.js';
import { issueCertificate, listCertificates, revokeCertificate, issueCertificateFromCSR } from './services/certs.js';
import forge from 'node-forge';
import { record, query } from './services/audit.js';

// Helper to create CSR
function generateCSR(commonName: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([{ name: 'commonName', value: commonName }]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);
  return { csrPem, keys };
}

describe('Backend API & services integration', () => {
  let rootId: string;
  let certId: string;

  beforeAll(async () => {
    clearAllRootCAs();
    const root = await createRootCA('Test Root');
    rootId = root.id;
  });

  it('lists root CAs via HTTP', async () => {
    const res = await request(app).get('/api/rootcas');
    expect(res.status).toBe(200);
    expect(res.body.items.some((r: any) => r.id === rootId)).toBe(true);
  });

  it('has persisted private key for root', async () => {
    const key = await getRootCAPrivateKeyPem(rootId);
    expect(key).toMatch(/BEGIN RSA PRIVATE KEY/);
  });

  it('issues certificate (generated key path)', async () => {
    const res = await request(app)
      .post('/api/certs')
      .send({ rootCaId: rootId, displayName: 'Device One', description: 'Test cert', backdateDays: 0, validDays: 30 });
    expect(res.status).toBe(201);
    certId = res.body.id;
    expect(res.body.certPem).toMatch(/BEGIN CERTIFICATE/);
  });

  it('fetches certificate JSON', async () => {
    const res = await request(app).get(`/api/certs/${certId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(certId);
  });

  it('issues certificate from CSR', async () => {
    const { csrPem } = generateCSR('CSR Device');
    const res = await request(app)
      .post('/api/certs/csr')
      .send({ rootCaId: rootId, csrPem, displayName: 'CSR Device', validDays: 10 });
    expect(res.status).toBe(201);
    expect(res.body.method).toBe('csr');
  });

  it('lists certs for user via service layer', async () => {
    const certs = await listCertificates({ actor: 'demo-user', isAdmin: true });
    expect(certs.length).toBeGreaterThan(0);
  });

  it('revokes certificate via HTTP', async () => {
    const res = await request(app).post(`/api/certs/${certId}/revoke`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('revoked');
  });

  it('records and queries audit events (service layer)', async () => {
    await record({ actor: 'tester', action: 'custom.event', targetType: 'x', targetId: 'y', details: { displayName: 'Custom' } });
    const results = await query({ user: 'tester' });
    expect(results.items.some(i => i.action === 'custom.event')).toBe(true);
  });

  it('downloads cert PEM bundle', async () => {
    const res = await request(app).get(`/api/certs/${certId}/bundle`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/BEGIN CERTIFICATE/);
  });
});
