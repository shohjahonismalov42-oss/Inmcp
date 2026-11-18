export type PolicyMode = 'allow_all' | 'allowlist' | 'blocklist';

export interface SandboxPolicy {
  mode: PolicyMode;
  domains: string[];
  blockPrivateNetworks: boolean;
  maxResponseBytes: number;
  timeoutMs: number;
  requireBearerAuth: boolean;
  bearerToken: string;
  allowHttpMethods: string[];
}

export const DEFAULT_POLICY: SandboxPolicy = {
  mode: 'blocklist',
  domains: [],
  blockPrivateNetworks: true,
  maxResponseBytes: 2_000_000,
  timeoutMs: 15_000,
  requireBearerAuth: false,
  bearerToken: 'mcp_sandbox_dev_token',
  allowHttpMethods: ['GET', 'POST', 'HEAD'],
};

export interface UrlValidationResult {
  allowed: boolean;
  reason?: string;
  parsedUrl?: URL;
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

export function isPrivateOrLocalHost(rawHostname: string): boolean {
  const hostname = stripIpv6Brackets(rawHostname.trim().toLowerCase());
  if (!hostname) return true;

  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return true;
  }

  // IPv6 loopback, link-local, unique-local, unspecified
  if (
    hostname === '::1' ||
    hostname === '::' ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('::ffff:127.') ||
    hostname.startsWith('::ffff:10.') ||
    hostname.startsWith('::ffff:192.168.') ||
    hostname.startsWith('::ffff:169.254.')
  ) {
    return true;
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    const [a, b] = ipv4;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local & cloud metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

export function normalizeDomainPattern(pattern: string): string {
  return pattern
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export function domainMatches(hostname: string, rawPattern: string): boolean {
  const host = stripIpv6Brackets(hostname.trim().toLowerCase());
  const pattern = normalizeDomainPattern(rawPattern);
  if (!pattern) return false;

  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }

  return host === pattern || host.endsWith(`.${pattern}`);
}

export function validateTargetUrl(
  rawUrl: string,
  policy: SandboxPolicy,
  method = 'GET'
): UrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { allowed: false, reason: "URL bo'sh bo'lishi mumkin emas." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { allowed: false, reason: "Noto'g'ri URL formati (https:// bilan kiriting)." };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      allowed: false,
      reason: `Ruxsat etilmagan protokol: ${parsed.protocol}. Faqat http:// va https:// qo'llab-quvvatlanadi.`,
    };
  }

  const upperMethod = method.toUpperCase();
  if (policy.allowHttpMethods.length > 0 && !policy.allowHttpMethods.includes(upperMethod)) {
    return {
      allowed: false,
      reason: `HTTP metodi (${upperMethod}) joriy sandbox siyosatida taqiqlangan.`,
    };
  }

  if (policy.blockPrivateNetworks && isPrivateOrLocalHost(parsed.hostname)) {
    return {
      allowed: false,
      reason: `SSRF himoyasi: ichki/lokal manzil (${parsed.hostname}) sandbox siyosati bilan bloklandi.`,
    };
  }

  const cleanDomains = policy.domains.map(normalizeDomainPattern).filter(Boolean);

  if (policy.mode === 'allowlist') {
    if (cleanDomains.length === 0) {
      return {
        allowed: false,
        reason: "Allowlist rejimida kamida bitta ruxsat etilgan domen ko'rsatilishi kerak.",
      };
    }
    const isMatched = cleanDomains.some((pattern) => domainMatches(parsed.hostname, pattern));
    if (!isMatched) {
      return {
        allowed: false,
        reason: `Domen (${parsed.hostname}) ruxsat etilgan domenlar ro'yxatida (allowlist) yo'q.`,
      };
    }
  } else if (policy.mode === 'blocklist') {
    const isBlocked = cleanDomains.some((pattern) => domainMatches(parsed.hostname, pattern));
    if (isBlocked) {
      return {
        allowed: false,
        reason: `Domen (${parsed.hostname}) taqiqlangan domenlar ro'yxatida (blocklist).`,
      };
    }
  }

  return { allowed: true, parsedUrl: parsed };
}

export function validateBearerAuth(
  authHeader: string | undefined,
  policy: SandboxPolicy
): boolean {
  if (!policy.requireBearerAuth) return true;
  if (!policy.bearerToken.trim()) return false;
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1].trim() === policy.bearerToken.trim();
}
