import { Router, Request, Response } from 'express';
import { issueCertificate, issueCertificateFromCSR, listCertificates, getCertificate, revokeCertificate } from '../services/certs.js';
import { getRootCA } from '../services/rootcas.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

// Rate limiter configuration via env or defaults
const issueWindowMs = parseInt(process.env.ISSUE_RATE_LIMIT_WINDOW_MS || '', 10) || 60 * 60 * 1000; // 1h
const issueMax = parseInt(process.env.ISSUE_RATE_LIMIT_MAX || '', 10) || 10; // 10 issues/hour
const revokeWindowMs = parseInt(process.env.REVOKE_RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000; // 15m
const revokeMax = parseInt(process.env.REVOKE_RATE_LIMIT_MAX || '', 10) || 5; // 5 revokes/15m

const issueRateLimit = createRateLimiter({ windowMs: issueWindowMs, max: issueMax, action: 'issue' });
const revokeRateLimit = createRateLimiter({ windowMs: revokeWindowMs, max: revokeMax, action: 'revoke' });

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).user?.sub || 'unknown';
  const isAdmin = ((req as any).user?.roles || []).includes('admin');
  const limit = Math.min(parseInt(req.query.limit as string) || 25, 500);
  const cursor = req.query.cursor as string | undefined;
  const userFilter = (req.query.user as string | undefined)?.trim();
  const rootFilter = (req.query.rootCa as string | undefined)?.trim();
  const status = (req.query.status as string | undefined)?.toLowerCase(); // active|expired|revoked
  const name = (req.query.name as string | undefined)?.toLowerCase();
  const sort = (req.query.sort as string | undefined) || 'createdAt';
  const dir = ((req.query.dir as string | undefined) === 'asc') ? 'asc' : 'desc';
  const all = await listCertificates({ actor: user, isAdmin });
  let filtered = all;
  if (userFilter && isAdmin) filtered = filtered.filter(c => c.owner === userFilter);
  if (rootFilter) filtered = filtered.filter(c => c.rootCaId === rootFilter);
  if (name) filtered = filtered.filter(c => c.displayName.toLowerCase().includes(name));
  if (status) {
    const now = Date.now();
    filtered = filtered.filter(c => {
      const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
      if (status === 'revoked') return !!c.revokedAt;
      if (status === 'expired') return !c.revokedAt && expired;
      if (status === 'active') return !c.revokedAt && !expired;
      return true;
    });
  }
  // sorting
  const cmp = (a: any, b: any) => {
    const mul = dir === 'asc' ? 1 : -1;
    switch (sort) {
      case 'displayName': return a.displayName.localeCompare(b.displayName) * mul;
      case 'rootCaId': return a.rootCaId.localeCompare(b.rootCaId) * mul;
      case 'owner': return (a.owner || '').localeCompare(b.owner || '') * mul;
      case 'expiresAt': return ( (a.expiresAt || '') ).localeCompare(b.expiresAt || '') * mul;
      case 'status': {
        const now = Date.now();
        const rank = (c: any) => {
          const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
          if (c.revokedAt) return 2; // revoked last in asc
          if (expired) return 1; // expired middle
          return 0; // active first
        };
        const ra = rank(a); const rb = rank(b);
        if (ra !== rb) return (ra - rb) * mul;
        return a.createdAt.localeCompare(b.createdAt) * mul;
      }
      case 'createdAt':
      default:
        return a.createdAt.localeCompare(b.createdAt) * mul;
    }
  };
  filtered.sort(cmp);
  if (sort === 'createdAt' && dir === 'desc') {
    // existing default order already desc by createdAt in listCertificates; skip resort needed but left for consistency
  }
  let start = 0;
  if (cursor) {
    const idx = filtered.findIndex(c => c.id === cursor);
    if (idx >= 0) start = idx + 1;
  }
  const page = filtered.slice(start, start + limit);
  const nextCursor = (start + limit) < filtered.length ? page[page.length - 1].id : undefined;
  res.json({ items: page, nextCursor, total: filtered.length });
});

router.post('/', issueRateLimit, async (req: Request, res: Response) => {
  let { rootCaId, displayName, description, backdateDays, validDays } = req.body || {};
  if (typeof rootCaId !== 'string') return res.status(400).json({ error: 'rootCaId required' });
  if (typeof displayName !== 'string') return res.status(400).json({ error: 'displayName required' });
  displayName = displayName.trim();
  if (!displayName) return res.status(400).json({ error: 'displayName empty' });
  if (displayName.length > 100) return res.status(400).json({ error: 'displayName too long (max 100)' });
  if (!/^[\w .,'()\-]+$/u.test(displayName)) return res.status(400).json({ error: 'displayName has invalid characters' });
  if (description) {
    if (typeof description !== 'string') return res.status(400).json({ error: 'description invalid' });
    description = description.trim();
    if (description.length > 500) return res.status(400).json({ error: 'description too long (max 500)' });
  }
  if (backdateDays !== undefined) {
    if (typeof backdateDays !== 'number' || backdateDays < 0 || backdateDays > 30) return res.status(400).json({ error: 'backdateDays out of range (0-30)' });
  }
  if (validDays !== undefined) {
    if (typeof validDays !== 'number' || validDays < 1 || validDays > 1095) return res.status(400).json({ error: 'validDays out of range (1-1095)' });
  }
  // ensure root exists
  const root = await getRootCA(rootCaId);
  if (!root) return res.status(404).json({ error: 'rootCa not found' });
  try {
    const actor = (req as any).user?.sub || 'unknown';
    const issued = await issueCertificate({ rootCaId, displayName, description, actor, backdateDays, validDays });
    res.status(201).json({ ...issued, status: issued.revokedAt ? 'revoked' : 'issued', rootCaLink: `/api/rootcas/${rootCaId}` });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Issue certificate from CSR (client supplies key pair). Body: { rootCaId, csrPem, displayName?, description?, backdateDays?, validDays? }
router.post('/csr', issueRateLimit, async (req: Request, res: Response) => {
  let { rootCaId, csrPem, displayName, description, backdateDays, validDays } = req.body || {};
  if (typeof rootCaId !== 'string') return res.status(400).json({ error: 'rootCaId required' });
  if (typeof csrPem !== 'string' || !csrPem.includes('BEGIN CERTIFICATE REQUEST')) return res.status(400).json({ error: 'csrPem invalid' });
  if (displayName !== undefined) {
    if (typeof displayName !== 'string') return res.status(400).json({ error: 'displayName invalid' });
    displayName = displayName.trim();
    if (!displayName) return res.status(400).json({ error: 'displayName empty' });
    if (displayName.length > 100) return res.status(400).json({ error: 'displayName too long (max 100)' });
    if (!/^[\w .,'()\-]+$/u.test(displayName)) return res.status(400).json({ error: 'displayName has invalid characters' });
  }
  if (description) {
    if (typeof description !== 'string') return res.status(400).json({ error: 'description invalid' });
    description = description.trim();
    if (description.length > 500) return res.status(400).json({ error: 'description too long (max 500)' });
  }
  if (backdateDays !== undefined) {
    if (typeof backdateDays !== 'number' || backdateDays < 0 || backdateDays > 30) return res.status(400).json({ error: 'backdateDays out of range (0-30)' });
  }
  if (validDays !== undefined) {
    if (typeof validDays !== 'number' || validDays < 1 || validDays > 1095) return res.status(400).json({ error: 'validDays out of range (1-1095)' });
  }
  const root = await getRootCA(rootCaId);
  if (!root) return res.status(404).json({ error: 'rootCa not found' });
  try {
    const actor = (req as any).user?.sub || 'unknown';
    const issued = await issueCertificateFromCSR({ rootCaId, csrPem, actor, displayName, description, backdateDays, validDays });
    res.status(201).json({ ...issued, status: issued.revokedAt ? 'revoked' : 'issued', rootCaLink: `/api/rootcas/${rootCaId}`, method: 'csr' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const cert = await getCertificate(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Not found' });
  const user = (req as any).user?.sub || 'unknown';
  const isAdmin = ((req as any).user?.roles || []).includes('admin');
  if (cert.owner !== user && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  res.json(cert);
});

router.get('/:id/pem', async (req: Request, res: Response) => {
  const cert = await getCertificate(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Not found' });
  const user = (req as any).user?.sub || 'unknown';
  const isAdmin = ((req as any).user?.roles || []).includes('admin');
  if (cert.owner !== user && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.setHeader('Content-Disposition', `attachment; filename="cert-${cert.id}.pem"`);
  res.send(cert.certPem);
});

router.get('/:id/bundle', async (req: Request, res: Response) => {
  const cert = await getCertificate(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Not found' });
  const user = (req as any).user?.sub || 'unknown';
  const isAdmin = ((req as any).user?.roles || []).includes('admin');
  if (cert.owner !== user && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const root = await getRootCA(cert.rootCaId);
  const bundle = [cert.certPem.trim(), root?.certPem?.trim()].filter(Boolean).join('\n');
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.setHeader('Content-Disposition', `attachment; filename="cert-${cert.id}-bundle.pem"`);
  res.send(bundle + '\n');
});

router.post('/:id/revoke', revokeRateLimit, async (req: Request, res: Response) => {
  const user = (req as any).user?.sub || 'unknown';
  const id = req.params.id;
  if (!/^[0-9a-fA-F\-]{6,}$/u.test(id)) return res.status(400).json({ error: 'invalid id format' });
  try {
    const cert = await getCertificate(id);
    if (!cert) return res.status(404).json({ error: 'Not found' });
    const isAdmin = ((req as any).user?.roles || []).includes('admin');
    if (cert.owner !== user && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    if (cert.revokedAt) return res.json({ id, status: 'revoked', revokedAt: cert.revokedAt, alreadyRevoked: true });
    const revokedAt = await revokeCertificate(id, user);
    res.json({ id, status: 'revoked', revokedAt });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
