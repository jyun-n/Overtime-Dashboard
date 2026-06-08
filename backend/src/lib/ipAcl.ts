import net from 'node:net';
import { prisma } from './prisma.js';

// req.ip는 IPv4-mapped IPv6(예: ::ffff:10.20.152.146)나 대소문자 섞인 IPv6로
// 들어올 수 있어 비교 전에 정규화한다. 저장도 이 정규화된 형태로 한다.
export function normalizeIp(raw: string | undefined | null): string {
  if (!raw) return '';
  let ip = raw.trim();
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) ip = mapped[1]!;
  return ip.toLowerCase();
}

// 단일 IP(IPv4/IPv6)인지 검증. CIDR·범위는 지원하지 않는다(단일 IP 정책).
export function isValidSingleIp(ip: string): boolean {
  return net.isIP(ip) !== 0;
}

// loopback은 모드와 무관하게 항상 허용 — 헬스체크·서버 내부 호출용, 자기잠금 방지.
export function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1';
}

// 활성 허용 IP를 메모리에 캐시. 매 요청 DB 조회를 피하고, 변경 시 무효화한다.
let cache: Set<string> | null = null;

export function invalidateIpAclCache(): void {
  cache = null;
}

async function getActiveIps(): Promise<Set<string>> {
  if (cache) return cache;
  const rows = await prisma.ipAcl.findMany({
    where: { isActive: true },
    select: { ip: true },
  });
  cache = new Set(rows.map((r) => r.ip));
  return cache;
}

export type IpVerdict = {
  normalized: string;
  listEmpty: boolean; // 활성 허용 IP가 하나도 없으면 게이트 "미무장"
  allowed: boolean;
};

// 허용 여부 판정. 규칙:
//   - 활성 목록이 비어 있으면 전체 허용 (첫 IP 등록 전까지 게이트는 무장되지 않음)
//   - loopback은 항상 허용
//   - 그 외에는 정규화된 IP가 활성 목록에 있어야 허용
export async function evaluateIp(rawIp: string | undefined | null): Promise<IpVerdict> {
  const normalized = normalizeIp(rawIp);
  const active = await getActiveIps();
  const listEmpty = active.size === 0;
  const allowed = listEmpty || isLoopback(normalized) || active.has(normalized);
  return { normalized, listEmpty, allowed };
}
