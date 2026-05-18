import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../types/auth';

const SESSION_MINUTES = 30;
const SESSION_MS = SESSION_MINUTES * 60 * 1000;

// 토큰은 HttpOnly 쿠키로 서버가 관리. 프론트는 사용자 정보와
// UI용 세션 만료 시각만 저장한다 (XSS 시 토큰 탈취 방지).
type AuthState = {
  user: AuthUser | null;
  expiresAt: number | null;
  setAuth: (user: AuthUser) => void;
  clear: () => void;
  isExpired: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      expiresAt: null,

      setAuth: (user) =>
        set({ user, expiresAt: Date.now() + SESSION_MS }),

      clear: () => set({ user: null, expiresAt: null }),

      isExpired: () => {
        const { expiresAt } = get();
        if (!expiresAt) return true;
        return Date.now() > expiresAt;
      },
    }),
    {
      name: 'overtime-auth',
      // 토큰 필드 제거 (쿠키 마이그레이션). 옛 캐시는 자동 폐기.
      version: 2,
      migrate: () => ({ user: null, expiresAt: null }),
    },
  ),
);
