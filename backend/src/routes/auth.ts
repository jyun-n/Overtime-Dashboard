import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { logger, logToDb } from '../lib/logger.js';
import { env } from '../lib/env.js';

const router = Router();

// JWT 쿠키 옵션 — HttpOnly로 JS 접근 차단, SameSite=Lax로 CSRF 기본 방어,
// production에서는 Secure 필수.
const TOKEN_COOKIE = 'token';
const TOKEN_COOKIE_MAX_AGE_MS = 30 * 60 * 1000; // 30분 — JWT 만료와 동기
const tokenCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TOKEN_COOKIE_MAX_AGE_MS,
};

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

function clientIp(req: import('express').Request): string {
  // trust proxy 설정에 따라 Express가 안전하게 파싱한 req.ip만 사용.
  return req.ip ?? '';
}

// IP + username 조합으로 limit. 한 IP에서 여러 계정 시도해도, 같은 계정을 여러 IP에서 시도해도 차단.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  limit: 5,                 // 15분당 5회 실패까지 허용
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 성공한 로그인은 카운트하지 않음
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip ?? '');
    const username = String(req.body?.username ?? '').toLowerCase();
    return `${ip}:${username}`;
  },
  handler: (req, res) => {
    const ip = clientIp(req);
    const username = String(req.body?.username ?? '');
    logger.warn('login rate-limited', { ip, username });
    logToDb({
      level: 'WARN',
      message: 'login rate-limited',
      ip,
      context: { username, reason: 'too_many_attempts' },
    });
    res.status(429).json({ error: 'too_many_attempts' });
  },
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  const { username, password } = parsed.data;

  const ip = clientIp(req);
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.isWithdrawn) {
    logToDb({
      level: 'WARN',
      message: 'login failed',
      ip,
      context: { username, reason: user?.isWithdrawn ? 'withdrawn' : 'unknown_user' },
    });
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    logToDb({
      level: 'WARN',
      message: 'login failed',
      userId: user.id,
      ip,
      context: { username, reason: 'bad_password' },
    });
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  prisma.loginLog
    .create({
      data: {
        userId: user.id,
        ip,
        userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
      },
    })
    .catch((err) => logger.error('LoginLog write failed', { err: String(err), userId: user.id }));

  const token = signToken({ sub: user.id, role: user.role, username: user.username });

  res.cookie(TOKEN_COOKIE, token, tokenCookieOptions);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department ?? '',
      ip,  // 클라이언트에 IP 전달 (워터마크용)
    },
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, { ...tokenCookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, username: true, name: true, role: true, department: true, isWithdrawn: true },
  });
  if (!user || user.isWithdrawn) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ user });
});

export default router;