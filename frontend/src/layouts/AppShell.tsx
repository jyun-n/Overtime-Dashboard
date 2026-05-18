import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../lib/store';
import { api } from '../lib/api';
import type { Role } from '../types/auth';

type NavItem = { label: string; to: string; allow?: Role[] };

const NAV: NavItem[] = [
  { label: '관리', to: '/admin/users', allow: ['ADMIN'] },
  { label: '데이터 업로드', to: '/admin/uploads', allow: ['ADMIN'] },
  { label: '연장 관리 대시보드', to: '/dashboard' },
];

export default function AppShell() {
  const navigate = useNavigate();
  const { user, clear } = useAuthStore();

  if (!user) return null;

  const items = NAV.filter((i) => !i.allow || i.allow.includes(user.role));

  function logout() {
    // 서버 쿠키 제거 — 실패해도 클라이언트 상태는 정리하고 로그인 화면으로.
    api.post('/auth/logout').catch(() => {});
    clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.10),transparent_25%),linear-gradient(135deg,#030712_0%,#07111f_45%,#030712_100%)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(96,165,250,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(96,165,250,0.2)_1px,transparent_1px)] [background-size:56px_56px]" />

        {user.role === 'ADMIN' && (
          <header className="relative z-20 border-b border-white/[0.06] bg-[#030712]/60 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-5 lg:px-10">
              <div className="flex items-center gap-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/[0.16] bg-sky-400/[0.06] px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-sky-300/80 uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.7)]" />
                  Admin Console
                </div>
                <nav className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
                          isActive
                            ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]'
                            : 'text-slate-300 hover:text-white'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition duration-200 hover:border-sky-300/30 hover:bg-white/[0.07]"
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </header>
        )}

        <main className="relative z-10 mx-auto max-w-[1360px] px-5 py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}