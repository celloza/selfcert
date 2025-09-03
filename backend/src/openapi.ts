import { OpenAPIV3 } from 'openapi-types';

export const openapiSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'SelfCert API',
    version: '0.1.0',
    description: 'API for issuing and managing user certificates and root CAs.'
  },
  servers: [
    { url: '/api', description: 'Base API path (proxy relative)' }
  ],
  tags: [
    { name: 'Certificates' },
    { name: 'RootCAs' },
    { name: 'Audit' }
  ],
  paths: {
    '/certs': {
      get: {
        tags: ['Certificates'],
        summary: 'List certificates',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'user', in: 'query', schema: { type: 'string' }, description: 'Filter by owner (admin only)' },
          { name: 'rootCa', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active','expired','revoked'] } },
          { name: 'name', in: 'query', schema: { type: 'string' }, description: 'Case-insensitive substring match on displayName' },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'dir', in: 'query', schema: { type: 'string', enum: ['asc','desc'] } }
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Certificate' } },
            nextCursor: { type: 'string', nullable: true },
            total: { type: 'integer' }
          } } } } }
        }
      },
      post: {
        tags: ['Certificates'],
        summary: 'Issue new certificate',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['rootCaId','displayName'], properties: {
            rootCaId: { type: 'string' },
            displayName: { type: 'string', maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            backdateDays: { type: 'integer', minimum: 0, maximum: 30 },
            validDays: { type: 'integer', minimum: 1, maximum: 1095 }
          } } } }
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/IssueCertificateResponse' } } } },
          '400': { description: 'Validation error' }
        }
      }
    },
    '/certs/csr': {
      post: {
        tags: ['Certificates'],
        summary: 'Issue certificate from CSR',
        description: 'Client supplies a PEM-encoded PKCS#10 CSR. The service signs it under the selected Root CA.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rootCaId','csrPem'], properties: {
          rootCaId: { type: 'string' },
          csrPem: { type: 'string', description: 'PEM encoded CSR beginning with -----BEGIN CERTIFICATE REQUEST-----' },
          displayName: { type: 'string', maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          backdateDays: { type: 'integer', minimum: 0, maximum: 30 },
          validDays: { type: 'integer', minimum: 1, maximum: 1095 }
        } } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/IssueCertificateFromCSRResponse' } } } },
          '400': { description: 'Validation or CSR error' },
            '404': { description: 'Root not found' }
        }
      }
    },
    '/certs/{id}': {
      get: {
        tags: ['Certificates'],
        summary: 'Get certificate detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Certificate' } } } }, '404': { description: 'Not found' } }
      }
    },
    '/certs/{id}/pem': {
      get: { tags: ['Certificates'], summary: 'Download certificate PEM', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'PEM file' } } }
    },
    '/certs/{id}/bundle': {
      get: { tags: ['Certificates'], summary: 'Download certificate + root bundle PEM', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Bundle PEM file' } } }
    },
    '/certs/{id}/revoke': {
      post: { tags: ['Certificates'], summary: 'Revoke certificate', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Revoked', content: { 'application/json': { schema: { $ref: '#/components/schemas/RevokeCertificateResponse' } } } }, '404': { description: 'Not found' } } }
    },
    '/rootcas': {
      get: { tags: ['RootCAs'], summary: 'List root CAs', responses: { '200': { description: 'OK' } } },
      post: { tags: ['RootCAs'], summary: 'Create root CA', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['displayName'], properties: { displayName: { type: 'string' } } } } } }, responses: { '201': { description: 'Created' } } }
    },
    '/rootcas/import': {
      post: {
        tags: ['RootCAs'],
        summary: 'Import existing self-signed root CA',
        description: 'Register an externally created self-signed root CA by providing its certificate and private key (PEM). The key is stored securely and not returned.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['displayName','certPem','keyPem'], properties: {
          displayName: { type: 'string' },
          certPem: { type: 'string', description: 'PEM encoded self-signed CA certificate' },
          keyPem: { type: 'string', description: 'Matching PEM encoded private key' }
        } } } } },
        responses: { '201': { description: 'Imported', content: { 'application/json': { schema: { $ref: '#/components/schemas/RootCA' } } } }, '400': { description: 'Validation / mismatch error' } }
      }
    },
    '/rootcas/{id}': {
      get: { tags: ['RootCAs'], summary: 'Get root CA detail', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } }
    },
    '/rootcas/{id}/pem': {
      get: { tags: ['RootCAs'], summary: 'Download root CA certificate', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'PEM' } } }
    },
    '/audit': {
      get: { tags: ['Audit'], summary: 'Query audit events', parameters: [
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'user', in: 'query', schema: { type: 'string' } },
        { name: 'name', in: 'query', schema: { type: 'string' } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['ts','actor','action'] } },
        { name: 'dir', in: 'query', schema: { type: 'string', enum: ['asc','desc'] } }
      ], responses: { '200': { description: 'OK' } } }
    }
  },
  components: {
    schemas: {
      RootCA: {
        type: 'object',
  properties: { id: { type: 'string' }, displayName: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, certPem: { type: 'string' }, notBefore: { type: 'string', format: 'date-time', nullable: true }, notAfter: { type: 'string', format: 'date-time', nullable: true }, sans: { type: 'array', items: { type: 'string' }, nullable: true }, fingerprintSha256: { type: 'string', nullable: true }, keyAlgorithm: { type: 'string', nullable: true }, keySize: { type: 'integer', nullable: true } },
        required: ['id','displayName','createdAt','certPem']
      },
      Certificate: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rootCaId: { type: 'string' },
          owner: { type: 'string' },
          displayName: { type: 'string' },
          certPem: { type: 'string', description: 'PEM encoded X.509 certificate' },
          createdAt: { type: 'string', format: 'date-time' },
            revokedAt: { type: 'string', format: 'date-time', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            description: { type: 'string', nullable: true },
            sans: { type: 'array', items: { type: 'string' }, description: 'Subject Alternative Names (e.g. DNS:example.com, IP:10.0.0.5, email:alice@example.com)', nullable: true }
        },
        required: ['id','rootCaId','owner','displayName','certPem','createdAt']
      },
      IssueCertificateResponse: {
        type: 'object',
        description: 'Response when issuing with server-generated key pair. keyPem is only returned once and never stored.',
        properties: {
          keyPem: { type: 'string', description: 'PEM encoded private key (only returned once)', nullable: true },
          rootCaLink: { type: 'string' },
          status: { type: 'string', enum: ['issued','revoked'] },
          id: { type: 'string' }
        },
        allOf: [ { $ref: '#/components/schemas/Certificate' } ]
      },
      IssueCertificateFromCSRResponse: {
        type: 'object',
        description: 'Response when issuing from client supplied CSR (no private key returned).',
        properties: {
          method: { type: 'string', enum: ['csr'] },
          rootCaLink: { type: 'string' },
          status: { type: 'string', enum: ['issued','revoked'] },
          id: { type: 'string' }
        },
        allOf: [ { $ref: '#/components/schemas/Certificate' } ]
      },
      RevokeCertificateResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['revoked'] },
          revokedAt: { type: 'string', format: 'date-time' },
          alreadyRevoked: { type: 'boolean', nullable: true }
        },
        required: ['id','status','revokedAt']
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [ { bearerAuth: [] } ]
};
