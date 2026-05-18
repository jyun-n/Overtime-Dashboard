import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
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
};
