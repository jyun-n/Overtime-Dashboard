import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from './env.js';

export type JwtPayload = {
  sub: string;   // userId
  role: Role;
  username: string;
};

export function signToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwtSecret, opts);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  const { sub, role, username } = decoded as jwt.JwtPayload & Partial<JwtPayload>;
  if (!sub || !role || !username) throw new Error('Malformed token payload');
  return { sub, role, username };
}
