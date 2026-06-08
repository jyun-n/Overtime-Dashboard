import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// IP ACL 적용 강도. 잘못된 값은 안전하게 'off'로 처리.
//   off     — 미적용 (검사 안 함)
//   audit   — 차단하지 않고 위반만 로그로 기록 (실측/관찰용)
//   enforce — 등록된 IP가 아니면 로그인/요청 차단
// enforce여도: 목록이 비어 있으면 전체 허용, loopback은 항상 허용 (자기잠금 방지).
// 이 값을 'off'로 바꾸면 잠겼을 때 서버에서 푸는 비상탈출(break-glass)이 된다.
function parseIpAclMode(v: string): 'off' | 'audit' | 'enforce' {
  return v === 'audit' || v === 'enforce' ? v : 'off';
}

// trust proxy: 'loopback' | 'true' | 'false' | hop 수(숫자) | CIDR
// 기본 'loopback' — 로컬 프록시만 신뢰. 운영 환경에서 프록시 hop이 정해져 있다면 그 수로 지정.
function parseTrustProxy(v: string): boolean | number | string {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(optional('PORT', '4001')),
  host: optional('HOST', '0.0.0.0'),
  nodeEnv: optional('NODE_ENV', 'development'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
  maxUploadSizeMb: Number(optional('MAX_UPLOAD_SIZE_MB', '20')),
  withdrawPassword: required('WITHDRAW_PASSWORD'),
  logLevel: optional('LOG_LEVEL', 'info'),
  logDir: optional('LOG_DIR', './logs'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5174'),
  trustProxy: parseTrustProxy(optional('TRUST_PROXY', 'loopback')),
  ipAclMode: parseIpAclMode(optional('IP_ACL_MODE', 'off')),
};
