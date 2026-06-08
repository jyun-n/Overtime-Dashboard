import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { logger, logToDb } from '../lib/logger.js';
import { env } from '../lib/env.js';

// 길이가 달라도 짧은 쪽에 맞춰 비교하지 않도록 length check + timingSafeEqual 조합.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const router = Router();
router.use(requireAuth, requireAdmin);

// 비밀번호 정책: 10~128자, 영문대소문자/숫자/특수문자 중 3종 이상,
// 동일 문자 4회 연속 금지, 흔한 약한 비밀번호 차단.
const COMMON_WEAK = new Set([
  'password', 'password1', 'qwerty123', '12345678', '123456789', '1234567890',
  'admin1234', 'admin0000', 'qwertyuiop', 'asdfghjkl', 'iloveyou1',
]);

const passwordPolicy = z.string()
  .min(10, 'too_short')
  .max(128, 'too_long')
  .refine((v) => {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length;
    return classes >= 3;
  }, 'insufficient_complexity')
  .refine((v) => !/(.)\1{3,}/.test(v), 'repeated_chars')
  .refine((v) => !COMMON_WEAK.has(v.toLowerCase()), 'common_password');

function clientIp(req: import('express').Request): string {
  // trust proxy 설정에 따라 Express가 X-Forwarded-For를 안전하게 파싱한 req.ip만 사용.
  // 클라이언트가 보낸 임의 헤더는 신뢰하지 않는다.
  return req.ip ?? '';
}

// 작업하는 관리자 본인의 로그인 비밀번호로 재인증 (수정/탈퇴/일반계정 재설정 확인용).
async function verifyOwnPassword(actorId: string, provided: string): Promise<boolean> {
  if (!provided) return false;
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { passwordHash: true } });
  if (!actor) return false;
  return verifyPassword(provided, actor.passwordHash);
}

// ──────────────────────────────────────────────
// GET /api/users
// ──────────────────────────────────────────────
router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isWithdrawn: false },
    select: {
      id: true,
      username: true,
      name: true,
      empNo: true,
      department: true,
      jobGroup: true,
      role: true,
      createdAt: true,
      loginLogs: {
        orderBy: { loginAt: 'desc' },
        take: 1,
        select: { loginAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      empNo: u.empNo,
      department: u.department,
      jobGroup: u.jobGroup,
      role: u.role,
      lastLoginAt: u.loginLogs[0]?.loginAt ?? null,
      createdAt: u.createdAt,
    })),
  });
});

// ──────────────────────────────────────────────
// POST /api/users  — 계정 생성
// ──────────────────────────────────────────────
const createSchema = z.object({
  username:   z.string().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password:   passwordPolicy,
  name:       z.string().min(1).max(50),
  role:       z.enum(['ADMIN', 'USER']).default('USER'),
  empNo:      z.string().max(20).optional(),
  department: z.string().max(50).optional(),
  jobGroup:   z.string().max(50).optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    const pwIssue = parsed.error.issues.find((i) => i.path[0] === 'password');
    if (pwIssue) {
      res.status(400).json({ error: 'weak_password', reason: pwIssue.message });
      return;
    }
    res.status(400).json({ error: 'invalid_request', detail: parsed.error.flatten() });
    return;
  }
  const { username, password, name, role, empNo, department, jobGroup } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists && !exists.isWithdrawn) {
    res.status(409).json({ error: 'username_taken' });
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await (exists?.isWithdrawn
    ? prisma.user.update({
        where: { username },
        data: {
          passwordHash, name, role, empNo, department, jobGroup,
          isWithdrawn: false, withdrawnAt: null, withdrawnById: null,
          createdById: req.user!.id,
        },
        select: { id: true, username: true, name: true, empNo: true, department: true, jobGroup: true, role: true, createdAt: true },
      })
    : prisma.user.create({
        data: { username, passwordHash, name, role, empNo, department, jobGroup, createdById: req.user!.id },
        select: { id: true, username: true, name: true, empNo: true, department: true, jobGroup: true, role: true, createdAt: true },
      }));

  logger.info('user created', { actorId: req.user!.id, targetUsername: username });
  logToDb({
    level: 'INFO',
    message: 'user created',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action: 'CREATE',
      actorUsername: req.user!.username,
      targetUsername: username,
      targetName: name,
      detail: `계정 생성 (${role === 'ADMIN' ? '관리자' : '사용자'})`,
    },
  });

  res.status(201).json({ user });
});

// ──────────────────────────────────────────────
// PATCH /api/users/:id  — 정보 수정 (role만)
// ──────────────────────────────────────────────
const updateSchema = z.object({
  role:       z.enum(['ADMIN', 'USER']).optional(),
  department: z.string().max(50).optional(),
  jobGroup:   z.string().max(50).optional(),
  password:   z.string().min(1).max(128), // 작업 관리자 본인 비밀번호
});

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', detail: parsed.error.flatten() });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.isWithdrawn) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // admin 계정 자기자신 role 변경 방지
  if (target.username === 'admin') {
    res.status(403).json({ error: 'cannot_modify_root_admin' });
    return;
  }

  // 작업 관리자 본인 비밀번호 확인
  if (!(await verifyOwnPassword(req.user!.id, parsed.data.password))) {
    res.status(403).json({ error: 'invalid_password' });
    return;
  }

  const { password: _pw, ...updateData } = parsed.data;
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: { id: true, username: true, name: true, role: true, updatedAt: true },
  });

  // 실제로 변경된 필드만 로그에 기록
  const changes: string[] = [];
  if (parsed.data.role !== undefined && parsed.data.role !== target.role) {
    changes.push(`권한 → ${parsed.data.role === 'ADMIN' ? '관리자' : '사용자'}`);
  }
  if (parsed.data.department !== undefined && parsed.data.department !== (target.department ?? '')) {
    changes.push(`소속부서 → ${parsed.data.department || '미지정'}`);
  }
  if (parsed.data.jobGroup !== undefined && parsed.data.jobGroup !== (target.jobGroup ?? '')) {
    changes.push(`직급 → ${parsed.data.jobGroup || '미지정'}`);
  }

  // 권한만 단독으로 바뀌면 EDIT_ROLE, 그 외(소속/직급 포함, 혼합)는 EDIT_INFO
  const onlyRoleChanged = changes.length === 1 && changes[0]?.startsWith('권한');
  const action = onlyRoleChanged ? 'EDIT_ROLE' : 'EDIT_INFO';
  const detail = changes.length > 0 ? changes.join(', ') : '변경 없음';

  logger.info('user updated', {
    actorId: req.user!.id,
    targetId: req.params.id,
    changes: parsed.data,
  });
  logToDb({
    level: 'INFO',
    message: 'user updated',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action,
      actorUsername: req.user!.username,
      targetUsername: target.username,
      targetName: target.name,
      detail,
    },
  });

  res.json({ user: updated });
});

// ──────────────────────────────────────────────
// POST /api/users/:id/reset-password
// ──────────────────────────────────────────────
const resetSchema = z.object({
  newPassword: passwordPolicy,
  password:    z.string().min(1).max(128), // admin 대상=마스터, 그 외=작업 관리자 본인 비밀번호
});

// root admin 비밀번호 리셋은 마스터 비번 brute-force가 가능하므로 별도 강한 제한.
// IP + 대상 user id 조합. 성공/실패 모두 카운트해 시도 자체를 제한.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${req.params.id ?? ''}`,
  handler: (req, res) => {
    logger.warn('reset-password rate-limited', { ip: req.ip, targetId: req.params.id, actorId: req.user?.id });
    logToDb({
      level: 'WARN',
      message: 'reset-password rate-limited',
      userId: req.user?.id,
      ip: req.ip ?? '',
      context: { targetId: req.params.id, reason: 'too_many_attempts' },
    });
    res.status(429).json({ error: 'too_many_attempts' });
  },
});

router.post('/:id/reset-password', resetPasswordLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    const pwIssue = parsed.error.issues.find((i) => i.path[0] === 'newPassword');
    if (pwIssue) {
      res.status(400).json({ error: 'weak_password', reason: pwIssue.message });
      return;
    }
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.isWithdrawn) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const provided = parsed.data.password;
  if (target.username === 'admin') {
    // admin(root) 재설정: 마스터 비밀번호(env) 또는 admin 계정의 현재 비밀번호로 확인
    const masterOk = await verifyPassword(provided, target.passwordHash);
    const envOk = safeEqual(provided, env.withdrawPassword); // timing-safe 비교
    if (!masterOk && !envOk) {
      logToDb({
        level: 'WARN',
        message: 'reset-password master failed',
        userId: req.user!.id,
        ip: clientIp(req),
        context: { targetUsername: target.username, actorUsername: req.user!.username },
      });
      res.status(403).json({ error: 'master_password_required' });
      return;
    }
  } else {
    // 일반 계정 재설정: 작업하는 관리자 본인 비밀번호로 확인
    if (!(await verifyOwnPassword(req.user!.id, provided))) {
      logToDb({
        level: 'WARN',
        message: 'reset-password own-password failed',
        userId: req.user!.id,
        ip: clientIp(req),
        context: { targetUsername: target.username, actorUsername: req.user!.username },
      });
      res.status(403).json({ error: 'invalid_password' });
      return;
    }
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash },
  });

  logger.info('password reset', { actorId: req.user!.id, targetId: req.params.id });
  logToDb({
    level: 'INFO',
    message: 'password reset',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action: 'RESET_PW',
      actorUsername: req.user!.username,
      targetUsername: target.username,
      targetName: target.name,
      detail: '비밀번호 재설정',
    },
  });

  res.json({ ok: true });
});

// ──────────────────────────────────────────────
// DELETE /api/users/:id  — 탈퇴 (soft delete)
// ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.isWithdrawn) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // admin 계정 탈퇴 불가
  if (target.username === 'admin') {
    res.status(403).json({ error: 'cannot_delete_root_admin' });
    return;
  }

  // ADMIN 계정 탈퇴 불가 (프론트 요구사항과 동일)
  if (target.role === 'ADMIN') {
    res.status(403).json({ error: 'cannot_delete_admin' });
    return;
  }

  // 작업 관리자 본인 비밀번호 확인
  const provided = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!(await verifyOwnPassword(req.user!.id, provided))) {
    logToDb({
      level: 'WARN',
      message: 'user withdraw password failed',
      userId: req.user!.id,
      ip: clientIp(req),
      context: { targetUsername: target.username, actorUsername: req.user!.username },
    });
    res.status(403).json({ error: 'invalid_password' });
    return;
  }

  await prisma.user.update({
    where: { id: req.params.id },
    data: {
      isWithdrawn: true,
      withdrawnAt: new Date(),
      withdrawnById: req.user!.id,
    },
  });

  logger.info('user withdrawn', { actorId: req.user!.id, targetId: req.params.id });
  logToDb({
    level: 'INFO',
    message: 'user withdrawn',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action: 'DELETE',
      actorUsername: req.user!.username,
      targetUsername: target.username,
      targetName: target.name,
      detail: '계정 탈퇴 처리',
    },
  });

  res.json({ ok: true });
});

// ──────────────────────────────────────────────
// GET /api/users/audit-logs — 변경 내역
// ──────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);

  const logs = await prisma.serverLog.findMany({
    where: {
      message: {
        in: [
          'user created', 'user updated', 'user withdrawn', 'password reset',
          'ip-acl added', 'ip-acl removed', 'ip-acl toggled',
        ],
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      message: true,
      context: true,
      createdAt: true,
      ip: true,
      user: { select: { username: true, name: true } },
    },
  });

  res.json({
    logs: logs.map((l) => {
      const ctx = (l.context ?? {}) as Record<string, string>;
      return {
        id: l.id,
        at: l.createdAt,
        actorUsername: l.user?.username ?? ctx.actorUsername ?? 'admin',
        targetName: ctx.targetName ?? ctx.targetIp ?? '',
        targetUsername: ctx.targetUsername ?? '',
        action: ctx.action ?? 'CREATE',
        detail: ctx.detail ?? '',
        ip: l.ip ?? '',
      };
    }),
  });
});

export default router;