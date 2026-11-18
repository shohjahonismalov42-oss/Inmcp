export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const MCP_SERVER_NAME = 'mcp-web-bridge';
export const MCP_SERVER_VERSION = '1.0.0';

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'web_search',
    title: 'Internetdan qidirish',
    description:
      "Sandbox ichidan turib internet bo'ylab jonli qidiruv amalga oshiradi va sarlavha, URL hamda qisqa tavsiflarni qaytaradi.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Qidiruv so'rovi (masalan: Anthropic MCP protocol specification).",
        },
        max_results: {
          type: 'number',
          description: 'Qaytariladigan natijalar soni (1 dan 12 gacha, standart 6).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    title: 'Veb-sahifani o‘qish (Markdown)',
    description:
      "Berilgan URL manzildagi veb-sahifani yuklab oladi, skript va stillarni tozalab, Claude o'qishi uchun qulay Markdown matniga aylantiradi.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Yuklab olinadigan sahifaning to‘liq http:// yoki https:// manzili.',
        },
        max_chars: {
          type: 'number',
          description: 'Maksimal belgilar soni (standart 12000).',
        },
        include_links: {
          type: 'boolean',
          description: 'Sahifadagi asosiy havolalar ro‘yxatini qo‘shish.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_request',
    title: 'REST / JSON API so‘rovi',
    description:
      "Sandbox ichidan tashqi REST yoki GraphQL API'larga xavfsiz HTTP so'rov (GET, POST, HEAD) yuboradi.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'API endpoint URL manzili.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'HEAD'],
          description: 'HTTP metodi (standart GET).',
        },
        headers: {
          type: 'object',
          description: 'Qo‘shimcha HTTP sarlavhalar (key-value JSON obyekti).',
        },
        body: {
          type: 'string',
          description: 'POST so‘rovi uchun JSON yoki matn ko‘rinishidagi tana.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_links',
    title: 'Havolalarni ajratib olish',
    description:
      'Veb-sahifa ichidagi barcha tashqi va ichki havolalarni matni bilan birga strukturalangan ro‘yxat sifatida qaytaradi.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Tekshiriladigan sahifa URL manzili.',
        },
        filter: {
          type: 'string',
          enum: ['all', 'external', 'internal'],
          description: 'Havolalar filtri (standart all).',
        },
        limit: {
          type: 'number',
          description: 'Maksimal havolalar soni (standart 25).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'check_url_health',
    title: 'URL holatini tekshirish',
    description:
      "URL manzilning mavjudligini, HTTP status kodini, yo'naltirishlarni (redirect) va Content-Type turini tez tekshiradi.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Tekshiriladigan URL manzili.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'download_file',
    title: 'Fayl yuklab olish (PDF, JSON, Rasm, ZIP)',
    description:
      "Berilgan URL manzildan har qanday faylni (matn, JSON, CSV, rasm, PDF, arxiv) xavfsiz yuklab oladi. Matnli fayllarni to'liq matn sifatida, rasmlarni MCP image ko'rinishida, binar fayllarni esa Base64/resource va yuklab olish havolasi bilan qaytaradi.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Yuklab olinadigan faylning to‘liq http:// yoki https:// manzili.',
        },
        encoding: {
          type: 'string',
          enum: ['auto', 'utf8', 'base64'],
          description: 'Qaytarish formati (standart auto).',
        },
        include_base64: {
          type: 'boolean',
          description: 'Katta binar fayllar uchun ham Base64 maʼlumotini qo‘shish.',
        },
        save_path: {
          type: 'string',
          description:
            'Lokal stdio rejimida faylni saqlash yo‘li (masalan: ./downloads/file.pdf). Remote serverda ixtiyoriy.',
        },
      },
      required: ['url'],
    },
  },
];

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export function buildJsonRpcSuccess(
  id: string | number | null,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function buildJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: data !== undefined ? { code, message, data } : { code, message },
  };
}

export type ClientConfigType = 'claude_code' | 'claude_desktop' | 'sandbox_bridge';

export interface ClientConfigOptions {
  endpointUrl: string;
  sseUrl: string;
  bearerToken?: string;
  requireAuth?: boolean;
}

export function generateClientConfig(
  clientType: ClientConfigType,
  options: ClientConfigOptions
): { filename: string; language: 'json' | 'bash'; content: string; note: string } {
  const { endpointUrl, sseUrl, bearerToken, requireAuth } = options;
  const authHeader = requireAuth && bearerToken ? `Authorization: Bearer ${bearerToken}` : '';

  if (clientType === 'claude_code') {
    const authFlag = authHeader ? ` \\\n  --header "${authHeader}"` : '';
    return {
      filename: 'Terminal (Claude Code CLI)',
      language: 'bash',
      content: `# 1. Streamable HTTP transport orqali to'g'ridan-to'g'ri ulash:\nclaude mcp add --transport http web-bridge "${endpointUrl}"${authFlag}\n\n# 2. Yoki loyiha ildiziga .mcp.json sifatida saqlash:\ncat <<'EOF' > .mcp.json\n${JSON.stringify(
        {
          mcpServers: {
            'web-bridge': {
              type: 'http',
              url: endpointUrl,
              ...(authHeader
                ? { headers: { Authorization: `Bearer ${bearerToken}` } }
                : {}),
            },
          },
        },
        null,
        2
      )}\nEOF`,
      note: "Claude Code sandbox ichidan tashqi MCP serverga HTTP orqali bog'lanadi.",
    };
  }

  if (clientType === 'claude_desktop') {
    const args = ['-y', 'mcp-remote', endpointUrl];
    if (authHeader) {
      args.push('--header', authHeader);
    }

    return {
      filename: 'claude_desktop_config.json',
      language: 'json',
      content: JSON.stringify(
        {
          mcpServers: {
            'web-bridge-remote': {
              command: 'npx',
              args,
            },
            'web-bridge-local-stdio': {
              command: 'node',
              args: ['/path/to/mcp-web-bridge.mjs'],
              env: {
                MCP_BLOCK_PRIVATE_NETS: 'true',
                MCP_TIMEOUT_MS: '12000',
              },
            },
          },
        },
        null,
        2
      ),
      note: "Remote ulanish uchun 'web-bridge-remote', lokal offline-to-web stdio uchun 'web-bridge-local-stdio' bandidan foydalaning.",
    };
  }

  // sandbox_bridge
  const bridgeConfig = {
    mcpServers: {
      'sandbox-internet-gateway': {
        transport: 'streamable-http',
        url: endpointUrl,
        sseFallbackUrl: sseUrl,
        ...(authHeader ? { headers: { Authorization: `Bearer ${bearerToken}` } } : {}),
        tools: ['web_search', 'web_fetch', 'http_request', 'extract_links', 'check_url_health', 'download_file'],
      },
    },
  };

  return {
    filename: 'mcp-gateway-client.json',
    language: 'json',
    content: JSON.stringify(bridgeConfig, null, 2),
    note: "Konteyner yoki cheklangan sandbox muhitlarida Claude agentiga faqat ushbu MCP shlyuzi orqali internetga chiqish ruxsati beriladi.",
  };
}

export function generateStandaloneMcpScript(options: {
  timeoutMs: number;
  maxResponseBytes: number;
  blockPrivateNetworks: boolean;
}): string {
  return `#!/usr/bin/env node
/**
 * MCP Web Bridge — Standalone Zero-Dependency Stdio MCP Server
 * Node.js 18+ da hech qanday npm paketisiz to'g'ridan-to'g'ri ishlaydi.
 * Ishga tushirish: node mcp-web-bridge.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL_VERSION = '${MCP_PROTOCOL_VERSION}';
const TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS || ${options.timeoutMs});
const MAX_BYTES = Number(process.env.MCP_MAX_BYTES || ${options.maxResponseBytes});
const BLOCK_PRIVATE = (process.env.MCP_BLOCK_PRIVATE_NETS ?? '${options.blockPrivateNetworks}') === 'true';

const TOOLS = ${JSON.stringify(MCP_TOOLS, null, 2)};

function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\\[|\\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h === '::') return true;
  if (/^(127\\.|10\\.|192\\.168\\.|169\\.254\\.|0\\.)/.test(h)) return true;
  const m172 = h.match(/^172\\.(\\d+)\\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  return false;
}

function validateUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Faqat http/https ruxsat etiladi');
  }
  if (BLOCK_PRIVATE && isPrivateHost(u.hostname)) {
    throw new Error('SSRF himoyasi: lokal/ichki tarmoq manzili bloklandi: ' + u.hostname);
  }
  return u;
}

function htmlToMarkdown(html, maxChars = 16000) {
  let t = html
    .replace(/<head[\\s\\S]*?<\\/head>/gi, '')
    .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, '')
    .replace(/<svg[\\s\\S]*?<\\/svg>/gi, '')
    .replace(/<nav\\b[^>]*>[\\s\\S]*?<\\/nav>/gi, '')
    .replace(/<footer\\b[^>]*>[\\s\\S]*?<\\/footer>/gi, '')
    .replace(/<aside\\b[^>]*>[\\s\\S]*?<\\/aside>/gi, '');
  const mainMatch = t.match(/<main\\b[^>]*>([\\s\\S]*?)<\\/main>/i);
  if (mainMatch && mainMatch[1].replace(/<[^>]+>/g, '').trim().length >= 200) {
    t = mainMatch[1];
  }
  t = t
    .replace(/<h([1-6])[^>]*>([\\s\\S]*?)<\\/h\\1>/gi, (_, l, c) => '\\n\\n' + '#'.repeat(Number(l)) + ' ' + c.replace(/<[^>]+>/g, ' ').trim() + '\\n\\n')
    .replace(/<a\\s+[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi, (_, href, txt) => '[' + txt.replace(/<[^>]+>/g, '').trim() + '](' + href + ')')
    .replace(/<li[^>]*>([\\s\\S]*?)<\\/li>/gi, (_, c) => '\\n- ' + c.replace(/<[^>]+>/g, ' ').trim())
    .replace(/<br\\s*\\/?>/gi, '\\n')
    .replace(/<\\/(p|div|section|article|tr)>/gi, '\\n\\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/[ \\t]+/g, ' ')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
  return t.length > maxChars ? t.slice(0, maxChars) + '\\n\\n...[Qisqartirildi]' : t;
}

async function fetchWithGuard(url, init = {}) {
  validateUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'uz-UZ,uz;q=0.9,en-US;q=0.8,en;q=0.7',
        ...(init.headers || {}),
      },
    });
    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    const text = new TextDecoder().decode(sliced);
    return { status: res.status, finalUrl: res.url, contentType: res.headers.get('content-type') || '', text };
  } finally {
    clearTimeout(timer);
  }
}

async function handleToolCall(name, args = {}) {
  if (name === 'web_fetch') {
    const res = await fetchWithGuard(String(args.url || ''));
    const md = res.contentType.includes('html') ? htmlToMarkdown(res.text, Number(args.max_chars || 12000)) : res.text.slice(0, Number(args.max_chars || 12000));
    return { content: [{ type: 'text', text: \`URL: \${res.finalUrl}\\nStatus: \${res.status}\\n\\n\${md}\` }] };
  }
  if (name === 'web_search') {
    const q = encodeURIComponent(String(args.query || ''));
    const res = await fetchWithGuard('https://html.duckduckgo.com/html/?q=' + q);
    const items = [];
    const re = /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
    let m;
    while ((m = re.exec(res.text)) !== null && items.length < Number(args.max_results || 6)) {
      let u = m[1];
      if (u.includes('uddg=')) {
        try { u = new URL(u.startsWith('//') ? 'https:' + u : u).searchParams.get('uddg') || u; } catch {}
      }
      items.push({ title: m[2].replace(/<[^>]+>/g, '').trim(), url: u });
    }
    return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
  }
  if (name === 'http_request') {
    const method = String(args.method || 'GET').toUpperCase();
    const res = await fetchWithGuard(String(args.url || ''), {
      method,
      headers: args.headers || {},
      body: method === 'POST' && args.body ? String(args.body) : undefined,
    });
    return { content: [{ type: 'text', text: \`Status: \${res.status}\\nContent-Type: \${res.contentType}\\n\\n\${res.text}\` }] };
  }
  if (name === 'check_url_health') {
    const res = await fetchWithGuard(String(args.url || ''), { method: 'HEAD' });
    return { content: [{ type: 'text', text: JSON.stringify({ status: res.status, finalUrl: res.finalUrl, contentType: res.contentType }, null, 2) }] };
  }
  if (name === 'extract_links') {
    const res = await fetchWithGuard(String(args.url || ''));
    const links = [];
    const re = /<a\\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
    let m;
    while ((m = re.exec(res.text)) !== null && links.length < Number(args.limit || 25)) {
      try {
        const resolved = new URL(m[1], res.finalUrl).toString();
        links.push({ text: m[2].replace(/<[^>]+>/g, '').trim() || resolved, url: resolved });
      } catch {}
    }
    return { content: [{ type: 'text', text: JSON.stringify(links, null, 2) }] };
  }
  if (name === 'download_file') {
    const rawUrl = String(args.url || '');
    validateUrl(rawUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(rawUrl, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) throw new Error('Yuklab olishda HTTP xato: ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 10_000_000) throw new Error('Fayl hajmi 10 MB limitidan oshib ketdi');
      const ct = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
      const fileName = decodeURIComponent((new URL(res.url).pathname.split('/').pop() || 'downloaded_file'));
      let savedNote = '';
      if (args.save_path) {
        const dest = path.resolve(String(args.save_path));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        savedNote = '\\nSaqlandi: ' + dest;
      }
      const isText = ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || ct.includes('javascript');
      const isImg = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(ct);
      if (isImg && args.encoding !== 'utf8') {
        return {
          content: [
            { type: 'text', text: 'Fayl: ' + fileName + ' (' + buf.byteLength + ' bayt, ' + ct + ')' + savedNote },
            { type: 'image', data: buf.toString('base64'), mimeType: ct },
          ],
        };
      }
      if (isText && args.encoding !== 'base64') {
        return {
          content: [{ type: 'text', text: 'Fayl: ' + fileName + ' (' + buf.byteLength + ' bayt, ' + ct + ')' + savedNote + '\\n\\n' + buf.toString('utf8').slice(0, 80000) }],
        };
      }
      return {
        content: [
          { type: 'text', text: 'Fayl: ' + fileName + ' (' + buf.byteLength + ' bayt, ' + ct + ')' + savedNote },
          { type: 'resource', resource: { uri: res.url, mimeType: ct, blob: buf.toString('base64') } },
        ],
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Noma\\'lum vosita: ' + name);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const id = req.id ?? null;
  try {
    if (req.method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: '${MCP_SERVER_NAME}', version: '${MCP_SERVER_VERSION}' } } });
    }
    if (req.method === 'notifications/initialized') return;
    if (req.method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (req.method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (req.method === 'tools/call') {
      const result = await handleToolCall(req.params?.name, req.params?.arguments);
      return send({ jsonrpc: '2.0', id, result });
    }
    if (id !== null) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + req.method } });
  } catch (err) {
    if (id !== null) send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(err?.message || err) }] } });
  }
});
`;
}
