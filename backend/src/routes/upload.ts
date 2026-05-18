import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logger, logToDb } from '../lib/logger.js';
import { env } from '../lib/env.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.match(/\.(xlsx|xls)$/i);
    cb(null, !!ok);
  },
});

function clientIp(req: import('express').Request): string {
  return req.ip ?? '';
}

// 확장자 위장 차단: XLSX(ZIP) / XLS(OLE2 compound) 매직바이트 검증.
// XLSX: 50 4B 03 04 (PK..) / 50 4B 05 06 (empty) / 50 4B 07 08 (spanned)
// XLS:  D0 CF 11 E0 A1 B1 1A E1
function isValidExcelMagic(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return true;
  }
  return (
    buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 &&
    buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1
  );
}

function sheetToRows(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

// 연장근무 파일 전용: 1행 빈칸, 2행 헤더
function sheetToOvertimeRows(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, {
    type: 'buffer',
    cellDates: true,
    cellNF: true,
    cellFormula: false,
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  if (!ws['!ref']) return [];

  const range = XLSX.utils.decode_range(ws['!ref']);

  // 헤더 행 탐색: '사번' 또는 '사원명' 텍스트가 있는 행을 헤더로 인식
  let headerRow = range.s.r;
  outer: for (let R = range.s.r; R <= Math.min(range.s.r + 5, range.e.r); R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && (cell.v === '사번' || cell.v === '사원번호' || cell.v === '사원명')) {
        headerRow = R;
        break outer;
      }
    }
  }

  range.s.r = headerRow;
  ws['!ref'] = XLSX.utils.encode_range(range);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });

  return rows.map((row) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      // 줄바꿈 제거 + 앞뒤 공백 제거
      cleaned[k.replace(/[\r\n]/g, '').trim()] = v;
    }
    return cleaned;
  });
}

// ──────────────────────────────────────────────
// POST /api/upload/hr
// 인사정보 파일 업로드
// 엑셀 컬럼: 사원번호 | 사원명 | 소속부서 | 직군
// ──────────────────────────────────────────────
router.post('/hr', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file_required' });
    return;
  }
  if (!isValidExcelMagic(req.file.buffer)) {
    res.status(400).json({ error: 'invalid_file_type' });
    return;
  }

  const rows = sheetToRows(req.file.buffer);
  if (rows.length === 0) {
    res.status(400).json({ error: 'empty_file' });
    return;
  }

  // 먼저 유효한 행만 메모리에서 정리
  const validRows: { empNo: string; name: string; department: string; jobGroup: string }[] = [];
  let skipped = 0;
  for (const row of rows) {
    const empNo = String(row['사원번호'] ?? row['사번'] ?? '').trim();
    const name = String(row['사원명'] ?? row['이름'] ?? '').trim();
    const department = String(row['소속부서'] ?? row['부서'] ?? '').trim();
    const jobGroup = String(row['직군'] ?? '').trim();
    if (!empNo || !name) { skipped++; continue; }
    validRows.push({ empNo, name, department, jobGroup });
  }

  // 유효 행이 없으면 기존 데이터를 날리지 않고 거절. 잘못된 파일로 인사정보가 비어버리는 사고 방지.
  if (validRows.length === 0) {
    res.status(400).json({ error: 'no_valid_rows' });
    return;
  }

  // 삭제 + UploadLog 생성 + createMany를 단일 트랜잭션으로 묶어 atomic 적재.
  // 중간 실패 시 인사정보가 비어버리지 않는다. 큰 파일 대응으로 timeout 30초.
  await prisma.$transaction(
    async (tx) => {
      await tx.hrEmployee.deleteMany({});
      const uploadLog = await tx.uploadLog.create({
        data: { userId: req.user!.id, ip: clientIp(req), fileType: 'HR' },
      });
      await tx.hrEmployee.createMany({
        data: validRows.map((r) => ({ ...r, uploadLogId: uploadLog.id })),
      });
    },
    { timeout: 30_000 },
  );

  const upserted = validRows.length;

  logger.info('hr uploaded', { actorId: req.user!.id, upserted, skipped });
  logToDb({
    level: 'INFO',
    message: 'hr uploaded',
    userId: req.user!.id,
    ip: clientIp(req),
    context: { upserted, skipped },
  });

  res.json({ ok: true, upserted, skipped });
});

// ──────────────────────────────────────────────
// POST /api/upload/overtime
// 연장근무 파일 업로드
// body: { yearMonth: "YYYY-MM" }
// 엑셀 컬럼: 사번 | 사원명 | 부서 | 자동 | 자동연장_금액 | 초과 | 초과연장_금액 | 연장 | 연장수당(총계) | 시급
// ──────────────────────────────────────────────
const overtimeSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

router.post('/overtime', upload.single('file'), async (req, res) => {
  const parsed = overtimeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_year_month' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'file_required' });
    return;
  }
  if (!isValidExcelMagic(req.file.buffer)) {
    res.status(400).json({ error: 'invalid_file_type' });
    return;
  }

  const { yearMonth } = parsed.data;
  const rows = sheetToOvertimeRows(req.file.buffer);
  if (rows.length === 0) {
    res.status(400).json({ error: 'empty_file' });
    return;
  }

  // 첫 행은 xlsx 라이브러리가 헤더로 처리, 마지막 행은 합계 행이므로 제외
  const dataRows = rows.slice(0, -1);

  const uploadLog = await prisma.uploadLog.create({
    data: {
      userId: req.user!.id,
      ip: clientIp(req),
      fileType: 'OVERTIME',
      yearMonth,
    },
  });

  let upserted = 0;
  let skipped = 0;
  for (const row of dataRows) {
    const empNo = String(row['사번'] ?? row['사원번호'] ?? '').trim();
    const name = String(row['사원명'] ?? row['이름'] ?? '').trim();
    const department = String(row['부서'] ?? row['소속부서'] ?? '').trim();

    // 사번이 없거나 숫자가 아니면 합계행 등 무효 행으로 간주
    if (!empNo || !name || !/^\d+$/.test(empNo)) { skipped++; continue; }

    const n = (v: unknown) => (v !== null && v !== '' ? Number(v) : null);

    await prisma.overtimeRecord.upsert({
      where: { yearMonth_empNo: { yearMonth, empNo } },
      update: {
        name,
        department,
        autoHours: n(row['자동']),
        autoAmount: n(row['자동연장_금액']),
        excessHours: n(row['초과']),
        excessAmount: n(row['초과연장_금액']),
        extensionHours: n(row['연장'] ?? row['연장(총계)']), // 파일마다 컬럼명 다름
        totalAllowance: n(row['연장수당(총계)']),
        hourlyWage: n(row['시급']),
        uploadLogId: uploadLog.id,
      },
      create: {
        yearMonth,
        empNo,
        name,
        department,
        autoHours: n(row['자동']),
        autoAmount: n(row['자동연장_금액']),
        excessHours: n(row['초과']),
        excessAmount: n(row['초과연장_금액']),
        extensionHours: n(row['연장'] ?? row['연장(총계)']), // 파일마다 컬럼명 다름
        totalAllowance: n(row['연장수당(총계)']),
        hourlyWage: n(row['시급']),
        uploadLogId: uploadLog.id,
      },
    });
    upserted++;
  }

  logger.info('overtime uploaded', { actorId: req.user!.id, yearMonth, upserted, skipped });
  logToDb({
    level: 'INFO',
    message: 'overtime uploaded',
    userId: req.user!.id,
    ip: clientIp(req),
    context: { yearMonth, upserted, skipped },
  });

  res.json({ ok: true, upserted, skipped });
});

export default router;