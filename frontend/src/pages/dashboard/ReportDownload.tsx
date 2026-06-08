import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download } from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  LabelList,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DateRange, Kpi } from './MainOverview';
import { api } from '../../lib/api';

export interface DetailSectionData {
  title: string;
  rangeLabel: string;
  filterLabel: string;
  data: Record<string, unknown>[];
  categories: string[];
  /** 표시용 라벨 (예: 개인별 "김주명 (기획팀)"). 미지정 시 categories 사용 */
  categoryLabels?: string[];
  colors: string[];
}

function fmtNow() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function captureToPdf(el: HTMLElement, filename: string) {
  await new Promise(r => requestAnimationFrame(() => r(null)));
  await new Promise(r => setTimeout(r, 400));
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    allowTaint: true,
    width: el.scrollWidth,
    height: el.scrollHeight,
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pdfW / (canvas.width / 2), pdfH / (canvas.height / 2));
  const w = (canvas.width / 2) * ratio;
  const h = (canvas.height / 2) * ratio;
  pdf.addImage(imgData, 'PNG', (pdfW - w) / 2, (pdfH - h) / 2, w, h);
  pdf.save(filename);
}

const BAR_COLORS = ['#38bdf8','#f97316','#94a3b8','#64748b','#7dd3fc','#fdba74','#cbd5e1','#475569'];

export interface OverviewReportProps {
  range: DateRange;
  jobFilter: string | null;
  kpis: Kpi[];
  hours: Record<string, unknown>[];
  amount: Record<string, unknown>[];
  topDeptsAuto: { name: string; value: number }[];
  topDeptsExcess: { name: string; value: number }[];
  persons: { name: string; dept: string; 초과: number; 초과연장금액: number }[];
}

function OverviewReport({ range, jobFilter, kpis, hours, amount, topDeptsAuto, topDeptsExcess, persons }: OverviewReportProps) {
  const rangeLabel = range.from === range.to ? range.from : `${range.from} ~ ${range.to}`;
  const filterLabel = jobFilter ? ` · ${jobFilter}` : '';
  const maxAutoVal = Math.max(...topDeptsAuto.map(d => d.value), 1);
  const maxExcessVal = Math.max(...topDeptsExcess.map(d => d.value), 1);
  const filteredHours = hours.filter(r => ((r.총연장 as number) ?? 0) > 0);
  const filteredAmount = amount.filter(r => ((r.총합 as number) ?? 0) > 0);

  return (
    <div style={{ background: '#fff', fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", color: '#1e293b', padding: '28px 36px', width: '1123px', boxSizing: 'border-box' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2.5px solid #0ea5e9', paddingBottom: '14px', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '23px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>연장근무 현황 보고서</div>
          <div style={{ fontSize: '15px', color: '#64748b', marginTop: '2px' }}>{rangeLabel}{filterLabel} 기준</div>
        </div>
      </div>

      {/* KPI - 왼쪽 컬러 없음, 외곽선 굵게, 패딩 균등 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '18px' }}>
        {kpis.map((k, i) => {
          const positive = k.delta !== null && k.delta > 0;
          return (
            <div key={k.label} style={{ background: '#ffffff', border: `2px solid ${['#bfdbfe','#fde68a','#fecdd3','#ddd6fe','#e2e8f0'][i]}`, borderRadius: '10px', padding: '14px 18px 14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', minHeight: '82px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em' }}>{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{k.value}</span>
                  <span style={{ fontSize: '15px', color: '#94a3b8' }}>{k.unit}</span>
                </div>
                {k.delta !== null && (
                  <span style={{ fontSize: '14px', color: positive ? '#dc2626' : '#16a34a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {positive ? '▲' : '▼'}{Math.abs(k.delta).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 차트 - margin 늘려서 y축 레이블 겹침 방지 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>월별 연장시간 추이 <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 400 }}>(시간)</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={filteredHours} margin={{ top: 36, right: 20, left: 10, bottom: 4 }} barCategoryGap="35%">
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 15, fontWeight: 600 }} axisLine={false} tickLine={false} padding={{ left: 30, right: 20 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 14 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: 14 }} />
              <Legend verticalAlign="bottom" align="center" iconSize={8} wrapperStyle={{ fontSize: '13px', color: '#64748b', paddingTop: '4px' }} />
              <Area type="monotone" dataKey="자동" stackId="h" stroke="#94a3b8" fill="#e2e8f0" name="자동연장" isAnimationActive={false} />
              <Area type="monotone" dataKey="초과" stackId="h" stroke="#f59e0b" fill="#fde68a" name="초과연장" isAnimationActive={false} />
              <Line type="monotone" dataKey="총연장" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 4, fill: '#dc2626', stroke: '#fff', strokeWidth: 1.5 }} name="총연장" isAnimationActive={false}>
                <LabelList dataKey="총연장" position="top" style={{ fontSize: '17px', fill: '#dc2626', fontWeight: 700 }} offset={12} formatter={(v: number) => Math.round(v).toLocaleString()} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>월별 연장수당 추이 <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 400 }}>(천만원)</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={filteredAmount} margin={{ top: 36, right: 20, left: 10, bottom: 4 }} barCategoryGap="35%">
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 15, fontWeight: 600 }} axisLine={false} tickLine={false} padding={{ left: 30, right: 20 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 14 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: 14 }} />
              <Legend verticalAlign="bottom" align="center" iconSize={8} wrapperStyle={{ fontSize: '13px', color: '#64748b', paddingTop: '4px' }} />
              <Bar dataKey="자동연장" stackId="a" fill="#cbd5e1" name="자동연장" isAnimationActive={false} />
              <Bar dataKey="초과연장" stackId="a" fill="#fbbf24" name="초과연장" radius={[3,3,0,0]} isAnimationActive={false} />
              <Line type="monotone" dataKey="총합" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 4, fill: '#dc2626', stroke: '#fff', strokeWidth: 1.5 }} name="총연장수당" isAnimationActive={false}>
                <LabelList dataKey="총합" position="top" style={{ fontSize: '17px', fill: '#dc2626', fontWeight: 700 }} offset={12} formatter={(v: number) => Math.round(v).toLocaleString()} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 순위 - 폰트 축소, 행 높이 확보 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: '12px', marginBottom: '12px' }}>
        {[
          { title: '자동연장 상위 부서 TOP20', items: topDeptsAuto, color: '#0ea5e9', max: maxAutoVal },
          { title: '초과연장 상위 부서 TOP20', items: topDeptsExcess, color: '#f59e0b', max: maxExcessVal },
        ].map(({ title, items, color, max }) => (
          <div key={title} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>{title} <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 400 }}>(시간)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 56px 48px', gap: '6px', alignItems: 'center', padding: '6px 0', fontSize: '12px', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #cbd5e1', marginBottom: '4px' }}>
              <span style={{ textAlign: 'right' }}>#</span>
              <span>부서명</span>
              <span></span>
              <span style={{ textAlign: 'right' }}>시간</span>
            </div>
            {items.slice(0, 20).map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 0', borderBottom: '1px dashed #e2e8f0' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', width: '12px', textAlign: 'right', flexShrink: 0 }}>{i+1}</span>
                <span style={{ fontSize: '12px', color: '#1e293b', flex: 1, overflow: 'visible', whiteSpace: 'nowrap', lineHeight: '16px', minWidth: 0 }}>{d.name}</span>
                <div style={{ width: '44px', height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-end' }}>
                  <div style={{ width: `${(d.value/max)*100}%`, height: '100%', background: color, borderRadius: '4px', minWidth: '3px' }} />
                </div>
                <span style={{ fontSize: '12px', color: '#0f172a', textAlign: 'right', fontWeight: 700, flexShrink: 0, width: '42px' }}>{d.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 6px 2px 6px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>초과근무 상위 인원 <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 400 }}>(시간 / 천원)</span></div>
          <ResponsiveContainer width="100%" height={480}>
            <ComposedChart
              data={persons.slice(0, 15).map(p => ({ name: p.name, dept: p.dept, 초과: p.초과, 금액: p.초과연장금액 }))}
              margin={{ top: 46, right: 20, left: 12, bottom: 120 }}
              barCategoryGap="8%"
            >
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={({ x, y, payload }) => {
                  const p = persons.slice(0, 15).find((pp) => pp.name === payload.value);
                  const dept = p?.dept ?? '';
                  return (
                    <g>
                      {/* 이름: 대각선 */}
                      <g transform={`translate(${x},${y}) rotate(-40)`}>
                        <text x={0} y={0} dy={12} textAnchor="end" fill="#1e293b" fontSize={11} fontWeight={600}>
                          {payload.value}
                        </text>
                      </g>
                      {/* 부서: 세로쓰기 (한 글자씩 stack) */}
                      <g transform={`translate(${x},${y + 38})`}>
                        {dept.split('').map((ch, i) => (
                          <text key={i} x={0} y={0} dy={i * 9} textAnchor="middle" fill="#94a3b8" fontSize={9} fontWeight={500}>
                            {ch}
                          </text>
                        ))}
                      </g>
                    </g>
                  );
                }}
              />
              <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} width={40} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toLocaleString()} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: 13 }} />
              <Bar yAxisId="left" dataKey="초과" name="초과시간(h)" fill="#94a3b8" radius={[3,3,0,0]} isAnimationActive={false}>
                <LabelList dataKey="초과" position="top" fill="#0f172a" fontSize={11} fontWeight={700} offset={6} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="금액" name="초과연장(천원)" stroke="#374151" strokeWidth={2} dot={{ r: 3, fill: '#374151', stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false}>
                <LabelList dataKey="금액" position="top" angle={-45} fill="#374151" fontSize={11} fontWeight={700} offset={16} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '6px', fontSize: '13px', color: '#475569' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', background: '#94a3b8', borderRadius: '2px', display: 'inline-block' }} />
              초과시간(h)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '14px', height: '2px', background: '#374151', display: 'inline-block' }} />
              초과연장(천원)
            </span>
          </div>
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
        <div>{rangeLabel} 기준 · {fmtNow()} 출력</div>
      </div>
    </div>
  );
}

function DetailReport({ sections }: { sections: DetailSectionData[] }) {
  return (
    <div style={{ background: '#fff', fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", color: '#1e293b', padding: '28px 36px', width: '1123px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2.5px solid #0ea5e9', paddingBottom: '14px', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '23px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>연장근무 상세 보고서</div>
          <div style={{ fontSize: '15px', color: '#64748b', marginTop: '2px' }}>부서별 · 직군별 · 개인별 누적 추이</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sections.map((sec) => (
          <div key={sec.title} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                {sec.title} <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 400 }}>(단위: 시간 / 천원)</span>
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>{sec.rangeLabel} · {sec.filterLabel}</div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={sec.data} margin={{ top: 46, right: 40, left: 0, bottom: 0 }} barCategoryGap="32%">
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => v.toLocaleString()} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: 13 }} />
                <Legend content={({ payload }) => (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', paddingTop: '4px', justifyContent: 'center' }}>
                    {payload?.map((p) => (
                      <span key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#64748b' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color as string, display: 'inline-block' }} />{p.value}
                      </span>
                    ))}
                  </div>
                )} />
                <Line yAxisId="right" type="monotone" dataKey="금액" name="금액(천원)" stroke="#dc2626" strokeWidth={2} dot={{ r: 3, fill: '#dc2626', stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false}>
                  <LabelList dataKey="금액" position="top" fill="#dc2626" fontSize={14} fontWeight={700} offset={20} stroke="#ffffff" strokeWidth={4} paintOrder="stroke" formatter={(v: number) => Math.round(v).toLocaleString()} />
                </Line>
                {sec.categories.map((cat, i) => (
                  <Bar key={cat} yAxisId="left" dataKey={cat} name={sec.categoryLabels?.[i] ?? cat} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[2,2,0,0]} maxBarSize={28} isAnimationActive={false}>
                    <LabelList dataKey={cat} position="top" fill="#0f172a" fontSize={12} fontWeight={700} offset={6} angle={-30} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" formatter={(v: number) => (v > 0 ? Math.round(v).toLocaleString() : '')} />
                  </Bar>
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
        <div>{fmtNow()} 출력</div>
      </div>
    </div>
  );
}

export function OverviewDownloadButton(props: OverviewReportProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);

  async function handleDownload() {
    setLoading(true);
    setRendering(true);
    try {
      await new Promise(r => requestAnimationFrame(() => r(null)));
      await new Promise(r => setTimeout(r, 400));
      if (!ref.current) return;
      await captureToPdf(ref.current, `연장근무_종합보고서_${props.range.from}_${props.range.to}.pdf`);
      const range = props.range.from === props.range.to
        ? props.range.from
        : `${props.range.from} ~ ${props.range.to}`;
      api.post('/overtime/report-log', { type: 'overview', range }).catch(() => {});
    } finally {
      setRendering(false);
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleDownload} disabled={loading}
        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-500/[0.07] hover:text-white disabled:opacity-50">
        <Download size={14} />
        {loading ? '생성 중...' : '보고서 다운로드'}
      </button>
      {rendering && createPortal(
        <div style={{ position: 'fixed', top: 0, left: '-100000px', pointerEvents: 'none' }}>
          <div ref={ref}><OverviewReport {...props} /></div>
        </div>,
        document.body
      )}
    </>
  );
}

export function DetailDownloadButton({ sections }: { sections: DetailSectionData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);

  async function handleDownload() {
    setLoading(true);
    setRendering(true);
    try {
      await new Promise(r => requestAnimationFrame(() => r(null)));
      await new Promise(r => setTimeout(r, 400));
      if (!ref.current) return;
      await captureToPdf(ref.current, `연장근무_상세보고서_${new Date().toISOString().slice(0,10)}.pdf`);
      const range = sections[0]?.rangeLabel;
      api.post('/overtime/report-log', { type: 'detail', range }).catch(() => {});
    } finally {
      setRendering(false);
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleDownload} disabled={loading}
        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-500/[0.07] hover:text-white disabled:opacity-50">
        <Download size={14} />
        {loading ? '생성 중...' : '보고서 다운로드'}
      </button>
      {rendering && createPortal(
        <div style={{ position: 'fixed', top: 0, left: '-100000px', pointerEvents: 'none' }}>
          <div ref={ref}><DetailReport sections={sections} /></div>
        </div>,
        document.body
      )}
    </>
  );
}