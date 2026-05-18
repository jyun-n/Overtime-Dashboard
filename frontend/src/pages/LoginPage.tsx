import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';
import type { AuthUser } from '../types/auth';
import logo from '../assets/images/logo.png';

type LoginResponse = { user: AuthUser };

const SAVED_ID_KEY = 'overtime-saved-id';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveId, setSaveId] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_ID_KEY);
    if (saved) {
      setUsername(saved);
      setSaveId(true);
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    if (saveId) localStorage.setItem(SAVED_ID_KEY, username);
    else localStorage.removeItem(SAVED_ID_KEY);

    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
      setAuth(data.user);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 401 ? '아이디 또는 비밀번호가 올바르지 않습니다.' : '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#030712] text-white">
      <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_28%),linear-gradient(135deg,#020617_0%,#071224_42%,#030712_100%)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(96,165,250,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(96,165,250,0.22)_1px,transparent_1px)] [background-size:54px_54px]" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[560px] w-[560px] rounded-full bg-sky-500/[0.08] blur-[110px]" />
        </div>

        <div className="relative z-10 flex h-full items-center justify-center px-4">
          <div className="w-full max-w-[500px]">
            <div className="rounded-[32px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,8,23,0.96))] px-9 py-9 shadow-[0_20px_80px_rgba(2,132,199,0.10)] backdrop-blur-2xl">
              <div className="mb-8 flex flex-col items-center text-center">
                <img
                  src={logo}
                  alt="중앙대학교광명병원"
                  className="mb-6 h-12 w-auto object-contain sm:h-14"
                />

                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/[0.16] bg-sky-400/[0.06] px-3.5 py-1.5 text-[11px] font-medium tracking-[0.18em] text-sky-300/80 uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.7)]" />
                  Overtime Management
                </div>

                <h2 className="bg-gradient-to-r from-sky-200 via-blue-300 to-cyan-300 bg-clip-text text-[30px] font-semibold tracking-[-0.04em] text-transparent">
                  연장 관리 대시보드
                </h2>
              </div>

              <div className="mb-8">
                <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-white">
                  로그인
                </h1>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  등록된 계정 정보를 입력해 시스템에 접속하세요
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    사용자 ID
                  </label>
                  <div className="group relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 transition duration-200 group-focus-within:text-sky-400">
                      <User size={17} />
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setError(''); }}
                      placeholder="아이디 입력"
                      autoComplete="username"
                      className="h-[56px] w-full rounded-[16px] border border-white/[0.08] bg-white/[0.04] pl-11 pr-4 text-[15px] text-white placeholder:text-slate-600 outline-none transition duration-200 focus:border-sky-500/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_0_24px_rgba(56,189,248,0.10)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    비밀번호
                  </label>
                  <div className="group relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 transition duration-200 group-focus-within:text-sky-400">
                      <Lock size={17} />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      placeholder="비밀번호 입력"
                      autoComplete="current-password"
                      className="h-[56px] w-full rounded-[16px] border border-white/[0.08] bg-white/[0.04] pl-11 pr-12 text-[15px] text-white placeholder:text-slate-600 outline-none transition duration-200 focus:border-sky-500/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_0_24px_rgba(56,189,248,0.10)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-sky-400"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setSaveId((p) => !p)}
                    aria-pressed={saveId}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px] border transition duration-200 ${
                      saveId
                        ? 'border-sky-400/70 bg-sky-400/20 shadow-[0_0_12px_rgba(56,189,248,0.24)]'
                        : 'border-white/[0.18] bg-white/[0.03]'
                    }`}
                  >
                    {saveId && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#7dd3fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className="select-none text-[13px] text-slate-400">아이디 저장</span>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-[12px] border border-rose-500/20 bg-rose-500/[0.08] px-3.5 py-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <circle cx="12" cy="12" r="10" stroke="#f87171" strokeWidth="1.8" />
                      <path d="M12 8v4M12 16h.01" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <p className="text-[12.5px] text-rose-400">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative mt-2 flex h-[56px] w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-r from-blue-600 via-sky-500 to-blue-600 bg-[length:200%_100%] text-[15px] font-semibold text-white shadow-[0_14px_36px_rgba(37,99,235,0.28)] transition duration-300 hover:scale-[1.01] hover:shadow-[0_18px_44px_rgba(56,189,248,0.28)] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10">{loading ? '로그인 중...' : '로그인'}</span>
                </button>
              </form>
            </div>

            <div className="mt-5 text-center text-[12.5px] text-slate-500">
              ※ 계정 생성 및 비밀번호 문의 :
              <span className="ml-1.5 font-semibold text-sky-400/80">총무팀</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}