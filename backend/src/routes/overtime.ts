import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

function clientIp(req: import('express').Request): string {
  return req.ip ?? '';
}

// yearMonth 목록 생성 helper
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}$/),
  jobGroup: z.string().optional(),
});

// ──────────────────────────────────────────────
// GET /api/overtime/kpis?from=&to=&jobGroup=
// ──────────────────────────────────────────────
router.get('/kpis', async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to, jobGroup } = parsed.data;

  let empNos: string[] | null = null;
  if (jobGroup) {
    const employees = await prisma.hrEmployee.findMany({
      where: { jobGroup },
      select: { empNo: true },
    });
    empNos = employees.map(e => e.empNo);
    if (empNos.length === 0) {
      res.json({ totalHours: 0, totalAmount: 0, excessHours: 0, excessAmount: 0, avgPerPerson: 0 });
      return;
    }
  }

  const months = monthsBetween(from, to);

  const records = await prisma.overtimeRecord.findMany({
    where: {
      yearMonth: { in: months },
      ...(empNos ? { empNo: { in: empNos } } : {}),
    },
    select: {
      empNo: true,
      extensionHours: true,
      excessHours: true,
      excessAmount: true,
      totalAllowance: true,
    },
  });

  const totalHours = records.reduce((s, r) => s + (r.extensionHours ?? 0), 0);
  const excessHours = records.reduce((s, r) => s + (r.excessHours ?? 0), 0);
  const excessAmount = records.reduce((s, r) => s + (r.excessAmount ?? 0), 0);
  const totalAmount = records.reduce((s, r) => s + (r.totalAllowance ?? 0), 0);
  const uniquePersons = new Set(records.map(r => r.empNo)).size;
  // 월평균 1인 시간 — 다개월 기간 선택 시에도 단위가 일관되도록 개월수로 나눈다.
  const avgPerPerson = uniquePersons > 0 ? totalHours / uniquePersons / months.length : 0;

  res.json({ totalHours, totalAmount, excessHours, excessAmount, avgPerPerson });
});

// ──────────────────────────────────────────────
// GET /api/overtime/hours-trend?from=&to=
// ──────────────────────────────────────────────
router.get('/hours-trend', async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to } = parsed.data;
  const months = monthsBetween(from, to);

  const result = await Promise.all(months.map(async (ym) => {
    const recs = await prisma.overtimeRecord.findMany({
      where: { yearMonth: ym },
      select: { autoHours: true, excessHours: true, extensionHours: true },
    });
    return {
      ym,
      자동: recs.reduce((s, r) => s + (r.autoHours ?? 0), 0),
      초과: recs.reduce((s, r) => s + (r.excessHours ?? 0), 0),
      총연장: recs.reduce((s, r) => s + (r.extensionHours ?? 0), 0),
    };
  }));

  res.json({ data: result });
});

// ──────────────────────────────────────────────
// GET /api/overtime/amount-trend?from=&to=
// ──────────────────────────────────────────────
router.get('/amount-trend', async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to } = parsed.data;
  const months = monthsBetween(from, to);

  const result = await Promise.all(months.map(async (ym) => {
    const recs = await prisma.overtimeRecord.findMany({
      where: { yearMonth: ym },
      select: { autoAmount: true, excessAmount: true, totalAllowance: true },
    });
    return {
      ym,
      자동연장: recs.reduce((s, r) => s + (r.autoAmount ?? 0), 0),
      초과연장: recs.reduce((s, r) => s + (r.excessAmount ?? 0), 0),
      총합: recs.reduce((s, r) => s + (r.totalAllowance ?? 0), 0),
    };
  }));

  res.json({ data: result });
});

// ──────────────────────────────────────────────
// GET /api/overtime/top-depts?from=&to=&metric=auto|excess&limit=20
// ──────────────────────────────────────────────
router.get('/top-depts', async (req, res) => {
  const parsed = rangeSchema.extend({
    metric: z.enum(['auto', 'excess']).default('excess'),
    limit: z.coerce.number().default(20),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to, metric, limit } = parsed.data;
  const months = monthsBetween(from, to);

  const records = await prisma.overtimeRecord.findMany({
    where: { yearMonth: { in: months } },
    select: { department: true, autoHours: true, excessHours: true },
  });

  const deptMap = new Map<string, number>();
  for (const r of records) {
    const v = metric === 'auto' ? (r.autoHours ?? 0) : (r.excessHours ?? 0);
    deptMap.set(r.department, (deptMap.get(r.department) ?? 0) + v);
  }

  const sorted = [...deptMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));

  res.json({ data: sorted });
});

// ──────────────────────────────────────────────
// GET /api/overtime/top-persons?from=&to=&dept=&limit=15
// ──────────────────────────────────────────────
router.get('/top-persons', async (req, res) => {
  const parsed = rangeSchema.extend({
    dept: z.string().optional(),
    depts: z.string().optional(), // 콤마 구분 다중 부서 (한 호출로 처리해 결과 일관성 보장)
    limit: z.coerce.number().default(15),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to, dept, depts, limit } = parsed.data;
  const months = monthsBetween(from, to);

  // depts(다중) 우선, 없으면 dept(단일) fallback. 둘 다 없으면 전체.
  const deptList = depts
    ? depts.split(',').map((d) => d.trim()).filter(Boolean)
    : (dept && dept !== '전체 부서' ? [dept] : null);

  const records = await prisma.overtimeRecord.findMany({
    where: {
      yearMonth: { in: months },
      ...(deptList && deptList.length > 0 ? { department: { in: deptList } } : {}),
    },
    select: { empNo: true, name: true, department: true, excessHours: true, excessAmount: true },
  });

  const personMap = new Map<string, { name: string; dept: string; 초과: number; 초과연장: number }>();
  for (const r of records) {
    const cur = personMap.get(r.empNo) ?? { name: r.name, dept: r.department, 초과: 0, 초과연장: 0 };
    cur.초과 += r.excessHours ?? 0;
    cur.초과연장 += r.excessAmount ?? 0;
    personMap.set(r.empNo, cur);
  }

  const sorted = [...personMap.entries()]
    .sort((a, b) => b[1].초과 - a[1].초과)
    .slice(0, limit)
    .map(([empNo, v]) => ({ empNo, name: v.name, dept: v.dept, 초과: v.초과, 초과연장: v.초과연장 }));

  res.json({ data: sorted });
});

// ──────────────────────────────────────────────
// GET /api/overtime/dept-trend?dept=&from=&to=&metric=auto|excess
// ──────────────────────────────────────────────
router.get('/dept-trend', async (req, res) => {
  const parsed = rangeSchema.extend({
    dept: z.string(),
    metric: z.enum(['auto', 'excess', 'extension']).default('excess'),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to, dept, metric } = parsed.data;
  const months = monthsBetween(from, to);

  const result = await Promise.all(months.map(async (ym) => {
    const recs = await prisma.overtimeRecord.findMany({
      where: { yearMonth: ym, department: dept },
      select: {
        autoHours: true, excessHours: true, extensionHours: true,
        autoAmount: true, excessAmount: true, totalAllowance: true,
      },
    });
    const value = recs.reduce((s, r) => s + ((
      metric === 'auto' ? r.autoHours :
      metric === 'excess' ? r.excessHours :
      r.extensionHours
    ) ?? 0), 0);
    // 금액 라인이 선택된 metric / 부서와 동일 모집단을 보도록 함께 반환 (단위: 천원)
    const amount = recs.reduce((s, r) => s + ((
      metric === 'auto' ? r.autoAmount :
      metric === 'excess' ? r.excessAmount :
      r.totalAllowance
    ) ?? 0), 0);
    return { ym, value, amount: Math.round(amount / 1000) };
  }));

  res.json({ data: result });
});

// ──────────────────────────────────────────────
// GET /api/overtime/job-trend?from=&to=&metric=
// ──────────────────────────────────────────────
router.get('/job-trend', async (req, res) => {
  const parsed = rangeSchema.extend({
    metric: z.enum(['auto', 'excess', 'extension']).default('excess'),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to, metric } = parsed.data;
  const months = monthsBetween(from, to);

  const employees = await prisma.hrEmployee.findMany({
    select: { empNo: true, jobGroup: true },
  });
  const empJobMap = new Map(employees.map(e => [e.empNo, e.jobGroup]));
  const jobGroups = [...new Set(employees.map(e => e.jobGroup))].sort();

  const result = await Promise.all(months.map(async (ym) => {
    const recs = await prisma.overtimeRecord.findMany({
      where: { yearMonth: ym },
      select: {
        empNo: true,
        autoHours: true, excessHours: true, extensionHours: true,
        autoAmount: true, excessAmount: true, totalAllowance: true,
      },
    });

    const row: Record<string, number | string> = { ym };
    const amountRow: Record<string, number | string> = { ym };
    for (const jg of jobGroups) { row[jg] = 0; amountRow[jg] = 0; }

    for (const r of recs) {
      const jg = empJobMap.get(r.empNo);
      if (!jg) continue;
      const v = metric === 'auto' ? (r.autoHours ?? 0)
              : metric === 'excess' ? (r.excessHours ?? 0)
              : (r.extensionHours ?? 0);
      const a = metric === 'auto' ? (r.autoAmount ?? 0)
              : metric === 'excess' ? (r.excessAmount ?? 0)
              : (r.totalAllowance ?? 0);
      (row[jg] as number) += v;
      (amountRow[jg] as number) += a;
    }
    // 금액은 천원 단위로 반환
    for (const jg of jobGroups) amountRow[jg] = Math.round((amountRow[jg] as number) / 1000);
    return { row, amountRow };
  }));

  res.json({
    data: result.map(r => r.row),
    amounts: result.map(r => r.amountRow),
    jobGroups,
  });
});

// ──────────────────────────────────────────────
// GET /api/overtime/person-trend?empNo=&from=&to=
// ──────────────────────────────────────────────
router.get('/person-trend', async (req, res) => {
  const parsed = z.object({
    empNo: z.string(),
    from: z.string().regex(/^\d{4}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}$/),
    metric: z.enum(['auto', 'excess', 'extension']).default('excess'),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { empNo, from, to, metric } = parsed.data;
  const months = monthsBetween(from, to);

  const result = await Promise.all(months.map(async (ym) => {
    const rec = await prisma.overtimeRecord.findUnique({
      where: { yearMonth_empNo: { yearMonth: ym, empNo } },
      select: {
        autoHours: true, excessHours: true, extensionHours: true,
        autoAmount: true, excessAmount: true, totalAllowance: true,
      },
    });
    const value =
      metric === 'auto' ? (rec?.autoHours ?? 0) :
      metric === 'excess' ? (rec?.excessHours ?? 0) :
      (rec?.extensionHours ?? 0);
    // 금액도 metric에 맞춰 반환 — 막대(시간)와 라인(금액)이 동일 모집단을 표시하도록.
    const amount =
      metric === 'auto' ? (rec?.autoAmount ?? 0) :
      metric === 'excess' ? (rec?.excessAmount ?? 0) :
      (rec?.totalAllowance ?? 0);
    return {
      ym,
      value,
      amount: Math.round(amount / 1000),
    };
  }));

  res.json({ data: result });
});

// ──────────────────────────────────────────────
// GET /api/overtime/depts?from=&to=
// ──────────────────────────────────────────────
router.get('/depts', async (req, res) => {
  const parsed = z.object({
    from: z.string().regex(/^\d{4}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}$/),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to } = parsed.data;
  const months = monthsBetween(from, to);

  let depts = await prisma.overtimeRecord.findMany({
    where: { yearMonth: { in: months } },
    select: { department: true },
    distinct: ['department'],
    orderBy: { department: 'asc' },
  });

  // 해당 기간에 데이터가 없으면 fallback으로 전체 부서 반환 (picker가 비어 보이지 않도록)
  if (depts.length === 0) {
    depts = await prisma.overtimeRecord.findMany({
      select: { department: true },
      distinct: ['department'],
      orderBy: { department: 'asc' },
    });
  }

  res.json({ depts: depts.map(d => d.department) });
});

// ──────────────────────────────────────────────
// GET /api/overtime/persons?from=&to=&dept=
// ──────────────────────────────────────────────
router.get('/persons', async (req, res) => {
  const parsed = z.object({
    from: z.string().regex(/^\d{4}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}$/),
    dept: z.string().optional(),
  }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { from, to, dept } = parsed.data;
  const months = monthsBetween(from, to);

  const records = await prisma.overtimeRecord.findMany({
    where: {
      yearMonth: { in: months },
      ...(dept ? { department: dept } : {}),
    },
    select: { empNo: true, name: true, department: true },
    distinct: ['empNo'],
    orderBy: { name: 'asc' },
  });

  res.json({ persons: records });
});

// ──────────────────────────────────────────────
// GET /api/overtime/download?from=YYYY-MM&to=YYYY-MM
// 인사·임금 정보 포함 엑셀 다운로드 — admin 전용
// ──────────────────────────────────────────────
router.get('/download', requireAdmin, async (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');

  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    res.status(400).json({ error: 'invalid_range' });
    return;
  }

  const records = await prisma.overtimeRecord.findMany({
    where: { yearMonth: { gte: from, lte: to } },
    orderBy: [{ yearMonth: 'asc' }, { empNo: 'asc' }],
  });

  const headers = ['연월', '사번', '사원명', '부서', '자동(시간)', '자동연장금액', '초과(시간)', '초과연장금액', '연장(시간)', '연장수당(총계)', '시급'];
  const wsData = [
    headers,
    ...records.map((r) => {
      const [y, m] = r.yearMonth.split('-');
      return [
        `${y}년 ${Number(m)}월`,
        r.empNo, r.name, r.department,
        r.autoHours, r.autoAmount,
        r.excessHours, r.excessAmount,
        r.extensionHours, r.totalAllowance, r.hourlyWage,
      ];
    }),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const headerStyle = {
    font: { bold: true, name: '맑은 고딕', sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    fill: { patternType: 'solid', fgColor: { rgb: 'E8D9E8' } },
  };
  headers.forEach((_, i) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[addr]) ws[addr].s = headerStyle;
  });
  ws['!cols'] = [14, 10, 12, 18, 12, 14, 12, 14, 12, 14, 10].map((w) => ({ wch: w }));
  ws['!rows'] = [{ hpt: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, '연장수당');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 다운로드 기록 — 실패해도 다운로드 자체는 진행
  try {
    await prisma.uploadLog.create({
      data: {
        userId: req.user!.id,
        ip: clientIp(req),
        fileType: 'DOWNLOAD',
        yearMonth: from === to ? from : `${from}~${to}`,
      },
    });
  } catch { /* ignore */ }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="overtime_${from}_${to}.xlsx"`);
  res.send(buf);
});

// ──────────────────────────────────────────────
// POST /api/overtime/report-log
// 대시보드 PDF 보고서 다운로드 기록
// body: { type: 'overview' | 'detail', range?: string }
// ──────────────────────────────────────────────
router.post('/report-log', async (req, res) => {
  const parsed = z.object({
    type: z.enum(['overview', 'detail']),
    range: z.string().max(60).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_params' }); return; }
  const { type, range } = parsed.data;
  const label = type === 'overview' ? '종합보고서' : '상세보고서';
  try {
    await prisma.uploadLog.create({
      data: {
        userId: req.user!.id,
        ip: clientIp(req),
        fileType: 'DOWNLOAD',
        yearMonth: range ? `${label} (${range})` : label,
      },
    });
  } catch { /* ignore */ }
  res.json({ ok: true });
});

export default router;