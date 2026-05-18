import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

type LogType = 'HR' | 'OVERTIME' | 'DOWNLOAD';

type UploadLog = {
  id: string;
  uploadedAt: string;
  uploader: string;
  uploaderName: string;
  ip: string;
  fileType: LogType;
  yearMonth: string | null;
  detail?: string; // 다운로드 기간 등 부가 설명
};

type Preview = {
  headers: string[];
  rows: string[][];
};

const PREVIEW_ROWS = 12;

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { hour12: false }).replace(/\.$/, '');
}

async function parsePreview(file: File): Promise<Preview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellFormula: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  // defval을 null로 설정해 빈 셀 감지
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  // 1행의 모든 셀이 null/빈값이면 연장근무 파일 형식 (2행이 헤더)
  const firstRow = (allRows[0] ?? []) as unknown[];
  const firstRowEmpty = firstRow.length === 0 || firstRow.every(
    (c) => c === null || c === undefined || String(c).trim() === ''
  );
  const headerRowIdx = firstRowEmpty ? 1 : 0;

  // 헤더: 줄바꿈 제거 + null 처리
  const headers = ((allRows[headerRowIdx] ?? []) as unknown[]).map(
    (c) => String(c ?? '').replace(/\n/g, ' ').trim()
  ).filter((h, i, arr) => {
    // 마지막 빈 헤더 컬럼 제거
    const lastNonEmpty = arr.reduce((last, v, idx) => v ? idx : last, -1);
    return i <= lastNonEmpty;
  });

  const body = allRows.slice(headerRowIdx + 1, headerRowIdx + 1 + PREVIEW_ROWS).map(
    (r) => headers.map((_, ci) => String(((r ?? []) as unknown[])[ci] ?? ''))
  );
  return { headers, rows: body };
}

const NOW = new Date();
const YEAR_START = 2025;
const YEAR_RANGE = (() => {
  const end = NOW.getFullYear();
  const arr: number[] = [];
  for (let y = YEAR_START; y <= end; y += 1) arr.push(y);
  return arr.reverse();
})();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function UploadsPage() {
  const { user } = useAuthStore();
  const prevMonth = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
  const [year, setYear] = useState(prevMonth.getFullYear());
  const [month, setMonth] = useState(prevMonth.getMonth() + 1);
  const [hrFile, setHrFile] = useState<File | null>(null);
  const [overtimeFile, setOvertimeFile] = useState<File | null>(null);

  // 업로드 로그
  const [uploadLogs, setUploadLogs] = useState<UploadLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // 로그 모달
  const [logsOpen, setLogsOpen] = useState(false);
  const [logTab, setLogTab] = useState<'upload' | 'download'>('upload');
  const [logSearch, setLogSearch] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');

  // 다운로드 모달
  const [dlOpen, setDlOpen] = useState(false);
  const [dlFromYear, setDlFromYear] = useState(NOW.getFullYear());
  const [dlFromMonth, setDlFromMonth] = useState(1);
  const [dlToYear, setDlToYear] = useState(NOW.getFullYear());
  const [dlToMonth, setDlToMonth] = useState(NOW.getMonth() + 1);
  const [dlLoading, setDlLoading] = useState(false);

  // 덮어쓰기 경고 토스트
  const [warnToast, setWarnToast] = useState<{
    visible: boolean;
    message: string;
    onConfirm: (() => void) | null;
  }>({ visible: false, message: '', onConfirm: null });

  function confirmUpload(label: string, doUpload: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      setWarnToast({
        visible: true,
        message: `${label} 데이터를 업로드하면 기존 데이터가 덮어써집니다. 계속하시겠습니까?`,
        onConfirm: () => {
          setWarnToast(prev => ({ ...prev, visible: false }));
          doUpload().then(resolve).catch(reject);
        },
      });
    });
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const { data } = await api.get<{ logs: UploadLog[] }>('/upload-logs?limit=200');
      setUploadLogs(data.logs);
    } catch {
      // 실패 시 빈 배열 유지
    } finally {
      setLogsLoading(false);
    }
  }

  function openLogs() {
    setLogDateFrom('');
    setLogDateTo('');
    setLogTab('upload');
    setLogSearch('');
    setLogsOpen(true);
    void loadLogs();
  }

  // 엑셀 다운로드 — 실제 DB 데이터
  async function handleDownload() {
    setDlLoading(true);
    try {
      const from = `${dlFromYear}-${String(dlFromMonth).padStart(2, '0')}`;
      const to = `${dlToYear}-${String(dlToMonth).padStart(2, '0')}`;

      const res = await api.get('/overtime/download', {
        params: { from, to },
        responseType: 'blob',
      });

      const fromStr = `${dlFromYear}${String(dlFromMonth).padStart(2, '0')}`;
      const toStr = `${dlToYear}${String(dlToMonth).padStart(2, '0')}`;
      const userName = user?.name ?? 'unknown';
      const fileName = `${userName}_${fromStr}-${toStr}.xlsx`;

      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      void loadLogs();
      setDlOpen(false);
    } finally {
      setDlLoading(false);
    }
  }

  const uploadLogsFiltered = uploadLogs.filter((l) => l.fileType !== 'DOWNLOAD');
  const downloadLogsFiltered = uploadLogs.filter((l) => l.fileType === 'DOWNLOAD');
  const searchFilter = (l: UploadLog) => {
    const q = logSearch.toLowerCase();
    const ms = !q || l.uploaderName.includes(q) || l.uploader.includes(q) || (l.detail ?? '').includes(q);
    const mf = !logDateFrom || new Date(l.uploadedAt) >= new Date(logDateFrom);
    const mt = !logDateTo || new Date(l.uploadedAt) <= new Date(logDateTo + 'T23:59:59');
    return ms && mf && mt;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-white lg:text-[34px]">
          데이터 업로드
        </h1>
        <button type="button" onClick={openLogs}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition duration-200 hover:border-sky-300/30 hover:bg-white/[0.07]">
          <History size={16} />로그 보기
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UploadCard icon={<Users size={18} />} tone="sky" title="인사정보 파일"
          file={hrFile} onFile={setHrFile}
          onSubmit={() => confirmUpload('인사정보', async () => {
            if (!hrFile) return;
            const formData = new FormData();
            formData.append('file', hrFile);
            await api.post('/upload/hr', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            setHrFile(null);
            void loadLogs();
          })} />

        {/* 연장근무 파일 + 엑셀 다운로드 */}
        <UploadCard icon={<CalendarDays size={18} />} tone="emerald" title="연장근무 파일"
          file={overtimeFile} onFile={setOvertimeFile}
          titleAction={
            <button type="button" onClick={() => setDlOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-2.5 py-1.5 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.14] hover:border-emerald-400/40">
              <Download size={12} />
              엑셀 다운로드
            </button>
          }
          extra={
            <div>
              <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">대상 년/월</label>
              <div className="flex gap-2">
                <DarkSelect value={year} onChange={setYear} options={YEAR_RANGE} suffix="년" />
                <DarkSelect value={month} onChange={setMonth} options={MONTHS} suffix="월" />
              </div>
            </div>
          }
          onSubmit={() => confirmUpload(`${year}년 ${month}월 연장근무`, async () => {
            if (!overtimeFile) return;
            const formData = new FormData();
            formData.append('file', overtimeFile);
            formData.append('yearMonth', `${year}-${String(month).padStart(2, '0')}`);
            await api.post('/upload/overtime', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            setOvertimeFile(null);
            void loadLogs();
          })} />
      </div>

      {/* 엑셀 다운로드 모달 */}
      {dlOpen && (
        <Modal title="엑셀 다운로드" onClose={() => setDlOpen(false)}>
          <p className="mb-5 text-[13px] text-slate-400">다운로드할 기간을 선택하세요. 해당 기간의 연장수당 데이터가 엑셀 파일로 저장됩니다.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">시작 월</label>
              <div className="flex gap-2">
                <DarkSelect value={dlFromYear} onChange={setDlFromYear} options={YEAR_RANGE} suffix="년" />
                <DarkSelect value={dlFromMonth} onChange={setDlFromMonth} options={MONTHS} suffix="월" />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">종료 월</label>
              <div className="flex gap-2">
                <DarkSelect value={dlToYear} onChange={setDlToYear} options={YEAR_RANGE} suffix="년" />
                <DarkSelect value={dlToMonth} onChange={setDlToMonth} options={MONTHS} suffix="월" />
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <p className="text-[12px] text-slate-500">저장 파일명</p>
            <p className="mt-0.5 font-mono text-[13px] text-slate-200">
              {user?.name ?? ''}_{dlFromYear}{String(dlFromMonth).padStart(2,'0')}-{dlToYear}{String(dlToMonth).padStart(2,'0')}.xlsx
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setDlOpen(false)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13.5px] font-semibold text-slate-200 transition hover:bg-white/[0.08]">
              취소
            </button>
            <button type="button" onClick={handleDownload} disabled={dlLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_rgba(16,185,129,0.25)] transition hover:brightness-110 disabled:opacity-60">
              {dlLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {dlLoading ? '생성 중...' : '다운로드'}
            </button>
          </div>
        </Modal>
      )}

      {/* 로그 모달 */}
      {logsOpen && (
        <Modal title="기록 조회" width="max-w-[820px]" onClose={() => { setLogsOpen(false); setLogTab('upload'); setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); }}>
          <div className="flex flex-col" style={{ height: '65vh' }}>
            {/* 탭 */}
            <div className="shrink-0 mb-4 flex items-center gap-0 border-b border-white/[0.08]">
              {(['upload', 'download'] as const).map((t) => (
                <button key={t} type="button" onClick={() => { setLogTab(t); setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); }}
                  className={`relative px-5 pb-3 pt-1 text-[13px] font-semibold transition ${logTab === t ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {t === 'upload' ? '업로드 기록' : '다운로드 기록'}
                  {logTab === t && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />}
                </button>
              ))}
            </div>

            {/* 필터 */}
            <div className="shrink-0 mb-3 flex flex-wrap items-center gap-2">
              <DatePicker value={logDateFrom} onChange={setLogDateFrom} placeholder="시작일" />
              <span className="text-slate-600 text-[12px]">~</span>
              <DatePicker value={logDateTo} onChange={setLogDateTo} placeholder="종료일" />
              <div className="relative flex-1 min-w-[160px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="이름, 아이디 검색..."
                  className="h-[36px] w-full rounded-[10px] border border-white/[0.1] bg-white/[0.05] pl-8 pr-3 text-[13px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-500/50" />
              </div>
              {(logSearch || logDateFrom || logDateTo) && (
                <button type="button" onClick={() => { setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); }}
                  className="h-[36px] rounded-[10px] border border-white/[0.1] bg-white/[0.04] px-3 text-[12px] text-slate-400 transition hover:text-white">초기화</button>
              )}
            </div>

            {/* 테이블 */}
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden rounded-[12px] border border-white/[0.08]">
              {/* 공통 고정 헤더 */}
              <div className="shrink-0 bg-white/[0.03] border-b border-white/[0.08]">
                <table className="w-full border-collapse">
                  <colgroup><col style={{width:'24%'}}/><col style={{width:'13%'}}/><col style={{width:'22%'}}/><col style={{width:'22%'}}/><col style={{width:'19%'}}/></colgroup>
                  <thead><tr>
                    {logTab === 'upload'
                      ? ['시각','아이디','업로드 내용','대상월','IP'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold tracking-[0.05em] text-slate-400">{h}</th>
                        ))
                      : ['시각','아이디','다운로더','기간','IP'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold tracking-[0.05em] text-slate-400">{h}</th>
                        ))
                    }
                  </tr></thead>
                </table>
              </div>

              {/* 스크롤 바디 */}
              <div className="flex-1 overflow-y-auto">
                {logsLoading ? (
                  <p className="py-12 text-center text-[13px] text-slate-500">불러오는 중...</p>
                ) : logTab === 'upload' ? (
                  uploadLogsFiltered.filter(searchFilter).length === 0
                    ? <p className="py-12 text-center text-[13px] text-slate-500">기록이 없습니다.</p>
                    : <table className="w-full border-collapse">
                        <colgroup><col style={{width:'24%'}}/><col style={{width:'13%'}}/><col style={{width:'22%'}}/><col style={{width:'22%'}}/><col style={{width:'19%'}}/></colgroup>
                        <tbody>{uploadLogsFiltered.filter(searchFilter).map((l) => (
                          <tr key={l.id} className="transition hover:bg-white/[0.025]">
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-400 whitespace-nowrap">{fmtDateTime(l.uploadedAt)}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3">
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11.5px] font-medium text-slate-300">{l.uploader}</span>
                            </td>
                            <td className="border-b border-white/[0.05] px-4 py-3">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${l.fileType==='HR'?'border-sky-400/20 bg-sky-400/[0.08] text-sky-300':'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300'}`}>
                                {l.fileType==='HR'?'인사정보 파일':'연장근무 파일'}
                              </span>
                            </td>
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-300">{l.yearMonth ?? '—'}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3 font-mono text-[12px] text-slate-500">{l.ip}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                ) : (
                  downloadLogsFiltered.filter(searchFilter).length === 0
                    ? <p className="py-12 text-center text-[13px] text-slate-500">다운로드 기록이 없습니다.</p>
                    : <table className="w-full border-collapse">
                        <colgroup><col style={{width:'24%'}}/><col style={{width:'13%'}}/><col style={{width:'22%'}}/><col style={{width:'22%'}}/><col style={{width:'19%'}}/></colgroup>
                        <tbody>{downloadLogsFiltered.filter(searchFilter).map((l) => (
                          <tr key={l.id} className="transition hover:bg-white/[0.025]">
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-400 whitespace-nowrap">{fmtDateTime(l.uploadedAt)}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3">
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11.5px] font-medium text-slate-300">{l.uploader}</span>
                            </td>
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white">{l.uploaderName}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3">
                              <span className="inline-flex items-center rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-2.5 py-0.5 text-[11.5px] font-semibold text-violet-300">{l.detail ?? '—'}</span>
                            </td>
                            <td className="border-b border-white/[0.05] px-4 py-3 font-mono text-[12px] text-slate-500">{l.ip}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 덮어쓰기 경고 토스트 */}
      {warnToast.visible && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-[480px] flex flex-col gap-3 rounded-2xl border border-amber-400/40 bg-[#1c1400] px-5 py-4 shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_32px_80px_rgba(0,0,0,0.85),0_0_60px_rgba(245,158,11,0.08)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <p className="text-[13.5px] leading-relaxed text-amber-100">{warnToast.message}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWarnToast(prev => ({ ...prev, visible: false, onConfirm: null }))}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-slate-300 transition hover:bg-white/[0.1]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => warnToast.onConfirm?.()}
                className="rounded-xl bg-amber-500 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(245,158,11,0.3)] transition hover:bg-amber-400"
              >
                확인 · 업로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================
// UploadCard
// =====================

type Tone = 'sky' | 'emerald';

type UploadStatus = 'idle' | 'submitting' | 'success' | 'error';

function UploadCard({
  icon,
  tone,
  title,
  file,
  onFile,
  onSubmit,
  extra,
  titleAction,
}: {
  icon: React.ReactNode;
  tone: Tone;
  title: string;
  file: File | null;
  onFile: (f: File | null) => void;
  onSubmit: () => void | Promise<void>;
  extra?: React.ReactNode;
  titleAction?: React.ReactNode;
}) {
  const toneCls =
    tone === 'sky' ? 'bg-sky-400/10 text-sky-300' : 'bg-emerald-400/10 text-emerald-300';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [status, setStatus] = useState<UploadStatus>('idle');

  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPreviewError('');
      setStatus('idle');
      return;
    }
    setStatus('idle');
    let alive = true;
    parsePreview(file)
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setPreviewError('');
      })
      .catch(() => {
        if (!alive) return;
        setPreview(null);
        setPreviewError('파일을 읽지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [file]);

  async function handleSubmit() {
    if (!file || status !== 'idle') return;
    setStatus('submitting');
    try {
      await Promise.all([
        Promise.resolve(onSubmit()),
        new Promise<void>((r) => setTimeout(r, 350)),
      ]);
      setStatus('success');
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 1800);
  }

  return (
    <div className="flex h-[600px] flex-col rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,8,23,0.96))] p-5 shadow-[0_0_40px_rgba(2,132,199,0.06)] backdrop-blur-2xl">
      <div className="mb-5 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneCls}`}>
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {titleAction && <div className="ml-auto">{titleAction}</div>}
      </div>

      {extra && <div className="mb-4">{extra}</div>}

      <div>
        <span className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
          파일 선택
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-slate-300 transition hover:border-sky-300/30 hover:bg-white/[0.07]"
        >
          {file ? (
            <>
              <FileSpreadsheet size={16} className="text-sky-300" />
              <span className="truncate text-white">{file.name}</span>
              <span className="ml-auto whitespace-nowrap text-xs text-slate-500">
                {Math.round(file.size / 1024)} KB
              </span>
            </>
          ) : (
            <>
              <Upload size={16} className="text-slate-500" />
              <span>엑셀 파일을 선택하세요 (.xlsx, .xls)</span>
            </>
          )}
        </button>
      </div>

      {/* 미리보기 — flex-1로 남는 공간을 채워 카드 높이가 변하지 않음 */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.025]">
        <div className="shrink-0 border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
          파일 미리보기
        </div>

        {previewError ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-sm text-rose-400">{previewError}</p>
          </div>
        ) : !file ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-sm text-slate-500">파일을 선택하면 첫 행들이 표시됩니다.</p>
          </div>
        ) : !preview || preview.headers.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-sm text-slate-500">표시할 행이 없습니다.</p>
          </div>
        ) : (
          <div
            className="min-h-0 flex-1 overflow-hidden"
            style={{
              maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
            }}
          >
            <div className="h-full overflow-hidden">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="text-slate-400">
                    {preview.headers.map((h, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap border-b border-white/10 bg-white/[0.03] px-3 py-2 font-semibold"
                      >
                        {h || `열 ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, ri) => (
                    <tr key={ri} className="text-slate-200">
                      {preview.headers.map((_, ci) => (
                        <td key={ci} className="whitespace-nowrap border-b border-white/5 px-3 py-2">
                          {r[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || status !== 'idle'}
        className={`mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(37,99,235,0.26)] transition-all duration-300 disabled:cursor-not-allowed ${
          status === 'success'
            ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_14px_36px_rgba(16,185,129,0.30)]'
            : status === 'error'
              ? 'bg-gradient-to-r from-rose-500 to-red-500'
              : 'bg-gradient-to-r from-blue-600 via-sky-500 to-blue-600 hover:brightness-110'
        } ${!file && status === 'idle' ? 'opacity-50' : ''}`}
      >
        {status === 'submitting' ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            업로드 중...
          </>
        ) : status === 'success' ? (
          <>
            <CheckCircle2 size={16} />
            업로드 완료
          </>
        ) : status === 'error' ? (
          <>
            <X size={16} />
            업로드 실패
          </>
        ) : (
          <>
            <Upload size={16} />
            업로드
          </>
        )}
      </button>
    </div>
  );
}

// =====================
// 다크 select
// =====================

function DarkSelect({
  value,
  onChange,
  options,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  options: number[];
  suffix: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 100 : 'auto' }} className="flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[48px] w-full items-center justify-between rounded-xl border px-4 text-[14px] font-medium transition ${
          open ? 'border-sky-500/50 bg-white/[0.07] text-white' : 'border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.06]'
        }`}
      >
        <span>{value}{suffix}</span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 9999 }}
          className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#0d1525] shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1">
          <div className="max-h-[220px] overflow-y-auto">
            {options.map((o) => (
              <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-[13.5px] transition ${
                  o === value ? 'bg-sky-500/15 font-semibold text-sky-300' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                }`}>
                {o === value && <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />}
                <span className={o === value ? '' : 'ml-4'}>{o}{suffix}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function DatePicker({ value, onChange, placeholder = '날짜 선택' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());

  useEffect(() => {
    function fn(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); } else setViewMonth(m => m-1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); } else setViewMonth(m => m+1); }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selectedDay = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth ? parsed.getDate() : null;
  const todayDay = today.getFullYear() === viewYear && today.getMonth() === viewMonth ? today.getDate() : null;
  const displayValue = parsed ? `${parsed.getFullYear()}. ${parsed.getMonth()+1}. ${parsed.getDate()}.` : '';

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 200 : 'auto' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`flex h-[36px] w-[148px] items-center justify-between rounded-[10px] border px-3 text-[13px] transition ${open ? 'border-sky-500/60 bg-white/[0.08]' : 'border-white/[0.1] bg-white/[0.05] hover:border-white/[0.2]'}`}>
        <span className={displayValue ? 'text-slate-200' : 'text-slate-600'}>{displayValue || placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-slate-500 shrink-0"><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 9999, width: 240 }}
          className="rounded-2xl border border-white/[0.12] bg-[#0d1525] shadow-[0_20px_60px_rgba(0,0,0,0.8)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"><ChevronLeft size={14} /></button>
            <span className="text-[13px] font-semibold text-white">{viewYear}년 {MONTHS_KO[viewMonth]}</span>
            <button type="button" onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"><ChevronRight size={14} /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center">
            {['일','월','화','수','목','금','토'].map((d, i) => (
              <span key={d} className={`text-[11px] font-medium pb-1 ${i===0?'text-rose-400':i===6?'text-sky-400':'text-slate-500'}`}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />;
              const isSelected = day === selectedDay;
              const isToday = day === todayDay;
              const dow = (firstDay + day - 1) % 7;
              return (
                <button key={day} type="button"
                  onClick={() => { const mm=String(viewMonth+1).padStart(2,'0'); const dd=String(day).padStart(2,'0'); onChange(`${viewYear}-${mm}-${dd}`); setOpen(false); }}
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-[12.5px] font-medium transition ${isSelected?'bg-sky-500 text-white':isToday?'border border-sky-500/40 text-sky-300':dow===0?'text-rose-400 hover:bg-white/[0.06]':dow===6?'text-sky-400 hover:bg-white/[0.06]':'text-slate-300 hover:bg-white/[0.06]'}`}>
                  {day}
                </button>
              );
            })}
          </div>
          {value && <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="mt-3 w-full rounded-[8px] border border-white/[0.08] py-1.5 text-[12px] text-slate-500 transition hover:text-slate-300">선택 해제</button>}
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, width = 'max-w-[760px]' }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className={`w-full ${width} rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,8,23,0.99))] p-6 shadow-[0_0_60px_rgba(2,132,199,0.12)] backdrop-blur-2xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}