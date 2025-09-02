import express from 'express';
import cors from 'cors';
import pino from 'pino';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import certsRouter from './routes/certs.js';
import rootCasRouter from './routes/rootcas.js';
import auditRouter from './routes/audit.js';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from './openapi.js';

const app = express();
const logger = pino();

app.use(cors());
app.use(express.json());

// Entra ID (Azure AD) JWT validation middleware
// Required env: TENANT_ID, API_AUDIENCE (client id or app id URI), optional ADMIN_GROUP_IDS (comma separated)
const tenantId = process.env.TENANT_ID;
const audience = process.env.API_AUDIENCE; // expected aud (client id) or api://... identifier
const adminGroupIds = (process.env.ADMIN_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const enforceAuth = !!tenantId && !!audience; // only enforce when configured

let jwks: ReturnType<typeof jwksClient> | undefined;
if (enforceAuth) {
  jwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxEntries: 10,
    cacheMaxAge: 10 * 60 * 1000
  });
}

function getKey(header: any, callback: (err: Error | null, signingKey?: string) => void) {
  if (!jwks) return callback(new Error('JWKS not configured'));
  jwks.getSigningKey(header.kid, (err: any, key: any) => {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!enforceAuth) {
    // Dev fallback (no Entra env configured)
    const demoUser = req.header('x-demo-user') || 'demo-user';
    const isAdmin = req.header('x-demo-admin') === 'true';
    (req as any).user = { sub: demoUser, roles: isAdmin ? ['admin'] : [] };
    return next();
  }
  const auth = req.header('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' });
  }
  const token = auth.substring(7);
  jwt.verify(token, getKey as any, {
    audience,
    issuer: [`https://login.microsoftonline.com/${tenantId}/v2.0`],
    algorithms: ['RS256']
  }, (err, decoded: any) => {
    if (err || !decoded) return res.status(401).json({ error: 'invalid token' });
    // Determine admin via groups or roles claim
    const groups: string[] = decoded.groups || [];
    const rawRoles: string[] = decoded.roles || decoded['roles'] || [];
    const rolesLower = rawRoles.map(r => (typeof r === 'string' ? r.toLowerCase() : ''));
    const isAdmin = groups.some(g => adminGroupIds.includes(g)) || rolesLower.includes('admin');
    (req as any).user = {
      sub: decoded.sub || decoded.oid || decoded.objectId,
      name: decoded.name,
      groups,
      roles: isAdmin ? ['admin'] : []
    };
    next();
  });
});

app.get('/healthz', (_req: express.Request, res: express.Response) => res.json({ status: 'ok' }));
// OpenAPI spec & docs
app.get('/api/docs.json', (_req, res) => res.json(openapiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));
app.use('/api/certs', certsRouter);
app.use('/api/rootcas', rootCasRouter);
app.use('/api/audit', auditRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => logger.info({ msg: 'api listening', port }));
