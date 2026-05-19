import { memo, useEffect, useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import {
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
import {
  labelYearMonth,
  monthsBetween,
  todayPrevMonthYm,
  ymBefore,
} from './MainOverview';
import { RangePicker, type DateRange } from './MainOverview';

// =====================
// 색상
// =====================
const BAR_PALETTES = [
  '#38bdf8','#f97316','#94a3b8','#64748b','#7dd3fc',
  '#fdba74','#cbd5e1','#475569','#bae6fd','#fed7aa',
];
const LINE_COLOR = '#fbbf24';

const TOOLTIP_STYLE = {
  background: 'rgba(11,23,40,0.97)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#e2e8f0',
  fontSize: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
};

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const amountEntry = payload.find((p) => p.dataKey === '금액');
  const barEntries = payload.filter((p) => p.dataKey !== '금액');
  return (
    <div style={TOOLTIP_STYLE}>
      <div className="mb-2 text-[14px] font-semibold tracking-[0.08em] text-slate-500 uppercase">{label}</div>
      {barEntries.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2.5 py-0.5 text-[13px]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-white">{(p.value as number).toLocaleString()}</span>
        </div>
      ))}
      {amountEntry && (
        <>
          <div className="my-2 border-t border-white/[0.08]" />
          <div className="flex items-center gap-2.5 text-[13px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LINE_COLOR }} />
            <span className="text-slate-300">금액(천원)</span>
            <span className="ml-auto font-semibold tabular-nums text-amber-300">{(amountEntry.value as number).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

function BarLegend({ categories, showAmount }: { categories: string[]; showAmount: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 20px', paddingTop: 14 }}>
      {categories.map((c, i) => (
        <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: BAR_PALETTES[i % BAR_PALETTES.length], display: 'inline-block', flexShrink: 0 }} />
          {c}
        </span>
      ))}
      {showAmount && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
          <span style={{ width: 24, height: 2.5, borderRadius: 4, background: LINE_COLOR, display: 'inline-block', flexShrink: 0 }} />
          금액
        </span>
      )}
    </div>
  );
}

type OvertimeType = '자동연장' | '초과연장' | '총연장';
const ALL_TYPES: OvertimeType[] = ['자동연장', '초과연장', '총연장'];
const JOB_LIST = ['간호직','교수직','기능직','사무직','시설직','약제직','영양직','의료기술직','전공의','행정직'];

// 상세탭 기본 기간: 전월 기준 4개월
function detailDefaultRange(): DateRange {
  const to = todayPrevMonthYm();
  const from = ymBefore(to, 3);
  return { from, to };
}

// =====================
// 입장(entrance) vs 갱신(update) 애니메이션 분리
// 처음 데이터가 도착할 땐 긴 애니메이션, 이후 필터 변경 시엔 짧게 → 끊김 방지
// =====================
function useEntranceAnimation(dataReady: boolean) {
  const [isEntrance, setIsEntrance] = useState(true);
  useEffect(() => {
    if (!dataReady) {
      setIsEntrance(true);
      return;
    }
    if (!isEntrance) return;
    const t = setTimeout(() => setIsEntrance(false), 1300);
    return () => clearTimeout(t);
  }, [dataReady, isEntrance]);
  return isEntrance;
}

// =====================
// 메인
// =====================
import type { DetailSectionData } from './ReportDownload';

export default function DetailTrends({ onSectionsChange }: { onSectionsChange?: (sections: DetailSectionData[]) => void }) {
  const [deptSection, setDeptSection] = useState<DetailSectionData | null>(null);
  const [jobSection, setJobSection] = useState<DetailSectionData | null>(null);
  const [personSection, setPersonSection] = useState<DetailSectionData | null>(null);

  useEffect(() => {
    const sections = [deptSection, jobSection, personSection].filter(Boolean) as DetailSectionData[];
    if (sections.length === 0) return;
    // 3개 섹션 데이터 도착 시점 차이로 cascade가 폭주하는 것을 막기 위해 debounce
    const t = setTimeout(() => onSectionsChange?.(sections), 300);
    return () => clearTimeout(t);
  }, [deptSection, jobSection, personSection, onSectionsChange]);

  return (
    <div className="space-y-5">
      <MemoDeptTrendSection onSectionData={setDeptSection} />
      <MemoJobTrendSection onSectionData={setJobSection} />
      <MemoPersonTrendSection onSectionData={setPersonSection} />
    </div>
  );
}

// =====================
// 부서별
// =====================
function DeptTrendSection({ onSectionData }: { onSectionData?: (s: DetailSectionData) => void }) {
  const [range, setRange] = useState<DateRange>(detailDefaultRange());
  const months = useMemo(() => monthsBetween(range.from, range.to), [range.from, range.to]);
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<OvertimeType[]>(['총연장']);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [dataVersion, setDataVersion] = useState(0);

// 부서 목록 로드 — months 변경 시 top5 부서로 초기화
  useEffect(() => {
    if (months.length === 0) return;
    Promise.all([
      api.get('/overtime/depts', { params: { from: months[0], to: months[months.length - 1] } }),
      api.get('/overtime/top-depts', { params: { from: months[0], to: months[months.length - 1], metric: 'excess', limit: 5 } }),
    ]).then(([deptsRes, topRes]) => {
      setAllDepts(deptsRes.data.depts);
      const top5 = (topRes.data.data as { name: string }[]).map((d) => d.name);
      setSelectedDepts(top5);
    }).catch(() => {});
  }, [months]);

  // 차트 데이터 로드 — 각 부서를 range 단위 1회 호출로 배칭 (M+1 calls instead of N×M)
  useEffect(() => {
    if (months.length === 0 || selectedDepts.length === 0) { setData([]); return; }
    const typeMap: Record<string, string> = { '자동연장': 'auto', '초과연장': 'excess', '총연장': 'extension' };
    const metric = typeMap[selectedTypes[0] ?? '총연장'] ?? 'extension';
    const fromYm = months[0]!;
    const toYm = months[months.length - 1]!;

    let cancelled = false;
    Promise.all([
      Promise.all(selectedDepts.map((dept) =>
        api.get('/overtime/dept-trend', { params: { dept, from: fromYm, to: toYm, metric } })
          .then((r) => ({ dept, points: r.data.data as { ym: string; value: number }[] }))
      )),
      api.get('/overtime/amount-trend', { params: { from: fromYm, to: toYm } }),
    ]).then(([deptResults, amtRes]) => {
      if (cancelled) return;
      const amtMap = new Map(
        (amtRes.data.data as { ym: string; 총합: number }[]).map((r) => [r.ym, r.총합 ?? 0])
      );
      const deptMap = new Map(deptResults.map((d) => [d.dept, new Map(d.points.map((p) => [p.ym, p.value]))]));
      const rows = months.map((ym) => {
        const row: Record<string, unknown> = { month: labelYearMonth(ym) };
        for (const dept of selectedDepts) {
          row[dept] = deptMap.get(dept)?.get(ym) ?? 0;
        }
        row['금액'] = Math.round((amtMap.get(ym) ?? 0) / 1000);
        return row;
      });
      setData(rows);
      setDataVersion((v) => v + 1);
      const rangeLabel = months.length > 0 ? (months[0] === months[months.length-1] ? months[0] : `${months[0]} ~ ${months[months.length-1]}`) : '';
      onSectionData?.({
        title: '부서별 누적 추이',
        rangeLabel,
        filterLabel: `${selectedDepts.length}개 부서 · ${selectedTypes[0] ?? '총연장'}`,
        data: rows,
        categories: selectedDepts,
        colors: ['#38bdf8','#f97316','#94a3b8','#64748b','#7dd3fc'],
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [months, selectedDepts, selectedTypes, onSectionData]);

  const showLabels = months.length <= 4 && selectedDepts.length <= 5;
  const isEntrance = useEntranceAnimation(data.length > 0);

  return (
    <SectionCard title="부서별 누적 추이" accentColor="sky" headerRight={<RangePicker range={range} onChange={setRange} />}>
      <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
        <ChartArea empty={selectedDepts.length === 0} emptyLabel="부서">
          <ResponsiveContainer key={data.length === 0 ? 'empty' : `ready-${dataVersion}`} width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: showLabels ? 24 : 16, right: 16, left: -12, bottom: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis yAxisId="left" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <YAxis yAxisId="right" orientation="right" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend content={() => <BarLegend categories={selectedDepts} showAmount />} />
              {selectedDepts.map((d, i) => (
                <Bar key={d} yAxisId="left" dataKey={d} name={d} fill={BAR_PALETTES[i % BAR_PALETTES.length]} radius={[3, 3, 0, 0]} maxBarSize={44} animationDuration={isEntrance ? 650 : 250} animationEasing="ease-out">
                  {showLabels && (
                    <LabelList dataKey={d} position="top" fill="#e2e8f0" fontSize={10} fontWeight={700} offset={6} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                  )}
                </Bar>
              ))}
              <Line yAxisId="right" type="monotone" dataKey="금액" name="금액" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 4, fill: LINE_COLOR, stroke: '#0b1728', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive animationDuration={isEntrance ? 1100 : 400}>
                {months.length <= 6 && (
                  <LabelList dataKey="금액" position="top" fill={LINE_COLOR} fontSize={11} fontWeight={700} offset={10} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                )}
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartArea>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-[0.1em] text-slate-500 uppercase">부서구분</span>
              <span className="text-[10px] text-slate-600">{selectedDepts.length}/{allDepts.length}</span>
            </div>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] transition hover:border-sky-400/20 hover:bg-white/[0.06]">
              <Filter size={12} className="text-sky-400" />
              <span className="font-medium text-slate-300">
                {selectedDepts.length === allDepts.length ? '전체 부서' : selectedDepts.length === 0 ? '선택 없음' : `${selectedDepts.length}개 부서`}
              </span>
              <span className="ml-auto text-[14px] text-slate-600">변경 →</span>
            </button>
          </div>
          <OvertimeTypeSelector selected={selectedTypes} accentColor="sky" onChange={(v) => setSelectedTypes(v as OvertimeType[])} />
        </div>
      </div>
      {pickerOpen && <DeptMultiPicker allDepts={allDepts} selected={selectedDepts} onChange={setSelectedDepts} onClose={() => setPickerOpen(false)} />}
    </SectionCard>
  );
}

// =====================
// 직군별
// =====================
function JobTrendSection({ onSectionData }: { onSectionData?: (s: DetailSectionData) => void }) {
  const [range, setRange] = useState<DateRange>(detailDefaultRange());
  const months = useMemo(() => monthsBetween(range.from, range.to), [range.from, range.to]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<OvertimeType[]>(['총연장']);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [availableJobs, setAvailableJobs] = useState<string[]>(JOB_LIST);

// 기간 변경 시 job-trend로 상위 5개 직군 자동 초기화
  useEffect(() => {
    if (months.length === 0) return;
    api.get('/overtime/job-trend', { params: { from: months[0], to: months[months.length - 1], metric: 'excess' } })
      .then(({ data: res }) => {
        setAvailableJobs(res.jobGroups);
        // 기간 합산 후 상위 5개 직군 선택
        const totals: Record<string, number> = {};
        for (const row of res.data as Record<string, unknown>[]) {
          for (const jg of res.jobGroups as string[]) {
            totals[jg] = (totals[jg] ?? 0) + ((row[jg] as number) ?? 0);
          }
        }
        const top5 = Object.entries(totals)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([jg]) => jg);
        setSelectedCats(top5);
      }).catch(() => {});
  }, [months]);

  useEffect(() => {
    if (months.length === 0 || selectedCats.length === 0) { setData([]); return; }
    const metricMap: Record<string, string> = { '자동연장': 'auto', '초과연장': 'excess', '총연장': 'extension' };
    const metric = metricMap[selectedTypes[0] ?? '총연장'] ?? 'extension';

    let cancelled = false;
    Promise.all([
      api.get('/overtime/job-trend', { params: { from: months[0], to: months[months.length - 1], metric } }),
      api.get('/overtime/amount-trend', { params: { from: months[0], to: months[months.length - 1] } }),
    ])
      .then(([jobRes, amtRes]) => {
        if (cancelled) return;
        const res = jobRes.data;
        setAvailableJobs(res.jobGroups);
        const amtMap = new Map<string, number>(
          (amtRes.data.data as { ym: string; 총합: number }[]).map((r) => [r.ym, r.총합 ?? 0])
        );
        const mapped = res.data.map((row: Record<string, unknown>) => ({
          month: labelYearMonth(row.ym as string),
          ...Object.fromEntries(selectedCats.map((c) => [c, row[c] ?? 0])),
          금액: Math.round((amtMap.get(row.ym as string) ?? 0) / 1000),
        }));
        setData(mapped);
        setDataVersion((v) => v + 1);
        const rangeLabel = months.length > 0 ? (months[0] === months[months.length-1] ? months[0] : `${months[0]} ~ ${months[months.length-1]}`) : '';
        onSectionData?.({
          title: '직군별 누적 추이',
          rangeLabel,
          filterLabel: `${selectedCats.length}개 직군 · ${selectedTypes[0] ?? '총연장'}`,
          data: mapped,
          categories: selectedCats,
          colors: ['#38bdf8','#f97316','#94a3b8','#64748b','#7dd3fc'],
        });
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [months, selectedCats, selectedTypes, onSectionData]);

  const showLabels = months.length <= 4 && selectedCats.length <= 5;
  const isEntrance = useEntranceAnimation(data.length > 0);

  return (
    <SectionCard title="직군별 누적 추이" accentColor="violet" headerRight={<RangePicker range={range} onChange={setRange} />}>
      <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
        <ChartArea empty={selectedCats.length === 0} emptyLabel="직군">
          <ResponsiveContainer key={data.length === 0 ? 'empty' : `ready-${dataVersion}`} width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 36, right: 16, left: -12, bottom: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis yAxisId="left" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <YAxis yAxisId="right" orientation="right" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend content={() => <BarLegend categories={selectedCats} showAmount />} />
              {selectedCats.map((c, i) => (
                <Bar key={c} yAxisId="left" dataKey={c} name={c} fill={BAR_PALETTES[i % BAR_PALETTES.length]} radius={[3, 3, 0, 0]} maxBarSize={44} animationDuration={isEntrance ? 650 : 250} animationEasing="ease-out">
                  {showLabels && (
                    <LabelList dataKey={c} position="top" fill="#e2e8f0" fontSize={10} fontWeight={700} offset={6} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                  )}
                </Bar>
              ))}
              <Line yAxisId="right" type="monotone" dataKey="금액" name="금액" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 4, fill: LINE_COLOR, stroke: '#0b1728', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive animationDuration={isEntrance ? 1100 : 400}>
                {months.length <= 6 && (
                  <LabelList dataKey="금액" position="top" fill={LINE_COLOR} fontSize={11} fontWeight={700} offset={10} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                )}
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartArea>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-[0.06em] text-slate-400">직군구분</span>
              <span className="text-[11px] text-slate-600">{selectedCats.length}/{availableJobs.length}</span>
            </div>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] transition hover:border-violet-400/20 hover:bg-white/[0.06]">
              <Filter size={12} className="text-violet-400" />
              <span className="font-medium text-slate-300">
                {selectedCats.length === availableJobs.length ? '전체 직군' : selectedCats.length === 0 ? '선택 없음' : `${selectedCats.length}개 직군`}
              </span>
              <span className="ml-auto text-[11px] text-slate-600">변경 →</span>
            </button>
          </div>
          <OvertimeTypeSelector selected={selectedTypes} accentColor="violet" onChange={(v) => setSelectedTypes(v as OvertimeType[])} />
        </div>
      </div>
      {pickerOpen && <DeptMultiPicker allDepts={availableJobs} selected={selectedCats} onChange={setSelectedCats} onClose={() => setPickerOpen(false)} />}
    </SectionCard>
  );
}

// =====================
// 개인별
// =====================
function PersonTrendSection({ onSectionData }: { onSectionData?: (s: DetailSectionData) => void }) {
  const [range, setRange] = useState<DateRange>(detailDefaultRange());
  const months = useMemo(() => monthsBetween(range.from, range.to), [range.from, range.to]);
  const [selectedPersons, setSelectedPersons] = useState<{ empNo: string; name: string; dept: string }[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<OvertimeType[]>(['총연장']);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allPersons, setAllPersons] = useState<{ empNo: string; name: string; dept: string }[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const showLabels = months.length <= 4 && selectedPersons.length <= 5;
  const isEntrance = useEntranceAnimation(data.length > 0);
  const metricMap: Record<string, string> = { '자동연장': 'auto', '초과연장': 'excess', '총연장': 'extension' };

useEffect(() => {
    if (months.length === 0) return;
    Promise.all([
      api.get('/overtime/persons', { params: { from: months[0], to: months[months.length - 1] } }),
      api.get('/overtime/top-persons', { params: { from: months[0], to: months[months.length - 1], limit: 5 } }),
    ]).then(([personsRes, topRes]) => {
      // 백엔드 /overtime/persons는 department 필드로 응답하므로 dept로 매핑
      const persons = (personsRes.data.persons as { empNo: string; name: string; department: string }[])
        .map((p) => ({ empNo: p.empNo, name: p.name, dept: p.department ?? '' }));
      setAllPersons(persons);
      // top5 인원을 persons 목록에서 매칭
      const topData = topRes.data.data as { empNo: string; name: string; dept: string }[];
      setSelectedPersons(topData.map((p) => ({ empNo: p.empNo, name: p.name, dept: p.dept })));
    }).catch(() => {});
  }, [months]);

  useEffect(() => {
    if (months.length === 0 || selectedPersons.length === 0) { setData([]); return; }
    const metric = metricMap[selectedTypes[0] ?? '총연장'] ?? 'extension';
    const fromYm = months[0]!;
    const toYm = months[months.length - 1]!;

    let cancelled = false;
    Promise.all([
      Promise.all(selectedPersons.map((p) =>
        api.get('/overtime/person-trend', { params: { empNo: p.empNo, from: fromYm, to: toYm, metric } })
          .then((r) => ({ name: p.name, points: r.data.data as { ym: string; value: number }[] }))
      )),
      api.get('/overtime/amount-trend', { params: { from: fromYm, to: toYm } }),
    ]).then(([personResults, amtRes]) => {
      if (cancelled) return;
      const amtMap = new Map(
        (amtRes.data.data as { ym: string; 총합: number }[]).map((r) => [r.ym, r.총합 ?? 0])
      );
      const personMap = new Map(personResults.map((d) => [d.name, new Map(d.points.map((p) => [p.ym, p.value]))]));
      const rows = months.map((ym) => {
        const row: Record<string, unknown> = { month: labelYearMonth(ym) };
        for (const p of selectedPersons) {
          row[p.name] = personMap.get(p.name)?.get(ym) ?? 0;
        }
        row['금액'] = Math.round((amtMap.get(ym) ?? 0) / 1000);
        return row;
      });
      setData(rows);
      setDataVersion((v) => v + 1);
      const rangeLabel = months.length > 0 ? (months[0] === months[months.length-1] ? months[0] : `${months[0]} ~ ${months[months.length-1]}`) : '';
      onSectionData?.({
        title: '개인별 누적 추이',
        rangeLabel,
        filterLabel: `${selectedPersons.length}명 · ${selectedTypes[0] ?? '총연장'}`,
        data: rows,
        categories: selectedPersons.map(p => p.name),
        categoryLabels: selectedPersons.map(p => `${p.name} (${p.dept})`),
        colors: ['#38bdf8','#f97316','#94a3b8','#64748b','#7dd3fc'],
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [months, selectedPersons, selectedTypes, onSectionData]);

  return (
    <SectionCard title="개인별 누적 추이" accentColor="emerald" headerRight={<RangePicker range={range} onChange={setRange} />}>
      <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
        <ChartArea empty={selectedPersons.length === 0} emptyLabel="개인">
          <ResponsiveContainer key={data.length === 0 ? 'empty' : `ready-${dataVersion}`} width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 36, right: 16, left: -12, bottom: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis yAxisId="left" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <YAxis yAxisId="right" orientation="right" stroke="transparent" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v.toLocaleString()} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend content={() => <BarLegend categories={selectedPersons.map(p => `${p.name} (${p.dept})`)} showAmount />} />
              {selectedPersons.map((p, i) => (
                <Bar key={p.empNo} yAxisId="left" dataKey={p.name} name={`${p.name} (${p.dept})`} fill={BAR_PALETTES[i % BAR_PALETTES.length]} radius={[3, 3, 0, 0]} maxBarSize={44} animationDuration={isEntrance ? 650 : 250} animationEasing="ease-out">
                  {showLabels && (
                    <LabelList dataKey={p.name} position="top" fill="#e2e8f0" fontSize={10} fontWeight={700} offset={6} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                  )}
                </Bar>
              ))}
              <Line yAxisId="right" type="monotone" dataKey="금액" name="금액" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 4, fill: LINE_COLOR, stroke: '#0b1728', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive animationDuration={isEntrance ? 1100 : 400}>
                {months.length <= 6 && (
                  <LabelList dataKey="금액" position="top" fill={LINE_COLOR} fontSize={11} fontWeight={700} offset={10} stroke="#0b1728" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                )}
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartArea>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-[0.06em] text-slate-400">대상자</span>
              <span className="text-[11px] text-slate-600">{selectedPersons.length}명</span>
            </div>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] transition hover:border-emerald-400/20 hover:bg-white/[0.06]">
              <Filter size={12} className="text-emerald-400" />
              <span className="font-medium text-slate-300">
                {selectedPersons.length === 0 ? '선택 없음' : `${selectedPersons.length}명 선택됨`}
              </span>
              <span className="ml-auto text-[11px] text-slate-600">변경 →</span>
            </button>
          </div>
          <OvertimeTypeSelector selected={selectedTypes} accentColor="emerald" onChange={(v) => setSelectedTypes(v as OvertimeType[])} />
        </div>
      </div>
      {pickerOpen && (
        <PersonPickerModal
          allPersons={allPersons}
          selected={selectedPersons}
          onChange={setSelectedPersons}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </SectionCard>
  );
}

// =====================
// 공통 레이아웃
// =====================
function SectionCard({ title, accentColor, headerRight, children }: {
  title: string; accentColor: 'sky' | 'violet' | 'emerald';
  headerRight?: React.ReactNode; children: React.ReactNode;
}) {
  const line = { sky: 'from-sky-500 to-cyan-400', violet: 'from-violet-500 to-purple-400', emerald: 'from-emerald-500 to-teal-400' }[accentColor];
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(160deg,rgba(15,23,42,0.88),rgba(2,8,23,0.98))] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_48px_rgba(0,0,0,0.3)]">
      <div className={`h-[1.5px] rounded-t-2xl bg-gradient-to-r ${line} opacity-80`} />
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
            <span className="text-[14px] text-slate-600">(단위: 시간, 천원)</span>
          </div>
          {headerRight}
        </div>
        {children}
      </div>
    </div>
  );
}

function ChartArea({ empty, emptyLabel, children }: { empty: boolean; emptyLabel: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[340px] overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      {empty ? (
        <div className="flex h-full min-h-[280px] items-center justify-center">
          <p className="text-[14px] text-slate-500">표시할 {emptyLabel}을 선택하세요.</p>
        </div>
      ) : children}
    </div>
  );
}

function OvertimeTypeSelector({ selected, accentColor, onChange }: {
  selected: OvertimeType[];
  accentColor: 'sky' | 'violet' | 'emerald';
  onChange: (next: OvertimeType[]) => void;
}) {
  const activeClass = {
    sky: 'border-sky-400/40 bg-sky-400/[0.10] text-sky-200',
    violet: 'border-violet-400/40 bg-violet-400/[0.10] text-violet-200',
    emerald: 'border-emerald-400/40 bg-emerald-400/[0.10] text-emerald-200',
  }[accentColor];

  const dotColor = {
    sky: 'bg-sky-400',
    violet: 'bg-violet-400',
    emerald: 'bg-emerald-400',
  }[accentColor];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[0.06em] text-slate-400">연장구분</span>
        <span className="text-[11px] text-slate-600">{selected.length}/3</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {ALL_TYPES.map((type) => {
          const active = selected.includes(type);
          return (
            <button key={type} type="button"
              onClick={() => { if (!active) onChange([type]); }}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all duration-150 ${active ? activeClass : 'border-white/[0.08] bg-white/[0.03] text-slate-500 hover:border-white/[0.15] hover:text-slate-300'}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${active ? dotColor : 'bg-slate-600'}`} />
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeptMultiPicker({ allDepts, selected, onChange, onClose }: {
  allDepts: string[]; selected: string[];
  onChange: (next: string[]) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim();
    return q ? allDepts.filter((d) => d.includes(q)) : allDepts;
  }, [allDepts, search]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const allSelected = allDepts.length > 0 && selected.length === allDepts.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-[28px] border border-white/[0.1] bg-[#0b1728] sm:rounded-[24px]" style={{ boxShadow: '0 -24px 80px rgba(2,132,199,0.15)' }}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] font-semibold text-white">부서 필터</h2>
            <span className="rounded-full bg-sky-500/[0.15] px-2 py-0.5 text-[14px] font-semibold text-sky-300">{selected.length}/{allDepts.length}</span>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-white"><X size={15} /></button>
        </div>
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="부서 검색..." className="h-[36px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-[14px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500/40" />
            </div>
            <button type="button" onClick={() => onChange(allSelected ? [] : [...allDepts])} className={`h-[36px] shrink-0 rounded-[10px] border px-3.5 text-[13px] font-medium transition ${allSelected ? 'border-rose-400/20 bg-rose-500/[0.07] text-rose-300' : 'border-sky-400/20 bg-sky-500/[0.07] text-sky-300'}`}>
              {allSelected ? '모두 해제' : '모두 선택'}
            </button>
          </div>
        </div>
        <div className="mx-5 border-t border-white/[0.06]" />
        <div className="overflow-y-auto px-5 pt-3" style={{ height: '400px' }}>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-slate-600">"{search}"에 해당하는 부서가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 pb-2">
              {filtered.map((d) => {
                const checked = selected.includes(d);
                return (
                  <button key={d} type="button" onClick={() => onChange(checked ? selected.filter((x) => x !== d) : [...selected, d])}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[14px] transition-all duration-150 ${checked ? 'border-sky-500/35 bg-sky-500/[0.10] text-white' : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'}`}>
                    <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all ${checked ? 'border-sky-400/80 bg-sky-500' : 'border-white/20'}`}>
                      {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.2 2.5 4-4" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <span className="truncate font-medium leading-none">{d}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 pt-3">
          <button type="button" onClick={onClose} className="w-full rounded-[14px] bg-gradient-to-r from-blue-600 to-sky-500 py-[13px] text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.25)] transition hover:brightness-110">적용</button>
        </div>
      </div>
    </div>
  );
}

function PersonPickerModal({ allPersons, selected, onChange, onClose }: {
  allPersons: Array<{ empNo: string; name: string; dept: string }>;
  selected: Array<{ empNo: string; name: string; dept: string }>;
  onChange: (next: Array<{ empNo: string; name: string; dept: string }>) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = allPersons.filter((p) => {
    const q = search.trim();
    if (!q) return true;
    return (p.name ?? '').includes(q) || (p.dept ?? '').includes(q);
  });
  const selectedEmpNos = new Set(selected.map(p => p.empNo));
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedEmpNos.has(p.empNo));

  function toggle(p: { empNo: string; name: string; dept: string }) {
    if (selectedEmpNos.has(p.empNo)) onChange(selected.filter((s) => s.empNo !== p.empNo));
    else onChange([...selected, p]);
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const filteredEmpNos = new Set(filtered.map((p) => p.empNo));
      onChange(selected.filter((s) => !filteredEmpNos.has(s.empNo)));
    } else {
      const next = [...selected];
      for (const p of filtered) {
        if (!selectedEmpNos.has(p.empNo)) next.push(p);
      }
      onChange(next);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-[24px] border border-white/[0.1] bg-[#0b1728] p-5" style={{ boxShadow: '0 24px 80px rgba(52,211,153,0.15)', height: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mb-3 shrink-0 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-white">대상자 선택 <span className="text-[13px] font-normal text-emerald-300">{selected.length}명</span></span>
          <div className="flex gap-2">
            {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[12px] text-rose-400 hover:text-rose-300 transition">초기화</button>}
            <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition"><X size={18} /></button>
          </div>
        </div>
        <div className="relative mb-3 shrink-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름, 부서 검색..." className="h-[36px] w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-[13px] text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/40" />
        </div>
        {search.trim() && filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleAllFiltered}
            className={`mb-2 shrink-0 flex h-[34px] items-center justify-center gap-2 rounded-[10px] border text-[12px] font-medium transition ${
              allFilteredSelected
                ? 'border-rose-400/25 bg-rose-500/[0.08] text-rose-300 hover:bg-rose-500/[0.12]'
                : 'border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-300 hover:bg-emerald-500/[0.12]'
            }`}
          >
            {allFilteredSelected ? `검색결과 ${filtered.length}명 모두 해제` : `검색결과 ${filtered.length}명 모두 선택`}
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
          {filtered.map((p) => (
            <button key={p.empNo} type="button" onClick={() => toggle(p)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${selectedEmpNos.has(p.empNo) ? 'border-emerald-500/35 bg-emerald-500/[0.08] text-white' : 'border-white/[0.06] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'}`}>
              <span className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-all ${selectedEmpNos.has(p.empNo) ? 'border-emerald-400/80 bg-emerald-500' : 'border-white/20'}`}>
                {selectedEmpNos.has(p.empNo) && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.2 2.5 4-4" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span className="font-medium text-[13px]">{p.name}</span>
              <span className="ml-1 text-[11px] text-slate-500">{p.dept}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-4 shrink-0 w-full rounded-[14px] bg-gradient-to-r from-emerald-600 to-teal-500 py-3 text-[14px] font-semibold text-white transition hover:brightness-110">적용</button>
      </div>
    </div>
  );
}

// 부모 cascade 재렌더링으로 무거운 차트가 매번 reconcile되지 않도록 memo로 감쌈
const MemoDeptTrendSection = memo(DeptTrendSection);
const MemoJobTrendSection = memo(JobTrendSection);
const MemoPersonTrendSection = memo(PersonTrendSection);