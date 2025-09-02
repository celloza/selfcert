import { Router, Request, Response } from 'express';
import { record } from '../services/audit.js';
import { createRootCA, listRootCAs, getRootCA, importRootCA } from '../services/rootcas.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const items = await listRootCAs();
  res.json({ items });
});

router.post('/', async (req: Request, res: Response) => {
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'displayName required' });
  }
  try {
    const meta = await createRootCA(displayName);
    record({ actor: (req as any).user?.sub || 'unknown', action: 'rootca.create', targetType: 'rootca', targetId: meta.id, details: { displayName } });
    res.status(201).json(meta);
  } catch (e: any) {
    res.status(500).json({ error: 'root CA creation failed', detail: e.message });
  }
});

// Import existing self-signed root CA (requires certPem + keyPem)
router.post('/import', async (req: Request, res: Response) => {
  let { displayName, certPem, keyPem } = req.body || {};
  if (typeof displayName !== 'string' || !displayName.trim()) return res.status(400).json({ error: 'displayName required' });
  if (typeof certPem !== 'string' || !certPem.includes('BEGIN CERTIFICATE')) return res.status(400).json({ error: 'certPem invalid' });
  if (typeof keyPem !== 'string' || !keyPem.includes('BEGIN')) return res.status(400).json({ error: 'keyPem invalid' });
  displayName = displayName.trim();
  try {
    const meta = await importRootCA({ displayName, certPem: certPem.trim(), keyPem: keyPem.trim() });
    record({ actor: (req as any).user?.sub || 'unknown', action: 'rootca.import', targetType: 'rootca', targetId: meta.id, details: { displayName } });
    res.status(201).json(meta);
  } catch (e: any) {
    const msg = e?.message || 'import failed';
    res.status(/invalid|failed|not|does/i.test(msg) ? 400 : 500).json({ error: msg });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const found = await getRootCA(req.params.id);
  if (!found) return res.status(404).json({ error: 'Not found' });
  res.json(found);
});

// Download root CA certificate PEM
router.get('/:id/pem', async (req: Request, res: Response) => {
  const found = await getRootCA(req.params.id);
  if (!found) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.setHeader('Content-Disposition', `attachment; filename="rootca-${found.id}.pem"`);
  res.send(found.certPem);
});

export default router;
