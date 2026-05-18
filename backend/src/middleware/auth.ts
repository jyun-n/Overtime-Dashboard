import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

function extractToken(req: Request): string | null {
  // 1) Authorization: Bearer ... — 호환성
  const h = req.headers.authorization;
  if (h) {
    const [scheme, token] = h.split(' ');
    if (scheme === 'Bearer' && token) return token;
  }
  // 2) HttpOnly cookie — 권장 경로
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.token;
  if (cookieToken) return cookieToken;
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  // 권한 즉시 반영을 위해 매 요청 DB에서 user의 최신 상태를 재검증.
  // withdrawn 처리되거나 role이 변경된 사용자가 만료 전까지 옛 권한을 그대로 쓰는 문제를 막는다.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true, role: true, isWithdrawn: true },
  });
  if (!user || user.isWithdrawn) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  req.user = { id: user.id, username: user.username, role: user.role };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}
