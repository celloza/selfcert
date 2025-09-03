export interface Cert {
  id: string;
  rootCaId: string;
  owner: string;
  displayName: string;
  certPem: string;
  createdAt: string;
  revokedAt?: string;
  expiresAt?: string;
  description?: string;
  sans?: string[];
}

export interface RootCA {
  id: string;
  displayName: string;
  createdAt: string;
  certPem: string;
  notBefore?: string;
  notAfter?: string;
  keyAlgorithm?: string;
  keySize?: number;
  fingerprintSha256?: string;
  sans?: string[];
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: any;
}