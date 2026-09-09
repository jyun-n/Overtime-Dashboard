/// <reference types="vite/client" />

// 기관 브랜딩 오버라이드 — 빌드 시점에 주입한다(§DEMO_DEPLOY.md).
interface ImportMetaEnv {
  /** 로그인 화면 로고 경로. public/ 기준 절대경로(예: /brand/logo-cau.png). 미설정 시 광명병원 로고. */
  readonly VITE_LOGO_URL?: string;
  /** 로고 대체 텍스트로 쓰이는 기관명. 미설정 시 '중앙대학교광명병원'. */
  readonly VITE_ORG_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
