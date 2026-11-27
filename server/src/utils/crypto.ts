import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { UnauthorizedError } from '../core/errors.js';

export interface PlatformAccessTokenPayload {
  sub: string;
  actorType: 'PLATFORM_ADMIN';
  sid: string;
}

export interface TenantAccessTokenPayload {
  sub: string;
  actorType: 'TENANT_USER';
  tenantId: string;
  sid: string;
}

export type AccessTokenPayload =
  | PlatformAccessTokenPayload
  | TenantAccessTokenPayload;

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    jwtid: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const env = getEnv();
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (!decoded || typeof decoded !== 'object' || !decoded.sub || !decoded.sid || !decoded.actorType) {
      throw new UnauthorizedError('Invalid access token payload.');
    }
    return decoded;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or expired access token.');
  }
}
