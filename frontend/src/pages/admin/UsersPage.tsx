import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import IpAclPanel from './IpAclPanel';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

type AccountRole = 'ADMIN' | 'USER';

type Account = {
  id: string;
  empNo: string | null;
  department: string | null;
  jobGroup: string | null;
  name: string;
  username: string;
  role: AccountRole;
  lastLoginAt: string | null;
};

type CreateForm = {
  empNo: string;
  department: string;
  jobGroup: string;
  name: string;
  username: string;
  password: string;
  role: AccountRole;
};

const EMPTY_FORM: CreateForm = {
  empNo: '',
  department: '',
  jobGroup: '',
  name: '',
  username: '',
  password: '',
  role: 'USER',
};

const PASSWORD_RULE_TEXT = '10자 이상이며 영문 대/소문자, 숫자, 특수문자 중 3종 이상을 포함해야 합니다.';

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return '비밀번호는 10자 이상이어야 합니다.';
  if (pw.length > 128) return '비밀번호가 너무 깁니다. (최대 128자)';
  const classes =
    [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return '영문 대/소문자, 숫자, 특수문자 중 3종 이상을 포함해야 합니다.';
  if (/(.)\1{3,}/.test(pw)) return '동일한 문자를 4회 이상 연속 사용할 수 없습니다.';
  return null;
}

function mapPasswordError(reason?: string): string {
  switch (reason) {
    case 'too_short': return '비밀번호는 10자 이상이어야 합니다.';
    case 'too_long': return '비밀번호가 너무 깁니다. (최대 128자)';
    case 'insufficient_complexity': return '영문 대/소문자, 숫자, 특수문자 중 3종 이상을 포함해야 합니다.';
    case 'repeated_chars': return '동일한 문자를 4회 이상 연속 사용할 수 없습니다.';
    case 'common_password': return '너무 흔한 비밀번호입니다. 다른 비밀번호를 사용해주세요.';
    default: return PASSWORD_RULE_TEXT;
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { hour12: false }).replace(/\.$/, '');
}

type LoginLog = {
  id: string;
  loginAt: string;
  username: string;
  name: string;
  department: string | null;
  jobGroup: string | null;
  ip: string;
};

type AuditAction = 'EDIT_INFO' | 'EDIT_ROLE' | 'DELETE' | 'CREATE' | 'RESET_PW' | 'IPACL_ADD' | 'IPACL_REMOVE' | 'IPACL_TOGGLE';
type AuditLog = {
  id: string;
  at: string;
  actorUsername: string;
  targetName: string;
  targetUsername: string;
  action: AuditAction;
  detail: string;
  ip: string;
};

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<'manage' | 'create' | 'ipacl'>('manage');
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [showResetConfirmPw, setShowResetConfirmPw] = useState(false);
  const [deleteSecret, setDeleteSecret] = useState('');
  const [showDeleteSecret, setShowDeleteSecret] = useState(false);
  const [modalError, setModalError] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<{ department: string; jobGroup: string; name: string; role: AccountRole }>({ department: '', jobGroup: '', name: '', role: 'USER' });
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createError, setCreateError] = useState('');

  const [toast, setToast] = useState<string | null>(null);

  const [loginLogsOpen, setLoginLogsOpen] = useState(false);
  const [loginLogs, setLoginLogs] = useState<LoginLog[] | null>(null);
  const [loginLogsLoading, setLoginLogsLoading] = useState(false);
  const [loginLogsError, setLoginLogsError] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [logTab, setLogTab] = useState<'login' | 'audit'>('login');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get<{ users: Account[] }>('/users');
      setAccounts(data.users);
    } catch (err) {
      console.error('계정 목록 로드 실패', err);
    }
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function openEdit(a: Account) {
    setSelected(a);
    setEditForm({ department: a.department ?? '', jobGroup: a.jobGroup ?? '', name: a.name, role: a.role });
    setEditPassword('');
    setShowEditPassword(false);
    setModalError('');
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editForm.department.trim() || !editForm.jobGroup.trim()) {
      setModalError('소속부서와 직급을 입력해주세요.');
      return;
    }
    if (!editPassword) { setModalError('본인 비밀번호를 입력해주세요.'); return; }
    try {
      await api.patch(`/users/${selected!.id}`, {
        role: editForm.role,
        department: editForm.department,
        jobGroup: editForm.jobGroup,
        password: editPassword,
      });
      await loadAccounts();
      setEditOpen(false);
      setSelected(null);
      setToast('정보가 수정되었습니다.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg === 'invalid_password') setModalError('본인 비밀번호가 올바르지 않습니다.');
      else if (msg === 'cannot_modify_root_admin') setModalError('admin 계정은 수정할 수 없습니다.');
      else setModalError('수정에 실패했습니다.');
    }
  }

  function openReset(a: Account) {
    setSelected(a);
    setNewPassword('');
    setShowNewPassword(false);
    setResetConfirmPw('');
    setShowResetConfirmPw(false);
    setModalError('');
    setResetOpen(true);
  }

  function openDelete(a: Account) {
    setSelected(a);
    setDeleteSecret('');
    setShowDeleteSecret(false);
    setModalError('');
    setDeleteOpen(true);
  }

  async function handleReset() {
    if (!newPassword.trim()) { setModalError('새 비밀번호를 입력해주세요.'); return; }
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setModalError(pwErr); return; }
    const isAdminTarget = selected?.username === 'admin';
    if (!resetConfirmPw) { setModalError(isAdminTarget ? '마스터 비밀번호를 입력해주세요.' : '본인 비밀번호를 입력해주세요.'); return; }
    try {
      await api.post(`/users/${selected!.id}/reset-password`, { newPassword, password: resetConfirmPw });
      setResetOpen(false);
      setSelected(null);
      setToast('비밀번호가 재설정되었습니다.');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; reason?: string } } })?.response?.data;
      if (resp?.error === 'master_password_required') setModalError('마스터 비밀번호가 올바르지 않습니다.');
      else if (resp?.error === 'invalid_password') setModalError('본인 비밀번호가 올바르지 않습니다.');
      else if (resp?.error === 'weak_password') setModalError(mapPasswordError(resp.reason));
      else setModalError('비밀번호 재설정에 실패했습니다.');
    }
  }

  async function handleDelete() {
    if (!deleteSecret.trim()) { setModalError('본인 비밀번호를 입력해주세요.'); return; }
    if (selected?.role === 'ADMIN') { setModalError('관리자 계정은 탈퇴 처리할 수 없습니다.'); return; }
    try {
      await api.delete(`/users/${selected!.id}`, { data: { password: deleteSecret } });
      await loadAccounts();
      setDeleteOpen(false);
      setSelected(null);
      setToast('계정이 탈퇴 처리되었습니다.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg === 'invalid_password') setModalError('본인 비밀번호가 올바르지 않습니다.');
      else if (msg === 'cannot_delete_admin') setModalError('관리자 계정은 탈퇴 처리할 수 없습니다.');
      else setModalError('탈퇴 처리에 실패했습니다.');
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    const { name, username, password } = createForm;
    if (!name || !username || !password) { setCreateError('모든 항목을 입력해주세요.'); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setCreateError(pwErr); return; }
    try {
      const { name, username, password, empNo, department, jobGroup } = createForm;
      await api.post('/users', { username, password, name, role: createForm.role, empNo, department, jobGroup });
      await loadAccounts();
      setCreateForm(EMPTY_FORM);
      setActiveTab('manage');
      setToast('계정이 생성되었습니다.');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; reason?: string } } })?.response?.data;
      if (resp?.error === 'username_taken') setCreateError('이미 사용 중인 아이디입니다.');
      else if (resp?.error === 'weak_password') setCreateError(mapPasswordError(resp.reason));
      else setCreateError('계정 생성에 실패했습니다.');
    }
  }

  async function openLoginLogs() {
    setLoginLogsOpen(true);
    setLoginLogsLoading(true);
    setLoginLogsError('');
    setLogSearch('');
    setLogDateFrom('');
    setLogDateTo('');
    setLogTab('login');
    setLoginLogs(null);
    try {
      const [logsRes, auditRes] = await Promise.all([
        api.get<{ logs: LoginLog[] }>('/login-logs?limit=200'),
        api.get<{ logs: AuditLog[] }>('/users/audit-logs?limit=200'),
      ]);
      setLoginLogs(logsRes.data.logs);
      setAuditLogs(auditRes.data.logs);
    } catch {
      setLoginLogsError('기록을 불러오지 못했습니다.');
      setLoginLogs([]);
    } finally {
      setLoginLogsLoading(false);
    }
  }

  function changeForm<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    if (key === 'empNo') {
      const onlyDigits = String(value).replace(/[^0-9]/g, '');
      setCreateForm((p) => ({ ...p, empNo: onlyDigits }));
      return;
    }
    setCreateForm((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="space-y-6">
      {toast && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto relative overflow-hidden rounded-2xl border border-white/[0.15] px-6 py-4"
            style={{
              background: 'linear-gradient(145deg, rgba(22,33,58,0.98) 0%, rgba(10,16,35,0.99) 100%)',
              backdropFilter: 'blur(32px)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 4px 6px rgba(0,0,0,0.3), 0 20px 40px rgba(0,0,0,0.6), 0 0 80px rgba(56,189,248,0.06)',
            }}>
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="flex items-center gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30"
                style={{ boxShadow: '0 0 16px rgba(52,211,153,0.2)' }}>
                <CheckCircle2 size={18} className="text-emerald-400" />
              </div>
              <p className="text-[14px] font-semibold text-white">{toast}</p>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div>
        <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-white lg:text-[34px]">계정 관리</h1>
        <p className="mt-2 text-sm text-slate-400">계정 생성, 비밀번호 재설정, 탈퇴 처리 및 로그인 접속 정보를 관리합니다.</p>
      </div>

      <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,8,23,0.96))] p-4 shadow-[0_0_80px_rgba(2,132,199,0.08)] backdrop-blur-2xl lg:p-6">
        <div className="mb-6 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <TabButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')}>계정 관리</TabButton>
          <TabButton active={activeTab === 'create'} onClick={() => setActiveTab('create')}>계정 생성</TabButton>
          <TabButton active={activeTab === 'ipacl'} onClick={() => setActiveTab('ipacl')}>IP 접근 제어</TabButton>
        </div>

        {activeTab === 'manage' ? (
          <ManageTable accounts={accounts} onReset={openReset} onDelete={openDelete} onEdit={openEdit} onViewLogs={openLoginLogs} />
        ) : activeTab === 'create' ? (
          <CreateForm form={createForm} showPassword={showCreatePassword} onTogglePassword={() => setShowCreatePassword((p) => !p)} error={createError} onChange={changeForm} onSubmit={handleCreate} />
        ) : (
          <IpAclPanel />
        )}
      </div>

      {editOpen && selected && (
        <Modal title={`${selected.name}(${selected.username}) 정보 수정`} onClose={() => setEditOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: '소속부서', key: 'department', placeholder: '소속부서 입력' },
              { label: '직급', key: 'jobGroup', placeholder: '직급 입력' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">{label}</label>
                <input
                  type="text"
                  value={editForm[key as keyof typeof editForm] as string}
                  onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-[48px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-[14px] text-white outline-none transition focus:border-sky-500/50 focus:bg-white/[0.06]"
                />
              </div>
            ))}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">권한</label>
              <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {(['USER', 'ADMIN'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setEditForm((p) => ({ ...p, role: r }))}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      editForm.role === r
                        ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {r === 'ADMIN' ? '관리자' : '사용자'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">본인 비밀번호 확인</label>
            <div className="relative">
              <input type={showEditPassword ? 'text' : 'password'} value={editPassword} onChange={(e) => { setEditPassword(e.target.value); setModalError(''); }} placeholder="본인(관리자) 비밀번호 입력"
                className="h-[48px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 pr-12 text-[14px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-white/[0.06]" />
              <button type="button" onClick={() => setShowEditPassword((p) => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-sky-300">
                {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {modalError && <p className="mt-3 text-sm text-rose-400">{modalError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <ModalCancelButton onClick={() => setEditOpen(false)}>취소</ModalCancelButton>
            <ModalConfirmButton onClick={handleEdit}>저장</ModalConfirmButton>
          </div>
        </Modal>
      )}

      {resetOpen && selected && (
        <Modal title="비밀번호 재설정" onClose={() => setResetOpen(false)}>
          <p className="mb-4 text-sm leading-relaxed text-slate-300">
            <span className="font-semibold text-white">{selected.name}</span> ({selected.username}) 계정의 새 비밀번호를 입력하세요.
          </p>
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
              {selected.username === 'admin' ? '마스터 비밀번호 확인' : '본인 비밀번호 확인'}
            </label>
            <div className="relative">
              <input type={showResetConfirmPw ? 'text' : 'password'} value={resetConfirmPw} onChange={(e) => { setResetConfirmPw(e.target.value); setModalError(''); }}
                placeholder={selected.username === 'admin' ? '마스터 비밀번호 입력' : '본인(관리자) 비밀번호 입력'}
                className="h-[48px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 pr-12 text-[14px] text-white outline-none transition placeholder:text-slate-600 focus:border-amber-500/50 focus:bg-white/[0.06]" />
              <button type="button" onClick={() => setShowResetConfirmPw((p) => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-amber-300">
                {showResetConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">새 비밀번호</label>
            <div className="relative">
              <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="새 비밀번호 입력"
                className="h-[48px] w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 pr-12 text-[14px] text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-white/[0.06]" />
              <button type="button" onClick={() => setShowNewPassword((p) => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-sky-300">
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-500">{PASSWORD_RULE_TEXT}</p>
          </div>
          {modalError && <p className="mt-3 text-sm text-rose-400">{modalError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <ModalCancelButton onClick={() => setResetOpen(false)}>취소</ModalCancelButton>
            <ModalConfirmButton onClick={() => void handleReset()}>변경</ModalConfirmButton>
          </div>
        </Modal>
      )}

      {deleteOpen && selected && (
        <Modal title="계정 탈퇴" onClose={() => setDeleteOpen(false)}>
          <p className="mb-4 text-sm leading-relaxed text-slate-300">
            <span className="font-semibold text-white">{selected.name}</span> ({selected.username}) 계정을 탈퇴 처리하려면 본인(관리자) 비밀번호를 입력하세요.
          </p>
          <div className="relative">
            <input type={showDeleteSecret ? 'text' : 'password'} value={deleteSecret} onChange={(e) => { setDeleteSecret(e.target.value); setModalError(''); }} placeholder="본인 비밀번호 입력"
              className="h-[54px] w-full rounded-[16px] border border-white/10 bg-white/[0.04] px-4 pr-12 text-[14px] text-white outline-none transition duration-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-white/[0.06]" />
            <button type="button" onClick={() => setShowDeleteSecret((p) => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-sky-300">
              {showDeleteSecret ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {modalError && <p className="mt-3 text-sm text-rose-400">{modalError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <ModalCancelButton onClick={() => setDeleteOpen(false)}>취소</ModalCancelButton>
            <button type="button" onClick={handleDelete}
              className="rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">
              탈퇴
            </button>
          </div>
        </Modal>
      )}

      {loginLogsOpen && (
        <Modal title="기록 조회" width="max-w-[900px]" onClose={() => { setLoginLogsOpen(false); setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); setLogTab('login'); }}>
          <div className="flex flex-col" style={{ height: '72vh' }}>
            {/* 탭 */}
            <div className="shrink-0 mb-4 flex items-center gap-0 border-b border-white/[0.08]">
              <button type="button" onClick={() => { setLogTab('login'); setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); }}
                className={`relative px-5 pb-3 pt-1 text-[13px] font-semibold transition ${logTab === 'login' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                로그인 기록
                {logTab === 'login' && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />}
              </button>
              <button type="button" onClick={() => { setLogTab('audit'); setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); }}
                className={`relative px-5 pb-3 pt-1 text-[13px] font-semibold transition ${logTab === 'audit' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                변경 내역
                {logTab === 'audit' && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />}
              </button>
            </div>

            {/* 필터 */}
            <div className="shrink-0 mb-3 flex flex-wrap items-center gap-2">
              <DatePicker value={logDateFrom} onChange={setLogDateFrom} placeholder="시작일" />
              <span className="text-slate-600 text-[12px]">~</span>
              <DatePicker value={logDateTo} onChange={setLogDateTo} placeholder="종료일" />
              <div className="relative flex-1 min-w-[160px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                  placeholder={logTab === 'login' ? '이름, 아이디, IP 검색...' : '이름, 아이디 검색...'}
                  className="h-[36px] w-full rounded-[10px] border border-white/[0.1] bg-white/[0.05] pl-8 pr-3 text-[13px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-500/50" />
              </div>
              {(logSearch || logDateFrom || logDateTo) && (
                <button type="button" onClick={() => { setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); }}
                  className="h-[36px] rounded-[10px] border border-white/[0.1] bg-white/[0.04] px-3 text-[12px] text-slate-400 transition hover:text-white whitespace-nowrap">초기화</button>
              )}
            </div>

            {logTab === 'login' ? (
              <div className="min-h-0 flex-1 flex flex-col overflow-hidden rounded-[12px] border border-white/[0.08]">
                <div className="shrink-0 bg-white/[0.03] border-b border-white/[0.08]">
                  <table className="w-full border-collapse">
                    <colgroup>
                      <col style={{ width: '25%' }}/>
                      <col style={{ width: '13%' }}/>
                      <col style={{ width: '14%' }}/>
                      <col style={{ width: '28%' }}/>
                      <col style={{ width: '20%' }}/>
                    </colgroup>
                    <thead><tr>{['시각','아이디','성명','소속 / 직급','IP'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold tracking-[0.05em] text-slate-400">{h}</th>
                    ))}</tr></thead>
                  </table>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loginLogsLoading ? (
                    <p className="py-12 text-center text-[13px] text-slate-500">불러오는 중...</p>
                  ) : (() => {
                    const q = logSearch.trim().toLowerCase();
                    const filtered = (loginLogs ?? []).filter((l) => {
                      const ms = !q || l.name.toLowerCase().includes(q) || l.username.toLowerCase().includes(q) || l.ip.includes(q);
                      const mf = !logDateFrom || new Date(l.loginAt) >= new Date(logDateFrom);
                      const mt = !logDateTo || new Date(l.loginAt) <= new Date(logDateTo + 'T23:59:59');
                      return ms && mf && mt;
                    });
                    if (filtered.length === 0) return <p className="py-12 text-center text-[13px] text-slate-500">조건에 맞는 기록이 없습니다.</p>;
                    return (
                      <table className="w-full border-collapse">
                        <colgroup>
                          <col style={{ width: '25%' }}/>
                          <col style={{ width: '13%' }}/>
                          <col style={{ width: '14%' }}/>
                          <col style={{ width: '28%' }}/>
                          <col style={{ width: '20%' }}/>
                        </colgroup>
                        <tbody>{filtered.map((l) => (
                          <tr key={l.id} className="transition hover:bg-white/[0.025]">
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-400 whitespace-nowrap">{fmtDateTime(l.loginAt)}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3">
                              <span className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-2.5 py-0.5 text-[11.5px] font-medium text-sky-300">{l.username}</span>
                            </td>
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white">{l.name}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-400">{l.department ?? '—'}<span className="mx-1.5 text-slate-700">/</span>{l.jobGroup ?? '—'}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3 font-mono text-[12px] text-slate-500">{l.ip}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 flex flex-col overflow-hidden rounded-[12px] border border-white/[0.08]">
                <div className="shrink-0 bg-white/[0.03] border-b border-white/[0.08]">
                  <table className="w-full border-collapse">
                    <colgroup>
                      <col style={{ width: '25%' }}/>
                      <col style={{ width: '13%' }}/>
                      <col style={{ width: '14%' }}/>
                      <col style={{ width: '30%' }}/>
                      <col style={{ width: '18%' }}/>
                    </colgroup>
                    <thead><tr>{['시각','처리자','대상','변경 내용','IP'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold tracking-[0.05em] text-slate-400">{h}</th>
                    ))}</tr></thead>
                  </table>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {(() => {
                    const q = logSearch.trim().toLowerCase();
                    const filtered = auditLogs.filter((l) => {
                      const ms = !q || l.targetName.toLowerCase().includes(q) || l.targetUsername.toLowerCase().includes(q) || l.actorUsername.toLowerCase().includes(q);
                      const mf = !logDateFrom || new Date(l.at) >= new Date(logDateFrom);
                      const mt = !logDateTo || new Date(l.at) <= new Date(logDateTo + 'T23:59:59');
                      return ms && mf && mt;
                    });
                    if (filtered.length === 0) return (
                      <p className="py-12 text-center text-[13px] text-slate-500">
                        {auditLogs.length === 0 ? '아직 수정 내역이 없습니다.' : '조건에 맞는 기록이 없습니다.'}
                      </p>
                    );
                    return (
                      <table className="w-full border-collapse">
                        <colgroup>
                          <col style={{ width: '25%' }}/>
                          <col style={{ width: '13%' }}/>
                          <col style={{ width: '14%' }}/>
                          <col style={{ width: '30%' }}/>
                          <col style={{ width: '18%' }}/>
                        </colgroup>
                        <tbody>{filtered.map((l) => (
                          <tr key={l.id} className="transition hover:bg-white/[0.025]">
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-400 whitespace-nowrap">{fmtDateTime(l.at)}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3">
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11.5px] font-medium text-slate-300">{l.actorUsername}</span>
                            </td>
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white">{l.targetName}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3 text-[13px] text-slate-300">{l.detail}</td>
                            <td className="border-b border-white/[0.05] px-4 py-3 font-mono text-[12px] text-slate-500">{l.ip || '—'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// =====================
// Sub-components
// =====================

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${active ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]' : 'text-slate-300 hover:text-white'}`}>
      {children}
    </button>
  );
}

function ManageTable({ accounts, onReset, onDelete, onEdit, onViewLogs }: {
  accounts: Account[];
  onReset: (a: Account) => void;
  onDelete: (a: Account) => void;
  onEdit: (a: Account) => void;
  onViewLogs: (a: Account) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.025]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-center">
          <thead>
            <tr className="bg-white/[0.03] text-[13px] font-semibold tracking-[0.04em] text-slate-300">
              <th className="border-b border-r border-white/10 px-4 py-4">순번</th>
              <th className="border-b border-r border-white/10 px-4 py-4">사번</th>
              <th className="border-b border-r border-white/10 px-4 py-4">소속부서</th>
              <th className="border-b border-r border-white/10 px-4 py-4">직급</th>
              <th className="border-b border-r border-white/10 px-4 py-4">사원명</th>
              <th className="border-b border-r border-white/10 px-4 py-4">아이디</th>
              <th className="border-b border-r border-white/10 px-4 py-4">권한</th>
              <th className="border-b border-white/10 px-4 py-4">관리</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr><td colSpan={8} className="border-b border-white/10 px-4 py-12 text-sm text-slate-500">등록된 계정이 없습니다.</td></tr>
            ) : (
              accounts.map((a, i) => (
                <tr key={a.id} className="text-[14px] text-slate-100 transition hover:bg-white/[0.03]">
                  <td className="border-b border-r border-white/10 px-4 py-5">
                    <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-semibold text-slate-300">{i + 1}</span>
                  </td>
                  <td className="border-b border-r border-white/10 px-4 py-5">{a.empNo ?? '—'}</td>
                  <td className="border-b border-r border-white/10 px-4 py-5">{a.department ?? '—'}</td>
                  <td className="border-b border-r border-white/10 px-4 py-5">{a.jobGroup ?? '—'}</td>
                  <td className="border-b border-r border-white/10 px-4 py-5 font-medium text-white">{a.name}</td>
                  <td className="border-b border-r border-white/10 px-4 py-5">
                    <span className="inline-flex items-center rounded-full border border-sky-400/[0.18] bg-sky-400/[0.08] px-3 py-1 text-sm font-medium text-sky-200">{a.username}</span>
                  </td>
                  <td className="border-b border-r border-white/10 px-4 py-5"><RoleBadge role={a.role} /></td>
                  <td className="border-b border-white/10 px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      {a.username === 'admin' ? (
                        <>
                          <button type="button" onClick={() => onReset(a)}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition hover:brightness-110">
                            <KeyRound size={13} />비밀번호 재설정
                          </button>
                          <button type="button" onClick={() => onViewLogs(a)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12.5px] font-semibold text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-500/[0.08] hover:text-white">
                            <History size={13} />로그 보기
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => onEdit(a)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12.5px] font-semibold text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-500/[0.08] hover:text-white">
                            <Pencil size={13} />수정
                          </button>
                          <button type="button" onClick={() => onReset(a)}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition hover:brightness-110">
                            <KeyRound size={13} />비밀번호 재설정
                          </button>
                          <button type="button" onClick={() => onDelete(a)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12.5px] font-semibold text-slate-200 transition hover:border-rose-400/25 hover:bg-rose-500/[0.08] hover:text-white">
                            <Trash2 size={13} />탈퇴
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: AccountRole }) {
  const cls = role === 'ADMIN' ? 'border-amber-400/25 bg-amber-400/[0.08] text-amber-200' : 'border-slate-400/20 bg-slate-400/[0.08] text-slate-200';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{role}</span>;
}

function CreateForm({ form, showPassword, onTogglePassword, error, onChange, onSubmit }: {
  form: CreateForm;
  showPassword: boolean;
  onTogglePassword: () => void;
  error: string;
  onChange: <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <form onSubmit={onSubmit} className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><Plus size={18} /></div>
          <div>
            <h2 className="text-lg font-semibold text-white">신규 계정 생성</h2>
            <p className="text-sm text-slate-400">계정에 필요한 기본 정보를 입력하세요.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="사번" placeholder="예: 19784" value={form.empNo} onChange={(v) => onChange('empNo', v)} />
          <FormField label="소속부서" placeholder="예: 디지털전략팀" value={form.department} onChange={(v) => onChange('department', v)} />
          <FormField label="직급" placeholder="예: 서기" value={form.jobGroup} onChange={(v) => onChange('jobGroup', v)} />
          <FormField label="사원명" placeholder="예: 이지윤" value={form.name} onChange={(v) => onChange('name', v)} />
          <FormField label="아이디" placeholder="예: jyun" value={form.username} onChange={(v) => onChange('username', v)} />
          <div>
            <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">비밀번호</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={form.password} placeholder="초기 비밀번호" onChange={(e) => onChange('password', e.target.value)}
                className="h-[52px] w-full rounded-[16px] border border-white/10 bg-white/[0.04] px-4 pr-12 text-[14px] text-white outline-none transition duration-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-white/[0.06]" />
              <button type="button" onClick={onTogglePassword}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-sky-300">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-500">{PASSWORD_RULE_TEXT}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">권한</label>
            <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {(['USER', 'ADMIN'] as const).map((r) => (
                <button key={r} type="button" onClick={() => onChange('role', r)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${form.role === r ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]' : 'text-slate-300 hover:text-white'}`}>
                  {r === 'ADMIN' ? '관리자' : '사용자'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-400">{error}</div>}
        <div className="mt-6">
          <button type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-sky-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(37,99,235,0.26)] transition duration-200 hover:brightness-110">
            <Plus size={16} />계정 생성
          </button>
        </div>
      </form>
      <div className="rounded-[24px] border border-white/10 bg-white/[0.025] p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><ShieldCheck size={18} /></div>
          <div>
            <h2 className="text-lg font-semibold text-white">생성 규칙</h2>
            <p className="text-sm text-slate-400">계정 생성 시 반드시 확인하세요.</p>
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-300">
          <RuleItem text="아이디는 중복 없이 고유해야 합니다." />
          <RuleItem text="모든 필드는 필수 입력입니다." />
          <RuleItem text="권한은 사용자(USER) 또는 관리자(ADMIN) 중 선택." />
          <RuleItem text="초기 비밀번호는 생성 후 계정 관리 탭에서 재설정 가능." />
        </div>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">{label}</label>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="h-[52px] w-full rounded-[16px] border border-white/10 bg-white/[0.04] px-4 text-[14px] text-white outline-none transition duration-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-white/[0.06]" />
    </div>
  );
}

function RuleItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="mt-1 h-2 w-2 rounded-full bg-sky-400/80" />
      <p className="leading-relaxed text-slate-300">{text}</p>
    </div>
  );
}

function Modal({ title, children, onClose, width = 'max-w-[520px]' }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
      <div className={`w-full ${width} rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,8,23,0.99))] p-6 shadow-[0_0_60px_rgba(2,132,199,0.12)] backdrop-blur-2xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ModalCancelButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]">{children}</button>
  );
}

function ModalConfirmButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">{children}</button>
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
    function onClickOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selectedDay = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth ? parsed.getDate() : null;
  const todayDay = today.getFullYear() === viewYear && today.getMonth() === viewMonth ? today.getDate() : null;
  const displayValue = parsed ? `${parsed.getFullYear()}. ${parsed.getMonth() + 1}. ${parsed.getDate()}.` : '';

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
              <span key={d} className={`text-[11px] font-medium pb-1 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-slate-500'}`}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const isSelected = day === selectedDay;
              const isToday = day === todayDay;
              const dow = (firstDay + day - 1) % 7;
              return (
                <button key={day} type="button"
                  onClick={() => { const mm = String(viewMonth + 1).padStart(2, '0'); const dd = String(day).padStart(2, '0'); onChange(`${viewYear}-${mm}-${dd}`); setOpen(false); }}
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-[12.5px] font-medium transition ${isSelected ? 'bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.4)]' : isToday ? 'border border-sky-500/40 text-sky-300' : dow === 0 ? 'text-rose-400 hover:bg-white/[0.06]' : dow === 6 ? 'text-sky-400 hover:bg-white/[0.06]' : 'text-slate-300 hover:bg-white/[0.06]'}`}>
                  {day}
                </button>
              );
            })}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              className="mt-3 w-full rounded-[8px] border border-white/[0.08] py-1.5 text-[12px] text-slate-500 transition hover:text-slate-300">선택 해제</button>
          )}
        </div>
      )}
    </div>
  );
}