import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

// GET /api/login-logs?limit=100
// 전체 계정의 최근 로그인 성공 기록. (실패는 기록하지 않음 — 요구사항)
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const logs = await prisma.loginLog.findMany({
    take: limit,
    orderBy: { loginAt: 'desc' },
    include: {
      user: { select: { username: true, name: true, department: true, jobGroup: true } },
    },
  });

  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      loginAt: l.loginAt,
      username: l.user.username,
      name: l.user.name,
      department: l.user.department,
      jobGroup: l.user.jobGroup,
      ip: l.ip,
    })),
  });
});

export default router;
