import crypto from 'crypto';
import { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { User } from '../src/types/index.ts';

const DEMO_COOKIE = 'aicte_demo_session';
const demoSigningKey = crypto.randomBytes(32);
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let remoteJwksUrl: string | undefined;

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV?.toLowerCase() === 'production' ||
    process.env.ENVIRONMENT?.toLowerCase() === 'production'
  );
}

export function isLoopbackRequest(req: Request): boolean {
  const address = req.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function isDemoAuthEnabled(req: Request): boolean {
  return (
    !isProductionEnvironment() &&
    process.env.AICTE_DEMO_ROLE_SWITCH_ENABLED === 'true' &&
    isLoopbackRequest(req)
  );
}

export function getDemoUser(req: Request, users: User[]): User | undefined {
  if (!isDemoAuthEnabled(req)) return undefined;
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEMO_COOKIE}=`))
    ?.slice(DEMO_COOKIE.length + 1);
  if (!cookie) return undefined;

  const [payload, suppliedSignature] = cookie.split('.');
  if (!payload || !suppliedSignature) return undefined;
  const expectedSignature = crypto
    .createHmac('sha256', demoSigningKey)
    .update(payload)
    .digest('hex');
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return undefined;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId: string;
      expiresAt: number;
    };
    if (session.expiresAt <= Date.now()) return undefined;
    return users.find((user) => user.id === session.userId);
  } catch {
    return undefined;
  }
}

export function setDemoSession(req: Request, userId: string): string {
  if (!isDemoAuthEnabled(req)) {
    throw new AuthenticationError('Demo role switching is disabled.', 403, 'DEMO_AUTH_DISABLED');
  }
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', demoSigningKey).update(payload).digest('hex');
  return `${DEMO_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`;
}

export async function getOidcUser(token: string): Promise<User> {
  const issuer = process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE;
  const jwksUrl = process.env.OIDC_JWKS_URL;
  if (!issuer || !audience || !jwksUrl) {
    throw new AuthenticationError(
      'Trusted OIDC authentication is not configured.',
      503,
      'OIDC_NOT_CONFIGURED'
    );
  }

  let subjectUsers: Record<
    string,
    {
      id: string;
      email: string;
      name: string;
      role: User['role'];
      institutionId?: string;
      canApproveApplications: boolean;
      designation?: string;
      department?: string;
      createdAt: string;
    }
  >;
  try {
    subjectUsers = JSON.parse(
      process.env.OIDC_SUBJECT_USER_MAP || '{}'
    ) as typeof subjectUsers;
  } catch {
    throw new AuthenticationError(
      'OIDC subject mapping configuration is invalid.',
      503,
      'OIDC_MAPPING_INVALID'
    );
  }
  if (!subjectUsers || typeof subjectUsers !== 'object' || Array.isArray(subjectUsers)) {
    throw new AuthenticationError(
      'OIDC subject mapping configuration is invalid.',
      503,
      'OIDC_MAPPING_INVALID'
    );
  }

  let parsedIssuer: URL;
  let parsedJwksUrl: URL;
  try {
    parsedIssuer = new URL(issuer);
    parsedJwksUrl = new URL(jwksUrl);
  } catch {
    throw new AuthenticationError(
      'OIDC issuer configuration is invalid.',
      503,
      'OIDC_CONFIGURATION_INVALID'
    );
  }
  const localDevelopmentProvider =
    !isProductionEnvironment() && /^(localhost|127\.0\.0\.1)$/.test(parsedJwksUrl.hostname);
  if (
    (isProductionEnvironment() && parsedIssuer.protocol !== 'https:') ||
    (parsedJwksUrl.protocol !== 'https:' && !localDevelopmentProvider)
  ) {
    throw new AuthenticationError(
      'OIDC endpoints must use HTTPS outside local development.',
      503,
      'OIDC_CONFIGURATION_INVALID'
    );
  }

  try {
    if (!remoteJwks || remoteJwksUrl !== parsedJwksUrl.href) {
      remoteJwks = createRemoteJWKSet(parsedJwksUrl);
      remoteJwksUrl = parsedJwksUrl.href;
    }
    const { payload } = await jwtVerify(token, remoteJwks, { issuer, audience });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      throw new AuthenticationError('The bearer token is invalid or expired.', 401, 'INVALID_TOKEN');
    }
    if (!subjectUsers[payload.sub]) {
      throw new AuthenticationError(
        'Authenticated identity has no assigned application role.',
        403,
        'OIDC_IDENTITY_UNMAPPED'
      );
    }
    const mappedUser = subjectUsers[payload.sub];
    if (
      typeof mappedUser.id !== 'string' ||
      typeof mappedUser.email !== 'string' ||
      typeof mappedUser.name !== 'string' ||
      typeof mappedUser.createdAt !== 'string' ||
      (mappedUser.role === 'INSTITUTION' &&
        (typeof mappedUser.institutionId !== 'string' || !mappedUser.institutionId)) ||
      !['INSTITUTION', 'REVIEWER', 'ADMIN'].includes(mappedUser.role) ||
      typeof mappedUser.canApproveApplications !== 'boolean'
    ) {
      throw new AuthenticationError(
        'Authenticated identity has an invalid server-side role assignment.',
        503,
        'OIDC_MAPPING_INVALID'
      );
    }
    return {
      id: mappedUser.id,
      email: mappedUser.email,
      name: mappedUser.name,
      role: mappedUser.role,
      institutionId: mappedUser.institutionId,
      canApproveApplications: mappedUser.canApproveApplications,
      designation: mappedUser.designation,
      department: mappedUser.department,
      createdAt: mappedUser.createdAt,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('The bearer token is invalid or expired.', 401, 'INVALID_TOKEN');
  }
}

export function hasOidcConfiguration(): boolean {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_AUDIENCE && process.env.OIDC_JWKS_URL);
}
