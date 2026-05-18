import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

// GET /api/upload-logs?limit=100
// 최근 업로드 감사 로그. 누가/언제/어디서/어떤 파일.
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const logs = await prisma.uploadLog.findMany({
    take: limit,
    orderBy: { uploadedAt: 'desc' },
    include: {
      user: { select: { username: true, name: true } },
    },
  });

  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      uploadedAt: l.uploadedAt,
      uploader: l.user.username,
      uploaderName: l.user.name,
      ip: l.ip,
      fileType: l.fileType,
      yearMonth: l.yearMonth,
      // DOWNLOAD 로그의 "기간" 컬럼 표시용 — yearMonth에 저장한 설명을 그대로 전달
      detail: l.fileType === 'DOWNLOAD' ? (l.yearMonth ?? '') : undefined,
    })),
  });
});

export default router;
