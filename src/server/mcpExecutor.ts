import crypto from 'node:crypto';
import {
  DEFAULT_POLICY,
  SandboxPolicy,
  normalizeDomainPattern,
  validateBearerAuth,
  validateTargetUrl,
} from '../lib/mcpPolicy';
import {
  extractLinksFromHtml,
  extractTitleAndDescription,
  htmlToMarkdown,
  parseDuckDuckGoHtml,
} from '../lib/htmlExtractor';
import { classifyContentType, extractFilename } from '../lib/fileDownload';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOLS,
  buildJsonRpcError,
  buildJsonRpcSuccess,
} from '../lib/mcpProtocol';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  rpcMethod: string;
  toolName: string | null;
  target: string;
  status: 'ok' | 'blocked' | 'error';
  durationMs: number;
  bytes: number;
  summary: string;
}

const envBearerToken = (process.env.MCP_BEARER_TOKEN || '').trim();
const envAllowedDomains = (process.env.MCP_ALLOWED_DOMAINS || '')
  .split(',')
  .map((d) => normalizeDomainPattern(d))
  .filter(Boolean);

let currentPolicy: SandboxPolicy = {
  ...DEFAULT_POLICY,
  mode: envAllowedDomains.length > 0 ? 'allowlist' : DEFAULT_POLICY.mode,
  domains: envAllowedDomains.length > 0 ? envAllowedDomains : DEFAULT_POLICY.domains,
  blockPrivateNetworks: process.env.MCP_BLOCK_PRIVATE_NETS !== 'false',
  requireBearerAuth: envBearerToken.length > 0 ? true : DEFAULT_POLICY.requireBearerAuth,
  bearerToken: envBearerToken.length > 0 ? envBearerToken : DEFAULT_POLICY.bearerToken,
};
const auditLogs: AuditLogEntry[] = [];
const MAX_AUDIT_LOGS = 100;

export interface StoredDownload {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  buffer: Buffer;
  sourceUrl: string;
  createdAt: number;
}

const downloadStore = new Map<string, StoredDownload>();
const MAX_DOWNLOAD_CACHE_ITEMS = 20;
const MAX_DOWNLOAD_FILE_BYTES = 10_000_000;

export function getDownloadedFile(id: string): StoredDownload | undefined {
  return downloadStore.get(id);
}

function saveDownloadedFile(item: Omit<StoredDownload, 'id' | 'createdAt'>): StoredDownload {
  const id = crypto.randomUUID();
  const record: StoredDownload = {
    id,
    createdAt: Date.now(),
    ...item,
  };
  downloadStore.set(id, record);
  while (downloadStore.size > MAX_DOWNLOAD_CACHE_ITEMS) {
    const oldestKey = downloadStore.keys().next().value;
    if (!oldestKey) break;
    downloadStore.delete(oldestKey);
  }
  return record;
}

export function getPolicy(): SandboxPolicy {
  return {
    ...currentPolicy,
    domains: [...currentPolicy.domains],
    allowHttpMethods: [...currentPolicy.allowHttpMethods],
  };
}

export function updatePolicy(patch: Partial<SandboxPolicy>): SandboxPolicy {
  const nextMode =
    patch.mode === 'allow_all' || patch.mode === 'allowlist' || patch.mode === 'blocklist'
      ? patch.mode
      : currentPolicy.mode;

  const nextDomains = Array.isArray(patch.domains)
    ? Array.from(new Set(patch.domains.map(normalizeDomainPattern).filter(Boolean)))
    : currentPolicy.domains;

  const nextMethods = Array.isArray(patch.allowHttpMethods)
    ? patch.allowHttpMethods
        .map((m) => String(m).toUpperCase())
        .filter((m) => ['GET', 'POST', 'HEAD'].includes(m))
    : currentPolicy.allowHttpMethods;

  currentPolicy = {
    mode: nextMode,
    domains: nextDomains,
    blockPrivateNetworks:
      typeof patch.blockPrivateNetworks === 'boolean'
        ? patch.blockPrivateNetworks
        : currentPolicy.blockPrivateNetworks,
    maxResponseBytes:
      typeof patch.maxResponseBytes === 'number' && patch.maxResponseBytes >= 10_000
        ? Math.min(patch.maxResponseBytes, 5_000_000)
        : currentPolicy.maxResponseBytes,
    timeoutMs:
      typeof patch.timeoutMs === 'number' && patch.timeoutMs >= 1_000
        ? Math.min(patch.timeoutMs, 30_000)
        : currentPolicy.timeoutMs,
    requireBearerAuth:
      typeof patch.requireBearerAuth === 'boolean'
        ? patch.requireBearerAuth
        : currentPolicy.requireBearerAuth,
    bearerToken:
      typeof patch.bearerToken === 'string'
        ? patch.bearerToken.trim()
        : currentPolicy.bearerToken,
    allowHttpMethods: nextMethods.length > 0 ? nextMethods : ['GET'],
  };

  return getPolicy();
}

export function getAuditLogs(): AuditLogEntry[] {
  return [...auditLogs];
}

export function clearAuditLogs(): void {
  auditLogs.length = 0;
}

function recordAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
  auditLogs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.length = MAX_AUDIT_LOGS;
  }
}

async function guardedFetch(
  rawUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    bypassAllowlistForSearch?: boolean;
  } = {}
): Promise<{
  status: number;
  ok: boolean;
  finalUrl: string;
  contentType: string;
  headers: Record<string, string>;
  text: string;
  bytes: number;
}> {
  const method = (options.method || 'GET').toUpperCase();
  const policy = getPolicy();

  const effectivePolicy = options.bypassAllowlistForSearch
    ? { ...policy, mode: 'blocklist' as const }
    : policy;

  const check = validateTargetUrl(rawUrl, effectivePolicy, method);
  if (!check.allowed) {
    throw new PolicyBlockedError(check.reason || 'URL sandbox siyosati bilan bloklandi.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);

  try {
    const response = await fetch(check.parsedUrl!.toString(), {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uz-UZ,uz;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        ...(options.headers || {}),
      },
      body: method === 'POST' && options.body ? options.body : undefined,
    });

    const finalUrl = response.url || check.parsedUrl!.toString();
    // Re-validate final redirect URL to prevent redirect-based SSRF
    const redirectCheck = validateTargetUrl(finalUrl, effectivePolicy, method);
    if (!redirectCheck.allowed) {
      throw new PolicyBlockedError(
        `Yo'naltirish (redirect) SSRF himoyasi bilan bloklandi: ${redirectCheck.reason}`
      );
    }

    const buf = await response.arrayBuffer();
    const totalBytes = buf.byteLength;
    const sliced =
      totalBytes > policy.maxResponseBytes
        ? buf.slice(0, policy.maxResponseBytes)
        : buf;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(sliced);

    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    return {
      status: response.status,
      ok: response.ok,
      finalUrl,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      headers: headersObj,
      text,
      bytes: sliced.byteLength,
    };
  } catch (err) {
    if (err instanceof PolicyBlockedError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`So'rov vaqti tugadi (${policy.timeoutMs} ms).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

class PolicyBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyBlockedError';
  }
}

type McpContentItem =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType: string; blob: string } };

async function guardedBinaryFetch(
  rawUrl: string,
  maxBytes = MAX_DOWNLOAD_FILE_BYTES
): Promise<{
  status: number;
  ok: boolean;
  finalUrl: string;
  contentType: string;
  contentDisposition: string | null;
  buffer: Buffer;
}> {
  const policy = getPolicy();
  const check = validateTargetUrl(rawUrl, policy, 'GET');
  if (!check.allowed) {
    throw new PolicyBlockedError(check.reason || 'URL sandbox siyosati bilan bloklandi.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(policy.timeoutMs, 25_000));

  try {
    const response = await fetch(check.parsedUrl!.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'uz-UZ,uz;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const finalUrl = response.url || check.parsedUrl!.toString();
    const redirectCheck = validateTargetUrl(finalUrl, policy, 'GET');
    if (!redirectCheck.allowed) {
      throw new PolicyBlockedError(
        `Yo'naltirish (redirect) SSRF himoyasi bilan bloklandi: ${redirectCheck.reason}`
      );
    }

    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new Error(
        `Fayl hajmi (${(buf.byteLength / 1_048_576).toFixed(2)} MB) ruxsat etilgan maksimal limitdan (${(
          maxBytes / 1_048_576
        ).toFixed(1)} MB) oshib ketdi.`
      );
    }

    return {
      status: response.status,
      ok: response.ok,
      finalUrl,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      contentDisposition: response.headers.get('content-disposition'),
      buffer: buf,
    };
  } catch (err) {
    if (err instanceof PolicyBlockedError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Faylni yuklab olish vaqti tugadi.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: McpContentItem[]; bytes: number; target: string; summaryText: string }> {
  if (name === 'web_fetch') {
    const url = String(args.url || '').trim();
    const maxChars = Math.min(Math.max(Number(args.max_chars) || 16_000, 500), 50_000);
    const includeLinks = Boolean(args.include_links);

    const res = await guardedFetch(url);
    const isHtml = res.contentType.toLowerCase().includes('html');

    let bodyOutput: string;
    let title = '';
    let description = '';
    let extractionMode = 'direct';

    if (isHtml) {
      const meta = extractTitleAndDescription(res.text);
      title = meta.title;
      description = meta.description;
      bodyOutput = htmlToMarkdown(res.text, maxChars, res.finalUrl);

      const looksLikeBotChallenge =
        res.status === 403 ||
        res.status === 429 ||
        res.status === 503 ||
        /just a moment\.\.\.|enable javascript and cookies|cf-browser-challenge|attention required!/i.test(
          res.text.slice(0, 8000)
        );

      const policy = getPolicy();
      const canTryReaderFallback =
        policy.mode !== 'allowlist' &&
        (looksLikeBotChallenge || bodyOutput.length < 160);

      if (canTryReaderFallback) {
        try {
          const readerUrl = `https://r.jina.ai/${res.finalUrl}`;
          const readerRes = await guardedFetch(readerUrl, {
            headers: {
              Accept: 'text/plain, text/markdown;q=0.9',
              'X-Return-Format': 'markdown',
            },
          });
          if (readerRes.ok && readerRes.text.trim().length > bodyOutput.length) {
            bodyOutput =
              readerRes.text.length > maxChars
                ? `${readerRes.text.slice(0, maxChars)}\n\n...[Qisqartirildi]`
                : readerRes.text.trim();
            extractionMode = 'rendered-fallback';
          }
        } catch {
          // Keep direct extraction if reader fallback is unavailable
        }
      }
    } else {
      bodyOutput =
        res.text.length > maxChars
          ? `${res.text.slice(0, maxChars)}\n\n...[Qisqartirildi]`
          : res.text;
    }

    const headerLines = [
      `URL: ${res.finalUrl}`,
      `HTTP Status: ${res.status}`,
      `Content-Type: ${res.contentType}`,
      `Extraction: ${extractionMode}`,
      title ? `Sarlavha: ${title}` : '',
      description ? `Tavsif: ${description}` : '',
    ].filter(Boolean);

    let output = `${headerLines.join('\n')}\n\n---\n\n${
      bodyOutput || "(Sahifadan matnli ma'lumot ajratib olinmadi)"
    }`;

    if (includeLinks && isHtml) {
      const links = extractLinksFromHtml(res.text, res.finalUrl, 20);
      if (links.length > 0) {
        output += `\n\n---\n### Ajratilgan havolalar (${links.length})\n`;
        output += links.map((l) => `- [${l.text}](${l.url})`).join('\n');
      }
    }

    return {
      content: [{ type: 'text', text: output }],
      bytes: res.bytes,
      target: url,
      summaryText: output,
    };
  }

  if (name === 'web_search') {
    const query = String(args.query || '').trim();
    if (!query) {
      throw new Error("Qidiruv so'rovi (query) bo'sh bo'lmasligi kerak.");
    }
    const maxResults = Math.min(Math.max(Number(args.max_results) || 6, 1), 12);

    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    let results: Array<{ title: string; url: string; snippet: string }> = [];
    let bytes = 0;

    try {
      const res = await guardedFetch(searchUrl, {
        bypassAllowlistForSearch: false,
      });
      bytes = res.bytes;
      results = parseDuckDuckGoHtml(res.text, maxResults);
    } catch (err) {
      if (err instanceof PolicyBlockedError) throw err;
    }

    // Fallback to Wikipedia OpenSearch API if DuckDuckGo HTML returned 0 results (e.g. bot challenge)
    if (results.length === 0) {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        query
      )}&limit=${maxResults}&namespace=0&format=json`;
      const wikiRes = await guardedFetch(wikiUrl, {
        bypassAllowlistForSearch: false,
      });
      bytes += wikiRes.bytes;
      try {
        const parsed = JSON.parse(wikiRes.text) as [string, string[], string[], string[]];
        const titles = parsed[1] || [];
        const descs = parsed[2] || [];
        const urls = parsed[3] || [];
        results = titles.map((t, i) => ({
          title: t,
          url: urls[i] || '',
          snippet: descs[i] || "Vikipediya ma'lumotnomasi",
        }));
      } catch {
        // ignore parse failure
      }
    }

    if (results.length === 0) {
      const msg = `"${query}" so'rovi bo'yicha natija topilmadi.`;
      return {
        content: [{ type: 'text', text: msg }],
        bytes,
        target: query,
        summaryText: msg,
      };
    }

    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. **${r.title}**\n   URL: ${r.url}${
            r.snippet ? `\n   ${r.snippet}` : ''
          }`
      )
      .join('\n\n');

    const msg = `Qidiruv: "${query}" (${results.length} ta natija)\n\n${formatted}`;
    return {
      content: [{ type: 'text', text: msg }],
      bytes,
      target: query,
      summaryText: msg,
    };
  }

  if (name === 'http_request') {
    const url = String(args.url || '').trim();
    const method = String(args.method || 'GET').toUpperCase();
    const rawHeaders =
      args.headers && typeof args.headers === 'object'
        ? (args.headers as Record<string, string>)
        : {};
    const body = typeof args.body === 'string' ? args.body : undefined;

    const res = await guardedFetch(url, {
      method,
      headers: rawHeaders,
      body,
    });

    let formattedBody = res.text;
    if (res.contentType.includes('json')) {
      try {
        formattedBody = JSON.stringify(JSON.parse(res.text), null, 2);
      } catch {
        // keep raw text
      }
    }

    const output = [
      `Method: ${method}`,
      `URL: ${res.finalUrl}`,
      `Status: ${res.status}`,
      `Content-Type: ${res.contentType}`,
      '',
      formattedBody,
    ].join('\n');

    return {
      content: [{ type: 'text', text: output }],
      bytes: res.bytes,
      target: `${method} ${url}`,
      summaryText: output,
    };
  }

  if (name === 'extract_links') {
    const url = String(args.url || '').trim();
    const filter = String(args.filter || 'all');
    const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);

    const res = await guardedFetch(url);
    let links = extractLinksFromHtml(res.text, res.finalUrl, limit * 2);

    if (filter === 'external') {
      links = links.filter((l) => l.external);
    } else if (filter === 'internal') {
      links = links.filter((l) => !l.external);
    }
    links = links.slice(0, limit);

    const text =
      links.length === 0
        ? `${res.finalUrl} sahifasida mos havolalar topilmadi.`
        : `Sahifa: ${res.finalUrl}\nTopilgan havolalar (${links.length}):\n\n` +
          links
            .map(
              (l, idx) =>
                `${idx + 1}. [${l.external ? 'tashqi' : 'ichki'}] ${l.text}\n   ${l.url}`
            )
            .join('\n');

    return {
      content: [{ type: 'text', text }],
      bytes: res.bytes,
      target: url,
      summaryText: text,
    };
  }

  if (name === 'check_url_health') {
    const url = String(args.url || '').trim();
    const start = Date.now();
    let res;
    try {
      res = await guardedFetch(url, { method: 'HEAD' });
      if (res.status === 405) {
        res = await guardedFetch(url, { method: 'GET' });
      }
    } catch (err) {
      throw err;
    }
    const latency = Date.now() - start;

    const payload = {
      url,
      finalUrl: res.finalUrl,
      redirected: res.finalUrl !== url,
      status: res.status,
      ok: res.ok,
      contentType: res.contentType,
      latencyMs: latency,
    };

    const jsonText = JSON.stringify(payload, null, 2);
    return {
      content: [{ type: 'text', text: jsonText }],
      bytes: res.bytes,
      target: url,
      summaryText: jsonText,
    };
  }

  if (name === 'download_file') {
    const url = String(args.url || '').trim();
    const encoding = String(args.encoding || 'auto');
    const includeBase64 = Boolean(args.include_base64);

    const res = await guardedBinaryFetch(url, MAX_DOWNLOAD_FILE_BYTES);
    if (!res.ok) {
      throw new Error(`Faylni yuklab olishda HTTP xato: ${res.status} (${res.finalUrl})`);
    }

    const filename = extractFilename(res.finalUrl, res.contentDisposition, res.contentType);
    const mimeType = res.contentType.split(';')[0].trim() || 'application/octet-stream';
    const sha256 = crypto.createHash('sha256').update(res.buffer).digest('hex');

    const stored = saveDownloadedFile({
      filename,
      contentType: mimeType,
      sizeBytes: res.buffer.byteLength,
      sha256,
      buffer: res.buffer,
      sourceUrl: res.finalUrl,
    });

    const downloadPath = `/api/downloads/${stored.id}/${encodeURIComponent(filename)}`;
    const kind = classifyContentType(mimeType);

    const metaLines = [
      `Fayl muvaffaqiyatli yuklab olindi`,
      `Fayl nomi: ${filename}`,
      `Manba URL: ${res.finalUrl}`,
      `Content-Type: ${mimeType}`,
      `Hajmi: ${res.buffer.byteLength} bayt (${(res.buffer.byteLength / 1024).toFixed(1)} KB)`,
      `SHA-256: ${sha256}`,
      `Server yuklash havolasi: ${downloadPath}`,
    ];

    const content: McpContentItem[] = [];

    if (kind === 'image' && encoding !== 'utf8' && res.buffer.byteLength <= 3_000_000) {
      content.push({ type: 'text', text: metaLines.join('\n') });
      content.push({
        type: 'image',
        data: res.buffer.toString('base64'),
        mimeType,
      });
    } else if (kind === 'text' && encoding !== 'base64') {
      const textBody = res.buffer.toString('utf8');
      const maxInline = 60_000;
      const truncated =
        textBody.length > maxInline
          ? `${textBody.slice(0, maxInline)}\n\n...[Qisqartirildi: jami ${textBody.length} belgi]`
          : textBody;
      content.push({
        type: 'text',
        text: `${metaLines.join('\n')}\n\n---\n\n${truncated}`,
      });
    } else if (res.buffer.byteLength <= 1_000_000 || includeBase64) {
      content.push({
        type: 'text',
        text: `${metaLines.join('\n')}\n\n(Binar fayl Base64 EmbeddedResource ko'rinishida ilova qilindi)`,
      });
      content.push({
        type: 'resource',
        resource: {
          uri: res.finalUrl,
          mimeType,
          blob: res.buffer.toString('base64'),
        },
      });
    } else {
      content.push({
        type: 'text',
        text: `${metaLines.join(
          '\n'
        )}\n\nEslatma: Fayl 1 MB dan katta bo'lgani uchun kontekstni to'ldirmaslik maqsadida server keshida saqlandi (${downloadPath}). Agar Base64 kerak bo'lsa, include_base64: true bilan chaqiring.`,
      });
    }

    return {
      content,
      bytes: res.buffer.byteLength,
      target: url,
      summaryText: `${filename} (${(res.buffer.byteLength / 1024).toFixed(1)} KB)`,
    };
  }

  throw new Error(`Noma'lum MCP vositasi: ${name}`);
}

export async function handleMcpJsonRpc(
  reqBody: JsonRpcRequest,
  authHeader?: string
): Promise<JsonRpcResponse | null> {
  const policy = getPolicy();
  if (!validateBearerAuth(authHeader, policy)) {
    return buildJsonRpcError(
      reqBody.id ?? null,
      -32001,
      'Unauthorized: Bearer token noto‘g‘ri yoki ko‘rsatilmagan.'
    );
  }

  const id = reqBody.id ?? null;
  const method = reqBody.method;

  // Notifications have no id and expect no response
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  }

  if (method === 'initialize') {
    const start = Date.now();
    const result = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
      instructions:
        "Ushbu MCP serveri Claude AI uchun sandbox muhitidan internetga (qidiruv, veb-sahifa o'qish, REST API) xavfsiz kirish imkonini beradi.",
    };
    recordAudit({
      rpcMethod: 'initialize',
      toolName: null,
      target: 'MCP Handshake',
      status: 'ok',
      durationMs: Date.now() - start,
      bytes: 0,
      summary: `Protocol ${MCP_PROTOCOL_VERSION}`,
    });
    return buildJsonRpcSuccess(id, result);
  }

  if (method === 'ping') {
    return buildJsonRpcSuccess(id, {});
  }

  if (method === 'tools/list') {
    const start = Date.now();
    recordAudit({
      rpcMethod: 'tools/list',
      toolName: null,
      target: `${MCP_TOOLS.length} ta vosita`,
      status: 'ok',
      durationMs: Date.now() - start,
      bytes: 0,
      summary: MCP_TOOLS.map((t) => t.name).join(', '),
    });
    return buildJsonRpcSuccess(id, { tools: MCP_TOOLS });
  }

  if (method === 'tools/call') {
    const params = (reqBody.params || {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
    };
    const toolName = String(params.name || '');
    const toolArgs = params.arguments || {};
    const start = Date.now();

    try {
      const outcome = await executeTool(toolName, toolArgs);
      const durationMs = Date.now() - start;
      recordAudit({
        rpcMethod: 'tools/call',
        toolName,
        target: outcome.target,
        status: 'ok',
        durationMs,
        bytes: outcome.bytes,
        summary: outcome.summaryText.slice(0, 120).replace(/\s+/g, ' '),
      });

      return buildJsonRpcSuccess(id, {
        content: outcome.content,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      const isBlocked = err instanceof PolicyBlockedError;
      const msg = err instanceof Error ? err.message : String(err);
      const target = String(toolArgs.url || toolArgs.query || toolName);

      recordAudit({
        rpcMethod: 'tools/call',
        toolName,
        target,
        status: isBlocked ? 'blocked' : 'error',
        durationMs,
        bytes: 0,
        summary: msg,
      });

      return buildJsonRpcSuccess(id, {
        isError: true,
        content: [
          {
            type: 'text',
            text: msg,
          },
        ],
      });
    }
  }

  return buildJsonRpcError(id, -32601, `Method not found: ${method}`);
}
