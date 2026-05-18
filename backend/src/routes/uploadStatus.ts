import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// GET /api/upload-status
// 대시보드 헤더용 최소 정보. USER도 접근 가능.
// 각 파일 타입의 가장 최근 업로드 시각만 반환 (업로더/IP 등 감사 정보는 미포함).
router.get('/', async (_req, res) => {
  const [hr, overtime] = await Promise.all([
    prisma.uploadLog.findFirst({
      where: { fileType: 'HR' },
      orderBy: { uploadedAt: 'desc' },
      select: { uploadedAt: true },
    }),
    prisma.uploadLog.findFirst({
      where: { fileType: 'OVERTIME' },
      orderBy: { uploadedAt: 'desc' },
      select: { uploadedAt: true, yearMonth: true },
    }),
  ]);

  res.json({
    hr: hr ? { uploadedAt: hr.uploadedAt } : null,
    overtime: overtime
      ? { uploadedAt: overtime.uploadedAt, yearMonth: overtime.yearMonth }
      : null,
  });
});

export default router;
