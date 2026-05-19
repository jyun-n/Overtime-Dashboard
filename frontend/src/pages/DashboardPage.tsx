import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import MainOverview, { JobFilterSelect, RangePicker, type DateRange } from './dashboard/MainOverview';
import { DetailDownloadButton, OverviewDownloadButton, type DetailSectionData } from './dashboard/ReportDownload';
import type { Kpi } from './dashboard/MainOverview';
import DetailTrends from './dashboard/DetailTrends';
import { defaultRange } from './dashboard/MainOverview';

type UploadStatus = {
  hr: { uploadedAt: string } | null;
  overtime: { uploadedAt: string; yearMonth: string | null } | null;
};

function fmtKorean(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  return `${y}. ${m}. ${day}. ${ampm} ${h12}:${min}`;
}

type Tab = 'overview' | 'detail';

export default function DashboardPage() {
  const [hrAt, setHrAt] = useState<string | null>(null);
  const [overtimeAt, setOvertimeAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [jobFilter, setJobFilter] = useState<string | null>(null);

  const navigate = useNavigate();
  const { user, clear } = useAuthStore();
  const detailRef = useRef<HTMLDivElement>(null);
  const [detailSections, setDetailSections] = useState<DetailSectionData[]>([]);
  const [overviewData, setOverviewData] = useState<{
    kpis: Kpi[];
    hours: Record<string, unknown>[];
    amount: Record<string, unknown>[];
    topDeptsAuto: { name: string; value: number }[];
    topDeptsExcess: { name: string; value: number }[];
    persons: { name: string; dept: string; 초과: number; 초과연장금액: number }[];
  }>({ kpis: [], hours: [], amount: [], topDeptsAuto: [], topDeptsExcess: [], persons: [] });

  useEffect(() => {
    const id = 'tab-fade-keyframe';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes tabFadeIn {
        0% { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);
  useEffect(() => {
    let alive = true;
    api
      .get<UploadStatus>('/upload-status')
      .then(({ data }) => {
        if (!alive) return;
        setHrAt(data.hr?.uploadedAt ?? null);
        setOvertimeAt(data.overtime?.uploadedAt ?? null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-left text-[30px] font-semibold tracking-[-0.04em] text-white lg:text-[34px]">
            연장 관리 대시보드
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-0 gap-y-1 text-left text-[13px] text-slate-400">
            <span>인사정보 파일 : {hrAt ? fmtKorean(hrAt) : '업데이트 없음'}</span>
            <span className="mx-2 text-slate-600">|</span>
            <span>연장근무 데이터 : {overtimeAt ? fmtKorean(overtimeAt) : '업데이트 없음'}</span>
            <span className="mx-2 text-slate-600">|</span>
            <span className="flex items-center gap-2 text-[12px] text-slate-500">
              <span>
                <span className="text-slate-600">이름 :</span>
                <span className="ml-1 font-medium text-slate-300">{user?.name ?? '—'}</span>
              </span>
              <span className="text-slate-700">·</span>
              <span>
                <span className="text-slate-600">부서 :</span>
                <span className="ml-1 font-medium text-slate-300">{user?.department || '—'}</span>
              </span>
              <span className="text-slate-700">·</span>
              <span>
                <span className="text-slate-600">IP :</span>
                <span className="ml-1 font-mono font-medium text-slate-300">{user?.ip || '—'}</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="flex items-center gap-2">
            {tab === 'overview' && (
              <OverviewDownloadButton
                range={range}
                jobFilter={jobFilter}
                kpis={overviewData.kpis}
                hours={overviewData.hours}
                amount={overviewData.amount}
                topDeptsAuto={overviewData.topDeptsAuto}
                topDeptsExcess={overviewData.topDeptsExcess}
                persons={overviewData.persons}
                userName={user?.name ?? ''}
              />
            )}
            {tab === 'detail' && (
              <DetailDownloadButton userName={user?.name ?? ''} sections={detailSections} />
            )}
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>종합</TabButton>
              <TabButton active={tab === 'detail'} onClick={() => setTab('detail')}>상세</TabButton>
            </div>
            {user?.role === 'USER' && (
              <button
                type="button"
                onClick={() => { api.post('/auth/logout').catch(() => {}); clear(); navigate('/login', { replace: true }); }}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-500/[0.07] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                로그아웃
              </button>
            )}
          </div>
          {tab === 'overview' && (
            <div className="flex items-center gap-2">
              <JobFilterSelect value={jobFilter} onChange={setJobFilter} />
              <RangePicker range={range} onChange={setRange} />
            </div>
          )}
        </div>
      </div>

      {/* 두 탭 컴포넌트를 항상 마운트하고 display로 토글 — unmount/mount로 인한
          fetch race condition 방지 (탭을 빠르게 왔다갔다 할 때 데이터 누락 방지) */}
      <div style={{ display: tab === 'overview' ? 'block' : 'none' }}>
        <MainOverview range={range} jobFilter={jobFilter} onDataReady={setOverviewData} />
      </div>
      <div style={{ display: tab === 'detail' ? 'block' : 'none' }} ref={detailRef}>
        <DetailTrends onSectionsChange={setDetailSections} />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-1.5 text-[13px] font-semibold transition ${
        active
          ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]'
          : 'text-slate-300 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}