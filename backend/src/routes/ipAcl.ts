import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { verifyPassword } from '../lib/password.js';
import { logger, logToDb } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { normalizeIp, isValidSingleIp, invalidateIpAclCache } from '../lib/ipAcl.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function clientIp(req: import('express').Request): string {
  return req.ip ?? '';
}

// 삭제 확인: 관리자 본인의 로그인 비밀번호로 재인증.
async function verifyAdminPassword(adminId: string, provided: string): Promise<boolean> {
  if (!provided) return false;
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
  if (!admin) return false;
  return verifyPassword(provided, admin.passwordHash);
}

// ──────────────────────────────────────────────
// GET /api/ip-acl — 목록 + 현재 모드 + 요청자의 현재 IP
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  const entries = await prisma.ipAcl.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      ip: true,
      ownerName: true,
      note: true,
      isActive: true,
      createdAt: true,
      user: { select: { id: true, name: true, username: true } },
      createdBy: { select: { name: true, username: true } },
    },
  });

  res.json({
    mode: env.ipAclMode, // off | audit | enforce (환경변수 제어, 화면엔 표시만)
    currentIp: normalizeIp(req.ip), // "현재 접속 IP" 표시 + 원클릭 추가용
    entries: entries.map((e) => ({
      id: e.id,
      ip: e.ip,
      ownerName: e.ownerName,
      note: e.note,
      isActive: e.isActive,
      createdAt: e.createdAt,
      account: e.user ? { id: e.user.id, name: e.user.name, username: e.user.username } : null,
      createdByName: e.createdBy?.name ?? null,
    })),
  });
});

// ──────────────────────────────────────────────
// POST /api/ip-acl — 허용 IP 등록
// ──────────────────────────────────────────────
const createSchema = z.object({
  ip: z.string().min(1).max(45),
  ownerName: z.string().max(100).optional(),
  note: z.string().max(200).optional(),
  userId: z.string().optional(), // 연결할 계정 (선택)
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const ip = normalizeIp(parsed.data.ip);
  if (!isValidSingleIp(ip)) {
    res.status(400).json({ error: 'invalid_ip' });
    return;
  }

  const ownerName = parsed.data.ownerName?.trim() || null;
  const note = parsed.data.note?.trim() || null;
  const userId = parsed.data.userId || null;

  // 계정·주인 중 최소 하나는 있어야 "이 IP의 주인"을 식별할 수 있다.
  if (!userId && !ownerName) {
    res.status(400).json({ error: 'owner_required' });
    return;
  }

  // 연결 계정이 실제로 존재하는지 확인 (없으면 무시하지 않고 거부)
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isWithdrawn: true } });
    if (!u || u.isWithdrawn) {
      res.status(400).json({ error: 'invalid_account' });
      return;
    }
  }

  let entry;
  try {
    entry = await prisma.ipAcl.create({
      data: { ip, ownerName, note, userId, createdById: req.user!.id },
      select: { id: true, ip: true, ownerName: true, note: true, isActive: true, createdAt: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'ip_exists' });
      return;
    }
    throw err;
  }

  invalidateIpAclCache();
  logger.info('ip-acl added', { actorId: req.user!.id, ip });
  logToDb({
    level: 'INFO',
    message: 'ip-acl added',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action: 'IPACL_ADD',
      actorUsername: req.user!.username,
      targetIp: ip,
      ownerName: ownerName ?? '',
      detail: `허용 IP 등록 (${ip}${ownerName ? ` · ${ownerName}` : ''})`,
    },
  });

  res.status(201).json({ entry });
});

// ──────────────────────────────────────────────
// PATCH /api/ip-acl/:id — 활성/비활성 토글
// ──────────────────────────────────────────────
const patchSchema = z.object({ isActive: z.boolean() });

router.patch('/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const target = await prisma.ipAcl.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const updated = await prisma.ipAcl.update({
    where: { id: req.params.id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, ip: true, ownerName: true, note: true, isActive: true, createdAt: true },
  });

  invalidateIpAclCache();
  logToDb({
    level: 'INFO',
    message: 'ip-acl toggled',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action: 'IPACL_TOGGLE',
      actorUsername: req.user!.username,
      targetIp: target.ip,
      detail: `허용 IP ${parsed.data.isActive ? '활성화' : '비활성화'} (${target.ip})`,
    },
  });

  res.json({ entry: updated });
});

// ──────────────────────────────────────────────
// DELETE /api/ip-acl/:id — 삭제
// ──────────────────────────────────────────────
const deleteSchema = z.object({ password: z.string().min(1).max(128) });

router.delete('/:id', async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'password_required' });
    return;
  }

  const target = await prisma.ipAcl.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // 삭제 전 관리자 재인증
  const ok = await verifyAdminPassword(req.user!.id, parsed.data.password);
  if (!ok) {
    logToDb({
      level: 'WARN',
      message: 'ip-acl delete password failed',
      userId: req.user!.id,
      ip: clientIp(req),
      context: { actorUsername: req.user!.username, targetIp: target.ip },
    });
    res.status(403).json({ error: 'invalid_password' });
    return;
  }

  await prisma.ipAcl.delete({ where: { id: req.params.id } });

  invalidateIpAclCache();
  logger.info('ip-acl removed', { actorId: req.user!.id, ip: target.ip });
  logToDb({
    level: 'INFO',
    message: 'ip-acl removed',
    userId: req.user!.id,
    ip: clientIp(req),
    context: {
      action: 'IPACL_REMOVE',
      actorUsername: req.user!.username,
      targetIp: target.ip,
      ownerName: target.ownerName ?? '',
      detail: `허용 IP 삭제 (${target.ip}${target.ownerName ? ` · ${target.ownerName}` : ''})`,
    },
  });

  res.json({ ok: true });
});

export default router;
