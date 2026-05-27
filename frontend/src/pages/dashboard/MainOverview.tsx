import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Filter,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../lib/api';

// ── 날짜 유틸 ──────────────────────────────────
export type DateRange = { from: string; to: string };

export function monthsBetween(from: string, to: string): string[] {
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

export function ymBefore(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  let nm = m - n, ny = y;
  while (nm <= 0) { nm += 12; ny--; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function todayPrevMonthYm(): string {
  const d = new Date();
  const m = d.getMonth();
  const y = m === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const pm = m === 0 ? 12 : m;
  return `${y}-${String(pm).padStart(2, '0')}`;
}

export function defaultRange(): DateRange {
  const to = todayPrevMonthYm();
  return { from: to, to };
}

// 부서·개인 상세 모달은 최초 진입 시 4개월(전달 포함 직전 4개월) 추이를 기본 표시.
function defaultDetailRange(): DateRange {
  const to = todayPrevMonthYm();
  return { from: ymBefore(to, 3), to };
}

function labelMonth(ym: string): string {
  const [, m] = ym.split('-');
  return `${Number(m)}월`;
}

export function labelYearMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${String(y).slice(2)}.${m}`;
}

function rangeLabel(months: string[]): string {
  if (months.length === 0) return '';
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const [, fm] = first.split('-');
  const [, lm] = last.split('-');
  if (first === last) return `${Number(fm)}월`;
  return `${Number(fm)}~${Number(lm)}월`;
}

export type Kpi = {
  label: string;
  value: string;
  raw: number;
  unit: string;
  delta: number | null;
};

const JOB_LIST_FOR_FILTER = ['간호직','교수직','기능직','사무직','시설직','약제직','영양직','의료기술직','전공의','행정직'];

const COLOR_AUTO_LIGHT = '#38bdf8';
const COLOR_EXCESS_LIGHT = '#fbbf24';
const COLOR_PERSON_LIGHT = '#a78bfa';

const TOOLTIP_STYLE = {
  background: 'rgba(11, 23, 40, 0.96)',
  border: '1px solid rgba(56, 189, 248, 0.18)',
  borderRadius: '12px',
  color: '#e2e8f0',
  fontSize: 13,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};
const AXIS_TICK_X = { fill: '#94a3b8', fontSize: 12, dy: 6 };
const AXIS_TICK_Y = { fill: '#94a3b8', fontSize: 12, dx: -4 };

const KPI_THEMES = [
  {
    // 총 연장시간
    icon: <Clock size={14} />,
    accent: 'from-sky-400/60 to-sky-300/40',
    iconBg: 'bg-sky-500/15 text-sky-300',
    glow: 'rgba(56,189,248,0.08)',
    sparkColor: '#7dd3fc',
  },
  {
    // 총 연장수당
    icon: <CircleDollarSign size={14} />,
    accent: 'from-amber-400/60 to-orange-300/40',
    iconBg: 'bg-amber-500/15 text-amber-300',
    glow: 'rgba(251,191,36,0.08)',
    sparkColor: '#fcd34d',
  },
  {
    // 초과연장시간
    icon: <TrendingUp size={14} />,
    accent: 'from-rose-400/60 to-pink-300/40',
    iconBg: 'bg-rose-500/15 text-rose-300',
    glow: 'rgba(251,113,133,0.08)',
    sparkColor: '#fda4af',
  },
  {
    // 초과연장수당
    icon: <Banknote size={14} />,
    accent: 'from-violet-400/60 to-fuchsia-300/40',
    iconBg: 'bg-violet-500/15 text-violet-300',
    glow: 'rgba(167,139,250,0.08)',
    sparkColor: '#c4b5fd',
  },
  {
    // 인당 평균
    icon: <Users size={14} />,
    accent: 'from-slate-400/40 to-slate-300/20',
    iconBg: 'bg-slate-500/15 text-slate-400',
    glow: 'rgba(148,163,184,0.06)',
    sparkColor: '#94a3b8',
  },
];

function useCountUp(target: number, duration = 1200, delay = 0) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf: number;
    const run = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start - delay;
      if (elapsed < 0) { raf = requestAnimationFrame(run); return; }
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      // 소수점 유지: 정수 target은 정수로, 소수 target은 소수로
      const raw = eased * target;
      setCount(Number.isInteger(target) ? Math.round(raw) : Math.round(raw * 10) / 10);
      if (progress < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return count;
}

function KpiCard({
  kpi,
  theme,
  delay,
}: {
  kpi: Kpi;
  theme: (typeof KPI_THEMES)[number];
  delay: number;
}) {
  const positive = kpi.delta !== null && kpi.delta > 0;
  const zero = kpi.delta === 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;
  const deltaColor = zero ? 'text-slate-600' : positive ? 'text-rose-400' : 'text-emerald-400';

  const numericValue = parseFloat(String(kpi.value).replace(/,/g, ''));
  const animatedNum = useCountUp(isNaN(numericValue) ? 0 : numericValue, 1400, delay);
  const displayValue = isNaN(numericValue)
    ? kpi.value
    : numericValue >= 1000
    ? Math.round(animatedNum).toLocaleString()
    : numericValue % 1 !== 0
    ? animatedNum.toFixed(1)
    : String(animatedNum);

  return (
    <div
      style={{ animationDelay: `${delay}ms`, '--glow': theme.glow } as React.CSSProperties}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[linear-gradient(145deg,rgba(16,24,44,0.96),rgba(3,9,24,0.99))] px-6 py-5 transition-all duration-300 hover:border-white/[0.15] animate-[kpiEnter_0.6s_cubic-bezier(0.16,1,0.3,1)_backwards]"
    >
      <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${theme.accent}`} />
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.04] blur-3xl transition-opacity duration-500 group-hover:opacity-[0.07]"
        style={{ background: theme.sparkColor }} />
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[14px] font-bold tracking-[0.08em] text-slate-200 uppercase">{kpi.label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.iconBg}`}>
          {theme.icon}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[36px] font-extrabold tracking-[-0.04em] tabular-nums leading-none text-white">
              {displayValue}
            </span>
            <span className="text-[13px] font-semibold text-slate-500 shrink-0">{kpi.unit}</span>
          </div>
          <div className="mt-2">
            {zero ? (
              <span className="text-[12px] text-slate-600">전월 동일</span>
            ) : kpi.delta === null ? null : (
              <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${deltaColor}`}>
                <TrendIcon size={12} />
                {positive ? '+' : ''}{kpi.delta.toFixed(1)}%
                <span className="font-normal text-slate-500">전월 대비</span>
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export function JobFilterSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fn(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex h-[36px] items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition ${
          open ? 'border-sky-500/50 bg-white/[0.08] text-white' : 'border-white/[0.1] bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sky-400 shrink-0"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
        <span>{value ?? '전체 직군'}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[148px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0d1525] shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1">
          {[null, ...JOB_LIST_FOR_FILTER].map((j) => (
            <button
              key={j ?? '__all__'}
              type="button"
              onClick={() => { onChange(j); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] transition ${
                value === j ? 'bg-sky-500/15 font-semibold text-sky-300' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              {value === j && <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />}
              <span className={value === j ? '' : 'ml-4'}>{j ?? '전체 직군'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type OverviewDataPayload = {
  kpis: Kpi[];
  hours: Record<string, unknown>[];
  amount: Record<string, unknown>[];
  topDeptsAuto: { name: string; value: number }[];
  topDeptsExcess: { name: string; value: number }[];
  persons: { name: string; dept: string; 초과: number; 초과연장금액: number }[];
};

export default function MainOverview({ range, jobFilter, rangeMode = 'monthly', onDataReady }: { range: DateRange; jobFilter: string | null; rangeMode?: 'monthly' | 'range'; onDataReady?: (data: OverviewDataPayload) => void }) {
  useEffect(() => {
    const id = 'kpi-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes kpiEnter {
        0% { opacity: 0; transform: translateY(24px) scale(0.96); filter: blur(4px); }
        60% { opacity: 1; filter: blur(0); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes slideInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
      @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes modalIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: none; } }
    `;
    document.head.appendChild(style);
  }, []);

  const tableMonths = useMemo(() => monthsBetween(range.from, range.to), [range.from, range.to]);
  const periodLabel = rangeLabel(tableMonths);
  // 차트 기간은 사용자가 설정한 range를 따라감. 단, 단일월일 땐 트렌드 표시를 위해 최근 4개월로 확장
  const chartMonths = useMemo(() => {
    if (range.from === range.to) {
      const from = ymBefore(range.to, 3);
      return monthsBetween(from, range.to);
    }
    return monthsBetween(range.from, range.to);
  }, [range.from, range.to]);
  const showInnerLabels = chartMonths.length <= 4;

  const [kpis, setKpis] = useState<Kpi[]>([]);

  const [hours, setHours] = useState<Record<string, unknown>[]>([]);
  const [amount, setAmount] = useState<Record<string, unknown>[]>([]);
  const [topDeptsAuto, setTopDeptsAuto] = useState<{ name: string; value: number }[]>([]);
  const [topDeptsExcess, setTopDeptsExcess] = useState<{ name: string; value: number }[]>([]);
  const [deptModal, setDeptModal] = useState<{ name: string; metric: 'auto' | 'excess' } | null>(null);
  const [reportPersons, setReportPersons] = useState<{ name: string; dept: string; 초과: number; 초과연장금액: number }[]>([]);
  const [personModal, setPersonModal] = useState<{ name: string; dept: string; empNo: string } | null>(null);

  // 페이지 진입 직후 KPI 카드 enter 애니메이션과 레이아웃 안정화 시간을 기다린 뒤 메인 차트를 마운트.
  // 이 가드가 없으면 ResponsiveContainer가 안정되지 않은 size로 첫 측정 → enter 애니메이션이
  // invisible 상태에서 끝나고, 데이터 도착 시 update transition으로 "밑에서 찌그러져 올라오는" 효과가 보임.
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setChartReady(true), 250);
    return () => clearTimeout(t);
  }, []);

  // 월간 모드일 때만 전월 대비 표시 (선택된 월의 직전월과 비교)
  const isMonthly = rangeMode === 'monthly';

  const fetchKpis = useCallback(async () => {
    try {
      const { data } = await api.get('/overtime/kpis', {
        params: { from: range.from, to: range.to, ...(jobFilter ? { jobGroup: jobFilter } : {}) },
      });

      let pct: (cur: number, pre: number) => number | null = () => null;
      if (isMonthly) {
        // 월간 모드: 선택된 월의 직전월과 비교
        const selectedYm = range.to;
        const prevYm = ymBefore(selectedYm, 1);
        const prev = await api.get('/overtime/kpis', {
          params: { from: prevYm, to: prevYm, ...(jobFilter ? { jobGroup: jobFilter } : {}) },
        });
        const p = prev.data;
        pct = (cur: number, pre: number) => pre === 0 ? null : Math.round((cur - pre) / pre * 100 * 10) / 10;
        const c = data;
        const exAmt = c.excessAmount ?? 0;
        const pExAmt = p.excessAmount ?? 0;
        setKpis([
          { label: '총 연장시간', value: Math.round(c.totalHours).toLocaleString(), raw: c.totalHours, unit: '시간', delta: pct(c.totalHours, p.totalHours) },
          { label: '총 연장수당', value: (c.totalAmount / 10000000).toFixed(1), raw: c.totalAmount, unit: '천만원', delta: pct(c.totalAmount, p.totalAmount) },
          { label: '초과연장시간', value: Math.round(c.excessHours).toLocaleString(), raw: c.excessHours, unit: '시간', delta: pct(c.excessHours, p.excessHours) },
          { label: '초과연장수당', value: (exAmt / 10000000).toFixed(1), raw: exAmt, unit: '천만원', delta: pct(exAmt, pExAmt) },
          { label: '인당 평균', value: c.avgPerPerson.toFixed(1), raw: c.avgPerPerson, unit: '시간/명', delta: pct(c.avgPerPerson, p.avgPerPerson) },
        ]);
      } else {
        // 기간 모드: 전월 대비 없이 합산 표시
        const c = data;
        const exAmt = c.excessAmount ?? 0;
        setKpis([
          { label: '총 연장시간', value: Math.round(c.totalHours).toLocaleString(), raw: c.totalHours, unit: '시간', delta: null },
          { label: '총 연장수당', value: (c.totalAmount / 10000000).toFixed(1), raw: c.totalAmount, unit: '천만원', delta: null },
          { label: '초과연장시간', value: Math.round(c.excessHours).toLocaleString(), raw: c.excessHours, unit: '시간', delta: null },
          { label: '초과연장수당', value: (exAmt / 10000000).toFixed(1), raw: exAmt, unit: '천만원', delta: null },
          { label: '인당 평균', value: c.avgPerPerson.toFixed(1), raw: c.avgPerPerson, unit: '시간/명', delta: null },
        ]);
      }
    } catch { /* 에러 무시 */ }
  }, [range.from, range.to, jobFilter, isMonthly]);

  const fetchChartData = useCallback(async () => {
    if (chartMonths.length === 0) return;
    try {
      const [hRes, aRes] = await Promise.all([
        api.get('/overtime/hours-trend', { params: { from: chartMonths[0], to: chartMonths[chartMonths.length - 1] } }),
        api.get('/overtime/amount-trend', { params: { from: chartMonths[0], to: chartMonths[chartMonths.length - 1] } }),
      ]);
      setHours(hRes.data.data.map((r: Record<string, unknown>) => ({ ...r, label: labelMonth(r.ym as string) })));
      setAmount(aRes.data.data.map((r: Record<string, unknown>) => ({
        ...r,
        label: labelMonth(r.ym as string),
        자동연장: ((r.자동연장 as number) / 10000000),
        초과연장: ((r.초과연장 as number) / 10000000),
        총합: ((r.총합 as number) / 10000000),
      })));
    } catch { /* 에러 무시 */ }
  }, [chartMonths]);



  const fetchTopDepts = useCallback(async () => {
    try {
      const [autoRes, excessRes, personsRes] = await Promise.all([
        api.get('/overtime/top-depts', { params: { from: tableMonths[0], to: tableMonths[tableMonths.length - 1], metric: 'auto', limit: 20 } }),
        api.get('/overtime/top-depts', { params: { from: tableMonths[0], to: tableMonths[tableMonths.length - 1], metric: 'excess', limit: 20 } }),
        api.get('/overtime/top-persons', { params: { from: tableMonths[0], to: tableMonths[tableMonths.length - 1], limit: 15 } }),
      ]);
      setTopDeptsAuto(autoRes.data.data);
      setTopDeptsExcess(excessRes.data.data);
      setReportPersons(personsRes.data.data.map((p: { name: string; dept: string; 초과: number; 초과연장: number }) => ({
        name: p.name, dept: p.dept, 초과: p.초과, 초과연장금액: Math.round(p.초과연장 / 1000),
      })));
    } catch { /* 에러 무시 */ }
  }, [tableMonths]);

  useEffect(() => { void fetchKpis(); }, [fetchKpis]);
  useEffect(() => { void fetchChartData(); }, [fetchChartData]);

  useEffect(() => { void fetchTopDepts(); }, [fetchTopDepts]);

  useEffect(() => {
    onDataReady?.({ kpis, hours, amount, topDeptsAuto, topDeptsExcess, persons: reportPersons });
  }, [onDataReady, kpis, hours, amount, topDeptsAuto, topDeptsExcess, reportPersons]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k, i) => (
          <KpiCard
            key={k.label}
            kpi={k}
            theme={KPI_THEMES[i]!}
            delay={i * 60}
  
          />
        ))}
      </div>

      <div className="mt-5 grid items-stretch gap-4 lg:grid-cols-[0.9fr_1.6fr_1.5fr]">
        {/* 좌: 연장시간 + 연장수당 */}
        <Panel>
          <div className="flex flex-col gap-4">
            <Section title="연장시간" subtitle="(단위: 시간)">
              {(chartReady && hours.length > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={hours} margin={{ top: showInnerLabels ? 32 : 20, right: 36, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fill-auto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#64748b" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#64748b" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="fill-excess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
                  <Tooltip content={<HoursTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
                  <Legend
                    wrapperStyle={{ width: '100%', left: 0 }}
                    content={({ payload }) => (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, paddingTop: 10 }}>
                        {payload?.map((p) => (
                          <span key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                            {p.value === '자동' ? '자동연장' : p.value === '초과' ? '초과연장' : '연장시간'}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                  <Area type="monotone" dataKey="자동" stackId="h" stroke="#94a3b8" strokeWidth={0} fill="url(#fill-auto)" name="자동" isAnimationActive animationDuration={900}>
                    {showInnerLabels && (
                      <LabelList dataKey="자동" position="insideTop" fill="#e2e8f0" fontSize={10} offset={6} formatter={(v: number) => v.toLocaleString()} />
                    )}
                  </Area>
                  <Area type="monotone" dataKey="초과" stackId="h" stroke="#f59e0b" strokeWidth={1.5} fill="url(#fill-excess)" name="초과" isAnimationActive animationDuration={1100}>
                    {showInnerLabels && (
                      <LabelList dataKey="초과" position="insideTop" fill="#fff" fontSize={10} offset={6} formatter={(v: number) => v.toLocaleString()} />
                    )}
                  </Area>
                  <Line
                    type="monotone" dataKey="총연장" name="연장시간"
                    stroke="#f87171" strokeWidth={2}
                    dot={showInnerLabels ? { r: 4, fill: '#f87171', stroke: '#0b1728', strokeWidth: 2 } : false}
                    activeDot={{ r: 5, fill: '#f87171', stroke: '#0b1728', strokeWidth: 2 }}
                    isAnimationActive animationDuration={1300}
                  >
                    {showInnerLabels && (
                      <LabelList dataKey="총연장" position="top" fill="#f87171" fontSize={11} fontWeight={700} offset={10} formatter={(v: number) => v.toLocaleString()} />
                    )}
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
              ) : <div style={{ height: 280 }} />}
            </Section>

            <div className="border-t border-white/[0.05]" />

            <Section title="연장수당" subtitle="(단위: 천만원)">
              {(chartReady && amount.length > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart key={amount.length} data={amount} margin={{ top: showInnerLabels ? 32 : 20, right: 36, left: -20, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AmountTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Legend
                    wrapperStyle={{ width: '100%', left: 0 }}
                    content={({ payload }) => (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, paddingTop: 10 }}>
                        {payload?.map((p) => (
                          <span key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                            {p.value}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                  <Bar dataKey="자동연장" stackId="a" fill="#475569" name="자동연장" isAnimationActive animationDuration={900}>
                    {showInnerLabels && (
                      <LabelList dataKey="자동연장" position="insideTop" fill="#e2e8f0" fontSize={10} offset={6} formatter={(v: number) => v.toFixed(1)} />
                    )}
                  </Bar>
                  <Bar dataKey="초과연장" stackId="a" fill="#d97706" name="초과연장" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={900} animationBegin={900}>
                    {showInnerLabels && (
                      <LabelList dataKey="초과연장" position="insideTop" fill="#fff" fontSize={10} offset={6} formatter={(v: number) => v.toFixed(1)} />
                    )}
                  </Bar>
                  <Line
                    type="monotone" dataKey="총합" name="연장수당"
                    stroke="#f87171" strokeWidth={2}
                    dot={showInnerLabels ? { r: 4, fill: '#f87171', stroke: '#0b1728', strokeWidth: 2 } : false}
                    activeDot={{ r: 5, fill: '#f87171', stroke: '#0b1728', strokeWidth: 2 }}
                    isAnimationActive animationDuration={1300}
                  >
                    {showInnerLabels && (
                      <LabelList dataKey="총합" position="top" fill="#f87171" fontSize={11} fontWeight={700} offset={10} formatter={(v: number) => v.toFixed(1)} />
                    )}
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
              ) : <div style={{ height: 280 }} />}
            </Section>
          </div>
        </Panel>

        {/* 중: 부서 TOP 20 */}
        <Panel>
          <PanelHeader title={`${periodLabel} 초과근무 상위 20개 부서`} unitLabel="(단위: 시간)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <SubPanel title="자동 연장" titleTone="auto">
              <ClickableTopList
                items={topDeptsAuto}
                tone="auto"
                onClick={(name) => setDeptModal({ name, metric: 'auto' })}
              />
            </SubPanel>
            <SubPanel title="초과 연장" titleTone="excess">
              <ClickableTopList
                items={topDeptsExcess}
                tone="excess"
                onClick={(name) => setDeptModal({ name, metric: 'excess' })}
              />
            </SubPanel>
          </div>
        </Panel>

        {/* 우: 개인 TOP 15 */}
        <PersonsPanel
          periodLabel={periodLabel}
          months={tableMonths}
          onPersonClick={(name, dept, empNo) => setPersonModal({ name, dept, empNo })}
        />
      </div>

      {deptModal && (
        <DeptDetailModal
          dept={deptModal.name}
          metric={deptModal.metric}
          initialRange={range}
          onClose={() => setDeptModal(null)}
        />
      )}
      {personModal && (
        <PersonDetailModal
          person={personModal.name}
          dept={personModal.dept}
          empNo={personModal.empNo}
          initialRange={range}
          onClose={() => setPersonModal(null)}
        />
      )}
    </>
  );
}

function HoursTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3.5 py-3">
      <div className="mb-2 text-[12px] font-semibold tracking-[0.06em] text-slate-400 uppercase">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-[13px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="ml-auto font-semibold text-white">{(p.value as number).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function AmountTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3.5 py-3">
      <div className="mb-2 text-[12px] font-semibold tracking-[0.06em] text-slate-400 uppercase">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-[13px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="ml-auto font-semibold text-white">{(p.value as number).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-[linear-gradient(160deg,rgba(15,23,42,0.85),rgba(2,8,23,0.97))] py-5 px-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_48px_rgba(0,0,0,0.25)] transition duration-300 hover:border-white/[0.12] ${className}`}>
      {children}
    </div>
  );
}

function PanelHeader({ title, unitLabel }: { title: string; unitLabel?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
      {unitLabel && <span className="text-[12px] font-medium text-slate-400">{unitLabel}</span>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{title}</h4>
        {subtitle && <span className="text-[11.5px] font-medium text-slate-600">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function SubPanel({ title, titleTone, children }: { title: string; titleTone: 'auto' | 'excess'; children: ReactNode }) {
  const accent = titleTone === 'excess'
    ? 'text-amber-400 border-amber-400/20 bg-amber-400/[0.05]'
    : 'text-sky-400 border-sky-400/20 bg-sky-400/[0.05]';
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className={`mb-2.5 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${accent}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${titleTone === 'excess' ? 'bg-amber-400' : 'bg-sky-400'}`} />
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ClickableTopList({
  items, tone, onClick,
}: {
  items: Array<{ name: string; value: number }>;
  tone: 'auto' | 'excess';
  onClick: (name: string) => void;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const barColor = tone === 'excess'
    ? { from: '#d97706', to: '#fbbf24' }
    : { from: '#0284c7', to: '#38bdf8' };

  return (
    <div className="flex flex-col">
      {items.map((it, i) => {
        const pct = (it.value / max) * 100;
        return (
          <button
            key={it.name}
            type="button"
            onClick={() => onClick(it.name)}
            style={{ animationDelay: `${i * 12}ms` }}
            className="group/row flex w-full animate-[slideInRow_0.3s_ease-out_backwards] items-center gap-2 rounded-lg px-2 py-[5px] text-[12px] transition-all duration-150 hover:bg-white/[0.05]"
          >
            <div className="relative w-[72px] shrink-0">
              <div className="truncate text-right text-[12px] text-slate-400 transition group-hover/row:text-white">
                {it.name}
              </div>
              <div className="pointer-events-none absolute right-0 top-1/2 z-50 -translate-y-1/2 translate-x-[calc(100%+6px)] whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#0b1728]/95 px-2.5 py-1.5 text-[12px] font-medium text-white opacity-0 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-opacity duration-150 group-hover/row:opacity-100">
                {it.name}
              </div>
            </div>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${barColor.from}, ${barColor.to})`,
                  boxShadow: `0 0 8px ${barColor.to}66`,
                }}
              />
            </div>
            <div className="w-[44px] shrink-0 text-right text-[11.5px] tabular-nums text-slate-400 transition group-hover/row:text-slate-200">
              {it.value.toLocaleString()}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PersonsPanel({
  periodLabel, months, onPersonClick,
}: {
  periodLabel: string;
  months: string[];
  onPersonClick: (name: string, dept: string, empNo: string) => void;
}) {
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [includedDepts, setIncludedDepts] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [persons, setPersons] = useState<{ empNo: string; name: string; dept: string; 초과: number; 초과연장: number }[]>([]);

  // 기간 변경 시 부서 목록 새로 조회 후 전체 선택으로 초기화
  useEffect(() => {
    if (months.length === 0) return;
    api.get('/overtime/depts', { params: { from: months[0], to: months[months.length - 1] } })
      .then(({ data }) => {
        setAllDepts(data.depts);
        setIncludedDepts(data.depts); // 전체 선택
      })
      .catch(() => {});
  }, [months]);

  useEffect(() => {
    if (months.length === 0) return;
    // 선택된 부서가 없으면 데이터 비움
    if (includedDepts.length === 0) { setPersons([]); return; }

    // 백엔드의 depts(콤마 구분) 파라미터로 한 번에 처리 → 전체/일부 모두 동일 합산 경로 사용,
    // 결과 일관성 보장 + race 위험 감소.
    let alive = true;
    const isAll = includedDepts.length === allDepts.length;
    api.get('/overtime/top-persons', {
      params: {
        from: months[0],
        to: months[months.length - 1],
        limit: 15,
        ...(isAll ? {} : { depts: includedDepts.join(',') }),
      },
    }).then(({ data }) => {
      if (alive) setPersons(data.data);
    }).catch(() => {});

    return () => { alive = false; };
    // months를 deps에 넣으면 기간 변경 시 effect 1(depts)이 includedDepts를 갱신하기 전에
    // 이 effect가 old includedDepts로 한 번 더 fetch하게 되어 setPersons가 2회 호출됨.
    // includedDepts만 deps에 두어 effect 1이 includedDepts를 갱신해야 그제야 1회 fetch됨.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedDepts, allDepts.length]);

  const filterLabel =
    includedDepts.length === allDepts.length
      ? '전체 부서'
      : includedDepts.length === 0
        ? '선택된 부서 없음'
        : `${includedDepts.length}개 부서`;

  const chartData = persons.map((p) => ({
    name: p.name,
    dept: p.dept,
    empNo: p.empNo,
    초과: p.초과,
    초과연장금액: Math.round(p.초과연장 / 1000),
  }));

  return (
    <Panel className="flex flex-col px-2">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
          {periodLabel} 초과근무 상위 15명
        </h3>
        <span className="text-[11.5px] font-medium text-slate-600">(단위: 시간, 천원)</span>
      </div>

      <div className="mb-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] transition hover:border-white/[0.14] hover:bg-white/[0.06]"
        >
          <Filter size={12} className="text-violet-400" />
          <span className="text-slate-500">부서</span>
          <span className="font-medium text-slate-300">{filterLabel}</span>
          <span className="ml-auto text-[11px] text-slate-600">변경 →</span>
        </button>
      </div>

      {persons.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-500">선택된 부서에 데이터가 없습니다.</p>
      ) : (
        <div className="mt-4 flex-1" style={{ minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={320}>
            <ComposedChart
              key={chartData.length ? 'data' : 'empty'}
              data={chartData}
              margin={{ top: 36, right: 8, left: -16, bottom: 108 }}
              barCategoryGap="20%"
              onClick={(e) => {
                if (e?.activePayload?.[0]?.payload) {
                  const d = e.activePayload[0].payload;
                  onPersonClick(d.name, d.dept, d.empNo);
                }
              }}
            >
              <defs>
                <linearGradient id="person-bar-excess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={1} />
                  <stop offset="100%" stopColor="#0369a1" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="transparent"
                tick={({ x, y, payload }) => (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={32} textAnchor="end" transform="rotate(-40)" fill="#94a3b8" fontSize={12} style={{ cursor: 'pointer' }}>
                      {payload.value}
                    </text>
                  </g>
                )}
                axisLine={false} tickLine={false} interval={0}
              />
              <YAxis yAxisId="left" stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickCount={6} allowDecimals={false} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <YAxis yAxisId="right" orientation="right" stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickCount={6} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={TOOLTIP_STYLE} className="px-3 py-2.5">
                      <div className="mb-1.5 text-[12px] font-semibold text-white">{label} <span className="text-slate-500 font-normal text-[11px]">{d?.dept}</span></div>
                      {payload.map((p) => (
                        <div key={String(p.dataKey)} className="flex items-center gap-2 text-[12px]">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                          <span className="text-slate-300">{p.name}</span>
                          <span className="ml-auto font-semibold text-white">
                            {p.dataKey === '초과연장금액'
                              ? `${(p.value as number).toLocaleString()}천원`
                              : `${(p.value as number).toLocaleString()}시간`}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Legend
                wrapperStyle={{ width: '100%', left: 0 }}
                content={({ payload }) => (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, paddingTop: 44 }}>
                    {payload?.map((p) => (
                      <span key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color as string, display: 'inline-block' }} />
                        {p.value}
                      </span>
                    ))}
                  </div>
                )}
              />
              <Bar yAxisId="left" dataKey="초과" name="합계 : 초과(시간)" fill="url(#person-bar-excess)" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={900} style={{ cursor: 'pointer' }}>
                <LabelList dataKey="초과" position="insideBottom" fill="#ffffff" fontSize={11} fontWeight={700} offset={10} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="초과연장금액" name="합계 : 초과연장(천원)" stroke="#f0abfc" strokeWidth={2} dot={{ r: 4, fill: '#f0abfc', stroke: '#0b1728', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive animationDuration={1100}>
                <LabelList dataKey="초과연장금액" position="top" angle={-30} fill="#f0abfc" fontSize={11} fontWeight={700} offset={12} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => v.toLocaleString()} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {pickerOpen && (
        <DeptMultiPicker
          allDepts={allDepts}
          selected={includedDepts}
          onChange={setIncludedDepts}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Panel>
  );
}

function DeptMultiPicker({
  allDepts, selected, onChange, onClose,
}: {
  allDepts: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return allDepts;
    return allDepts.filter((d) => d.includes(q));
  }, [allDepts, search]);

  function toggle(d: string) {
    if (selected.includes(d)) onChange(selected.filter((x) => x !== d));
    else onChange([...selected, d]);
  }

  const allSelected = allDepts.length > 0 && selected.length === allDepts.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      style={{ animation: 'overlayIn 0.18s ease-out' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-t-[28px] border border-white/[0.1] bg-[#0b1728] sm:rounded-[24px]"
        style={{ boxShadow: '0 -24px 80px rgba(2,132,199,0.15)', animation: 'modalIn 0.22s ease-out' }}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-white">부서 필터</h2>
            <span className="rounded-full bg-sky-500/[0.15] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-sky-300">
              {selected.length}/{allDepts.length}
            </span>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-white">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="부서 검색..."
                className="h-[36px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500/40 focus:bg-white/[0.07]"
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(allSelected ? [] : [...allDepts])}
              className={`h-[36px] shrink-0 rounded-[10px] border px-3.5 text-[12px] font-medium transition ${
                allSelected
                  ? 'border-rose-400/20 bg-rose-500/[0.07] text-rose-300 hover:bg-rose-500/[0.12]'
                  : 'border-sky-400/20 bg-sky-500/[0.07] text-sky-300 hover:bg-sky-500/[0.12]'
              }`}
            >
              {allSelected ? '모두 해제' : '모두 선택'}
            </button>
          </div>
        </div>

        <div className="mx-5 border-t border-white/[0.06]" />

        <div className="overflow-y-auto px-5 pt-3" style={{ height: '400px' }}>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-600">"{search}"에 해당하는 부서가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 pb-2">
              {filtered.map((d) => {
                const checked = selected.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggle(d)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-150 ${
                      checked
                        ? 'border-sky-500/35 bg-sky-500/[0.10] text-white'
                        : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200'
                    }`}
                  >
                    <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all ${checked ? 'border-sky-400/80 bg-sky-500' : 'border-white/20 bg-transparent'}`}>
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.2 2.5 4-4" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate font-medium leading-none">{d}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[14px] bg-gradient-to-r from-blue-600 to-sky-500 py-[13px] text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.25)] transition hover:brightness-110 active:scale-[0.99]"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

function DeptDetailModal({
  dept, metric, initialRange, onClose,
}: {
  dept: string;
  metric: 'auto' | 'excess';
  initialRange?: DateRange;
  onClose: () => void;
}) {
  const [r, setR] = useState<DateRange>(initialRange ?? defaultDetailRange());
  const months = useMemo(() => monthsBetween(r.from, r.to), [r]);
  const [data, setData] = useState<{ label: string; value: number }[]>([]);
  // 모달 등장 애니메이션(220ms)이 끝나고 ResponsiveContainer size가 안정된 뒤 차트를 마운트해야
  // recharts의 enter 애니메이션이 처음부터 정상 작동한다.
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setChartReady(true), 260);
    return () => clearTimeout(t);
  }, []);
  const metricLabel = metric === 'auto' ? '자동연장' : '초과연장';
  const lineColor = metric === 'auto' ? COLOR_AUTO_LIGHT : COLOR_EXCESS_LIGHT;

  useEffect(() => {
    if (months.length === 0) return;
    api.get('/overtime/dept-trend', {
      params: { dept, from: months[0], to: months[months.length - 1], metric },
    }).then(({ data: res }) => {
      setData(res.data.map((d: { ym: string; value: number }) => ({ ...d, label: labelYearMonth(d.ym) })));
    }).catch(() => {});
  }, [dept, months, metric]);

  return (
    <Modal title={`${dept} · ${metricLabel} 추이`} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <RangePicker range={r} onChange={setR} />
        <span className="text-[12px] text-slate-400">(단위: 시간)</span>
      </div>
      <div className="rounded-[14px] border border-white/10 bg-white/[0.025] p-4">
        {(chartReady && data.length > 0) ? (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 40, right: 24, left: 8, bottom: 20 }}>
            <defs>
              <linearGradient id="dept-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="80%" stopColor={lineColor} stopOpacity={0.03} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" stroke="transparent" tick={AXIS_TICK_X} axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis stroke="transparent" tick={AXIS_TICK_Y} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
            <Area
              type="monotone" dataKey="value"
              stroke={lineColor} strokeWidth={2.5}
              fill="url(#dept-fill)"
              dot={{ r: 4, fill: lineColor, stroke: '#0b1728', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: lineColor, stroke: '#0b1728', strokeWidth: 2 }}
              name={metricLabel}
              isAnimationActive animationDuration={900} animationEasing="ease-out"
            >
              <LabelList dataKey="value" position="top" offset={18} fill="#e2e8f0" fontSize={13} fontWeight={600} formatter={(v: number) => v.toLocaleString()} />
            </Area>
          </ComposedChart>
        </ResponsiveContainer>
        ) : <div style={{ height: 300 }} />}
      </div>
    </Modal>
  );
}

function PersonDetailModal({
  person, dept, empNo, initialRange, onClose,
}: {
  person: string;
  dept: string;
  empNo: string;
  initialRange?: DateRange;
  onClose: () => void;
}) {
  const [r, setR] = useState<DateRange>(initialRange ?? defaultDetailRange());
  const months = useMemo(() => monthsBetween(r.from, r.to), [r]);
  const [data, setData] = useState<{ label: string; value: number; amount: number }[]>([]);
  // 모달 등장 애니메이션(220ms) 종료 후 차트 마운트 → enter 애니메이션 정상 작동
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setChartReady(true), 260);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (months.length === 0) return;
    api.get('/overtime/person-trend', {
      params: { empNo, from: months[0], to: months[months.length - 1] },
    }).then(({ data: res }) => {
      setData(res.data.map((d: { ym: string; value: number; amount: number }) => ({
        ...d, label: labelYearMonth(d.ym),
      })));
    }).catch(() => {});
  }, [empNo, months]);

  const LINE_AMT = '#f0abfc';
  const BAR_COLOR = COLOR_PERSON_LIGHT;
  const showLabels = months.length <= 6;

  return (
    <Modal title={`${person} (${dept}) · 초과근무 추이`} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <RangePicker range={r} onChange={setR} />
        <div className="flex items-center gap-4">
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#cbd5e1' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: BAR_COLOR, display: 'inline-block' }} />초과(시간)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#cbd5e1' }}>
            <span style={{ width: 20, height: 2.5, borderRadius: 4, background: LINE_AMT, display: 'inline-block' }} />금액(천원)
          </span>
        </div>
      </div>
      <div className="rounded-[14px] border border-white/10 bg-white/[0.025] p-3">
        {(chartReady && data.length > 0) ? (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 28, right: 16, left: -20, bottom: 4 }} barCategoryGap="40%">
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" stroke="transparent" tick={AXIS_TICK_X} axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis yAxisId="left" stroke="transparent" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="right" orientation="right" stroke="transparent" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toLocaleString()} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={TOOLTIP_STYLE} className="px-3 py-2.5">
                    <div className="mb-1.5 text-[12px] font-semibold text-white">{label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                        <span className="text-slate-300">{p.name}</span>
                        <span className="ml-auto font-semibold text-white">
                          {p.dataKey === 'amount' ? `${(p.value as number).toLocaleString()}천원` : `${(p.value as number).toLocaleString()}시간`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar yAxisId="left" dataKey="value" name="초과" fill="#38bdf8" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800}>
              {showLabels && (
                <LabelList dataKey="value" position="insideBottom" offset={10} fill="#ffffff" stroke="#0b1728" strokeWidth={3} paintOrder="stroke" fontSize={12} fontWeight={700} formatter={(v: number) => v.toLocaleString()} />
              )}
            </Bar>
            <Line
              yAxisId="right" type="monotone" dataKey="amount" name="금액"
              stroke={LINE_AMT} strokeWidth={2.5}
              dot={{ r: 4, fill: LINE_AMT, stroke: '#0b1728', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: LINE_AMT, stroke: '#0b1728', strokeWidth: 2 }}
              isAnimationActive animationDuration={1100}
            >
              {showLabels && (
                <LabelList dataKey="amount" position="top" offset={10} fill={LINE_AMT} fontSize={11} fontWeight={600} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => `${v.toLocaleString()}천원`} />
              )}
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
        ) : <div style={{ height: 280 }} />}
      </div>
    </Modal>
  );
}

const KOREAN_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [navYear, setNavYear] = useState(parseInt(value.split('-')[0], 10));
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const valYear = parseInt(value.split('-')[0], 10);
  const valMonth = parseInt(value.split('-')[1], 10);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 220);
    }
    setNavYear(valYear);
    setOpen((p) => !p);
  }

  function pick(m: number) {
    onChange(`${navYear}-${String(m).padStart(2, '0')}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="flex h-[36px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white transition hover:border-sky-300/30 hover:bg-white/[0.07]"
      >
        <span className="tabular-nums">{value}</span>
      </button>
      {open && (
        <div
          ref={ref}
          className={`absolute left-0 z-[100] w-[220px] animate-[modalIn_0.15s_ease-out] rounded-[14px] border border-white/10 bg-[#0b1728] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] ${
            dropUp ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          }`}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <button type="button" onClick={() => setNavYear((y) => y - 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13px] font-semibold text-white tabular-nums">{navYear}</span>
            <button type="button" onClick={() => setNavYear((y) => y + 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {KOREAN_MONTHS.map((label, idx) => {
              const m = idx + 1;
              const isSelected = navYear === valYear && m === valMonth;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  className={`rounded-lg py-2 text-[12px] font-medium transition ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
                      : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function RangePicker({
  range, onChange, label = '기간 설정',
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  label?: string;
}) {
  function clamp(from: string, to: string) {
    return from <= to ? { from, to } : { from: to, to: from };
  }

  return (
    <div className="flex items-center gap-2 text-[13px] text-slate-300">
      <span className="rounded-full border border-sky-400/[0.16] bg-sky-400/[0.06] px-3 py-1 text-[12px] font-semibold tracking-[0.12em] text-sky-300/80 uppercase">
        {label}
      </span>
      <MonthPicker value={range.from} onChange={(v) => onChange(clamp(v, range.to))} />
      <span className="text-slate-500">~</span>
      <MonthPicker value={range.to} onChange={(v) => onChange(clamp(range.from, v))} />
    </div>
  );
}

export type RangeMode = 'monthly' | 'range';

export function formatYm(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}. ${Number(m)}월`;
}

// 팝오버 내부에서만 쓰이는 12개월 그리드 (외곽 chrome 없음 — wrapper가 입힘)
function MonthGridInner({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valYear = parseInt(value.split('-')[0], 10);
  const valMonth = parseInt(value.split('-')[1], 10);
  const [navYear, setNavYear] = useState(valYear);
  useEffect(() => { setNavYear(valYear); }, [valYear]);

  return (
    <div className="w-[212px]">
      <div className="mb-2.5 flex items-center justify-between">
        <button type="button" onClick={() => setNavYear((y) => y - 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white">
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-semibold text-white tabular-nums">{navYear}</span>
        <button type="button" onClick={() => setNavYear((y) => y + 1)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {KOREAN_MONTHS.map((label, idx) => {
          const m = idx + 1;
          const isSelected = navYear === valYear && m === valMonth;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(`${navYear}-${String(m).padStart(2, '0')}`)}
              className={`rounded-lg py-2 text-[12px] font-medium transition ${
                isSelected
                  ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]'
                  : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ModeRangePicker({
  mode, onModeChange, range, onChange,
}: {
  mode: RangeMode;
  onModeChange: (m: RangeMode) => void;
  range: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 기간 모드에서는 팝오버를 적용 버튼으로 닫기 전까지 임시 값을 유지
  const [draftRange, setDraftRange] = useState<DateRange>(range);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => { setDraftRange(range); }, [range, open]);

  function clamp(from: string, to: string): DateRange {
    return from <= to ? { from, to } : { from: to, to: from };
  }

  function handleModeClick(next: RangeMode) {
    if (next === 'monthly' && range.from !== range.to) {
      // 기간 → 월간: 종료월 기준 단일월로 수렴
      onChange({ from: range.to, to: range.to });
    }
    if (next !== mode) onModeChange(next);
    // 같은 버튼 다시 누르면 토글, 다른 버튼이면 항상 열기
    setOpen((cur) => (next === mode ? !cur : true));
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3 text-[13px] text-slate-300">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {(['monthly', 'range'] as RangeMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeClick(m)}
            className={`rounded-xl px-3.5 py-1.5 text-[12px] font-semibold transition ${
              mode === m
                ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {m === 'monthly' ? '월간' : '기간'}
          </button>
        ))}
      </div>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 animate-[modalIn_0.16s_ease-out] rounded-[16px] border border-white/10 bg-[#0b1728] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        >
          {mode === 'monthly' ? (
            <MonthGridInner
              value={range.to}
              onChange={(v) => { onChange({ from: v, to: v }); setOpen(false); }}
            />
          ) : (
            <div>
              <div className="flex gap-4">
                <div>
                  <div className="mb-2 text-center text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">시작월</div>
                  <MonthGridInner value={draftRange.from} onChange={(v) => setDraftRange((d) => ({ ...d, from: v }))} />
                </div>
                <div className="w-px self-stretch bg-white/[0.06]" />
                <div>
                  <div className="mb-2 text-center text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">종료월</div>
                  <MonthGridInner value={draftRange.to} onChange={(v) => setDraftRange((d) => ({ ...d, to: v }))} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => { onChange(clamp(draftRange.from, draftRange.to)); setOpen(false); }}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] transition hover:brightness-110"
              >
                적용
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Modal({
  title, children, onClose, width = 'w-full max-w-[720px]', footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: string;
  footer?: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[overlayIn_0.15s_ease-out]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '92vh' }}
        className={`flex ${width} animate-[modalIn_0.22s_ease-out] flex-col rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,8,23,0.99))] p-5 shadow-[0_0_60px_rgba(2,132,199,0.18)] backdrop-blur-2xl`}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="mt-4 shrink-0 border-t border-white/[0.08] pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}