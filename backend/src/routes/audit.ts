import { Router, Request, Response } from 'express';
import { query } from '../services/audit.js';

const router = Router();

// GET /api/audit?cursor=<id>&limit=50&user=actorId&name=displayName&sort=ts&dir=desc
router.get('/', async (req: Request, res: Response) => {
  const { cursor, limit, user, name, sort, dir } = req.query;
  const limitNum = limit ? parseInt(limit as string, 10) : undefined;
  const result = await query({ cursor: cursor as string | undefined, limit: limitNum, user: user as string | undefined, name: name as string | undefined, sort: sort as string | undefined, dir: dir as string | undefined });
  res.json(result);
});

export default router;
