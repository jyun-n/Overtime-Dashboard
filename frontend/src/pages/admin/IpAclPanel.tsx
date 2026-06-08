import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { CheckCircle2, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';

type AclMode = 'off' | 'audit' | 'enforce';

type LinkedAccount = { id: string; name: string; username: string };

type AclEntry = {
  id: string;
  ip: string;
  ownerName: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  account: LinkedAccount | null;
  createdByName: string | null;
};

type AclResponse = { mode: AclMode; currentIp: string; entries: AclEntry[] };

type AccountOption = { id: string; name: string; username: string };

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { hour12: false }).replace(/\.$/, '');
}

export default function IpAclPanel() {
  const [entries, setEntries] = useState<AclEntry[]>([]);
  const [mode, setMode] = useState<AclMode>('off');
  const [currentIp, setCurrentIp] = useState('');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const [form, setForm] = useState({ ip: '', userId: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AclEntry | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const closeDelete = useCallback(() => {
    setDeleteTarget(null);
    setDeletePassword('');
    setShowDeletePassword(false);
    setDeleteError('');
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aclRes, usersRes] = await Promise.all([
        api.get<AclResponse>('/ip-acl'),
        api.get<{ users: AccountOption[] }>('/users'),
      ]);
      setEntries(aclRes.data.entries);
      setMode(aclRes.data.mode);
      setCurrentIp(aclRes.data.currentIp);
      setAccounts(usersRes.data.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.ip.trim()) {
      setFormError('IP를 입력해주세요.');
      return;
    }
    if (!form.userId) {
      setFormError('연결 계정을 선택해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/ip-acl', {
        ip: form.ip.trim(),
        userId: form.userId,
      });
      setForm({ ip: '', userId: '' });
      showToast('허용 IP가 등록되었습니다.');
      await load();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === 'invalid_ip') setFormError('올바른 IP 형식이 아닙니다. (단일 IP만 입력 가능)');
      else if (code === 'ip_exists') setFormError('이미 등록된 IP입니다.');
      else if (code === 'invalid_account') setFormError('연결할 계정을 찾을 수 없습니다.');
      else setFormError('등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(entry: AclEntry) {
    try {
      await api.patch(`/ip-acl/${entry.id}`, { isActive: !entry.isActive });
      await load();
    } catch {
      showToast('변경 중 오류가 발생했습니다.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError('');
    if (!deletePassword) {
      setDeleteError('비밀번호를 입력해주세요.');
      return;
    }
    try {
      await api.delete(`/ip-acl/${deleteTarget.id}`, { data: { password: deletePassword } });
      closeDelete();
      showToast('허용 IP가 삭제되었습니다.');
      await load();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === 'invalid_password') setDeleteError('비밀번호가 올바르지 않습니다.');
      else if (code === 'password_required') setDeleteError('비밀번호를 입력해주세요.');
      else setDeleteError('삭제 중 오류가 발생했습니다.');
    }
  }

  const activeCount = entries.filter((e) => e.isActive).length;
  const armed = activeCount > 0;
  const currentIpRegistered = entries.some((e) => e.isActive && e.ip === currentIp);

  return (
    <div className="space-y-5">
      {/* 자기잠금 경고 — enforce 모드에서 현재 IP가 미등록일 때만 노출(안전장치) */}
      {!loading && mode === 'enforce' && armed && !currentIpRegistered && (
        <div className="rounded-[16px] border border-rose-500/40 bg-rose-500/[0.1] px-4 py-3.5 text-[13px] leading-relaxed text-rose-200">
          ⚠️ 현재 접속 IP(<span className="font-mono font-semibold">{currentIp || '—'}</span>)가 활성 허용 목록에 없습니다.
          차단 모드에서는 다음 로그인부터 <span className="font-semibold">관리자 본인도 접속이 차단</span>될 수 있습니다.
          아래에서 현재 IP를 먼저 등록하세요.
        </div>
      )}

      {/* 현재 접속 IP + 원클릭 추가 */}
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3.5">
        <span className="text-[13px] text-slate-400">현재 접속 IP</span>
        <span className="font-mono text-[14px] font-semibold text-white">{currentIp || '—'}</span>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, ip: currentIp }))}
          disabled={!currentIp}
          className="ml-auto rounded-xl border border-sky-400/30 bg-sky-500/[0.08] px-3.5 py-2 text-[12.5px] font-semibold text-sky-300 transition hover:bg-sky-500/[0.14] disabled:opacity-40"
        >
          이 IP 입력란에 채우기
        </button>
      </div>

      {/* 등록 폼 */}
      <form onSubmit={handleAdd} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 lg:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="허용 IP">
            <input
              type="text"
              value={form.ip}
              onChange={(e) => { setForm((p) => ({ ...p, ip: e.target.value })); setFormError(''); }}
              placeholder="예: 10.20.152.146"
              className="h-[46px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 font-mono text-[14px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-white/[0.06]"
            />
          </Field>
          <Field label="연결 계정">
            <select
              value={form.userId}
              onChange={(e) => { setForm((p) => ({ ...p, userId: e.target.value })); setFormError(''); }}
              className="h-[46px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-3.5 text-[14px] text-white outline-none transition focus:border-sky-500/50 focus:bg-white/[0.06]"
            >
              <option value="" className="bg-slate-900">계정 선택</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} className="bg-slate-900">{a.name} ({a.username})</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-slate-500">한 계정에 여러 IP를 등록할 수 있습니다.</p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-r from-blue-600 to-sky-500 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            <Plus size={14} /> 등록
          </button>
        </div>
        {formError && <p className="mt-3 text-[13px] text-rose-400">{formError}</p>}
      </form>

      {/* 목록 */}
      <div className="overflow-hidden rounded-[18px] border border-white/10">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr className="bg-white/[0.04] text-[11.5px] uppercase tracking-[0.06em] text-slate-400">
              <th className="px-4 py-3 font-semibold">IP</th>
              <th className="px-4 py-3 font-semibold">연결 계정</th>
              <th className="px-4 py-3 font-semibold">등록자</th>
              <th className="px-4 py-3 font-semibold">등록일</th>
              <th className="px-4 py-3 text-center font-semibold">상태</th>
              <th className="px-4 py-3 text-center font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">불러오는 중...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">등록된 허용 IP가 없습니다.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-white/[0.06] text-slate-200">
                  <td className="px-4 py-3 font-mono font-medium text-white">{e.ip}</td>
                  <td className="px-4 py-3">
                    {e.account
                      ? <span className="text-slate-200">{e.account.name} <span className="text-slate-500">({e.account.username})</span></span>
                      : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{e.createdByName || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{fmtDateTime(e.createdAt)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(e)}
                      className={`inline-flex w-[56px] items-center justify-center rounded-full py-1 text-[12px] font-semibold transition ${
                        e.isActive
                          ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          : 'bg-slate-500/15 text-slate-400 hover:bg-slate-500/25'
                      }`}
                    >
                      {e.isActive ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(e)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 삭제 확인 */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[460px] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,8,23,0.99))] p-6 shadow-[0_0_60px_rgba(2,132,199,0.12)] backdrop-blur-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">허용 IP 삭제</h2>
              <button type="button" onClick={closeDelete} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              <span className="font-mono font-semibold text-white">{deleteTarget.ip}</span>
              {deleteTarget.account ? <> (<span className="text-slate-200">{deleteTarget.account.name}</span>)</> : null} 를 허용 목록에서 삭제하려면 비밀번호를 입력하세요.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">관리자 비밀번호</label>
              <div className="relative">
                <input
                  type={showDeletePassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleDelete(); }}
                  placeholder="비밀번호 입력"
                  autoFocus
                  className="h-[48px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 pr-12 text-[14px] text-white outline-none transition placeholder:text-slate-600 focus:border-rose-500/50 focus:bg-white/[0.06]"
                />
                <button type="button" onClick={() => setShowDeletePassword((p) => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-rose-300">
                  {showDeletePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {deleteError && <p className="mt-2 text-[13px] text-rose-400">{deleteError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDelete} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]">취소</button>
              <button type="button" onClick={() => void handleDelete()} className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">삭제</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 토스트 */}
      {toast && createPortal(
        <div className="fixed bottom-8 left-1/2 z-[9999] -translate-x-1/2">
          <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,8,23,0.99))] px-5 py-4 shadow-[0_0_40px_rgba(2,132,199,0.2)] backdrop-blur-2xl">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-[14px] font-semibold text-white">{toast}</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</label>
      {children}
    </div>
  );
}
