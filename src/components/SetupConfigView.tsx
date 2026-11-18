import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Code2,
  ArrowRight,
  Shield,
  Globe,
  Cpu,
} from 'lucide-react';
import {
  ClientConfigType,
  MCP_TOOLS,
  generateClientConfig,
  generateStandaloneMcpScript,
} from '../lib/mcpProtocol';
import { SandboxPolicy } from '../lib/mcpPolicy';

interface SetupConfigViewProps {
  originUrl: string;
  policy: SandboxPolicy;
  onUpdateAuth: (requireAuth: boolean, token: string) => Promise<void>;
  onGoToPlayground: () => void;
}

const CLIENT_TABS: Array<{ id: ClientConfigType; label: string }> = [
  { id: 'claude_code', label: 'Claude Code CLI' },
  { id: 'claude_desktop', label: 'Claude Desktop' },
  { id: 'sandbox_bridge', label: 'Sandbox Bridge JSON' },
];

export function SetupConfigView({
  originUrl,
  policy,
  onUpdateAuth,
  onGoToPlayground,
}: SetupConfigViewProps) {
  const [clientTab, setClientTab] = useState<ClientConfigType>('claude_code');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showScriptPreview, setShowScriptPreview] = useState(false);
  const [tokenInput, setTokenInput] = useState(policy.bearerToken || 'mcp_sandbox_dev_token');
  const [savingAuth, setSavingAuth] = useState(false);

  const endpointUrl = `${originUrl}/mcp`;
  const sseUrl = `${originUrl}/sse`;

  const generated = generateClientConfig(clientTab, {
    endpointUrl,
    sseUrl,
    requireAuth: policy.requireBearerAuth,
    bearerToken: policy.bearerToken,
  });

  const standaloneScript = generateStandaloneMcpScript({
    timeoutMs: policy.timeoutMs,
    maxResponseBytes: policy.maxResponseBytes,
    blockPrivateNetworks: policy.blockPrivateNetworks,
  });

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleToggleAuth() {
    setSavingAuth(true);
    try {
      await onUpdateAuth(!policy.requireBearerAuth, tokenInput);
    } finally {
      setSavingAuth(false);
    }
  }

  async function handleSaveToken() {
    setSavingAuth(true);
    try {
      await onUpdateAuth(policy.requireBearerAuth, tokenInput);
    } finally {
      setSavingAuth(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero / Architecture Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-slate-500">
              Model Context Protocol · Streamable HTTP &amp; Stdio Shlyuzi
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Claude AI uchun Sandbox ichidan internetga xavfsiz chiqish
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Claude Code, Claude Desktop yoki izolyatsiya qilingan sandbox muhiti to‘g‘ridan-to‘g‘ri
              tarmoqqa chiqa olmaganda, ushbu MCP server vositachi (bridge) vazifasini bajaradi.
              Siz ushbu jonli HTTP/SSE endpointni ulashingiz yoki mustaqil{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                mcp-web-bridge.mjs
              </code>{' '}
              serverini yuklab olib ishlatishingiz mumkin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href="/api/download/mcp-web-bridge.mjs"
              download="mcp-web-bridge.mjs"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>mcp-web-bridge.mjs yuklash</span>
            </a>
            <button
              type="button"
              onClick={onGoToPlayground}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <span>Jonli sinovdan o‘tkazish</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Mechanism-to-Outcome 3-step chain */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Cpu className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">1. Claude (Sandbox ichida)</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Agent <code className="font-mono">tools/call</code> JSON-RPC so‘rovini MCP
                klienti orqali yuboradi.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">2. SSRF va Domen Nazorati</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Lokal IP (<code className="font-mono">127.0.0.1</code>,{' '}
                <code className="font-mono">169.254.*</code>) bloklanadi va allowlist/blocklist
                tekshiriladi.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Globe className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">3. Toza Markdown Natija</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                HTML skriptlardan tozalanib, Claude konteksti uchun ixcham Markdown ko‘rinishida
                qaytariladi.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Endpoint & Auth Quick Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Jonli MCP Endpoint Manzillari
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Streamable HTTP (tavsiya etiladi) va eski SSE transportlari bir vaqtda ishlaydi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAuth}
              disabled={savingAuth}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 ${
                policy.requireBearerAuth
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Bearer Auth: {policy.requireBearerAuth ? 'Yoqilgan' : "O'chirilgan"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-500">
                Streamable HTTP Endpoint
              </span>
              <code className="block font-mono text-xs text-slate-900 truncate mt-0.5">
                {endpointUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyText('http', endpointUrl)}
              aria-label="Streamable HTTP manzilini nusxalash"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              {copiedKey === 'http' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Nusxalandi</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Nusxalash</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-500">
                SSE Fallback Endpoint
              </span>
              <code className="block font-mono text-xs text-slate-900 truncate mt-0.5">
                {sseUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyText('sse', sseUrl)}
              aria-label="SSE manzilini nusxalash"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              {copiedKey === 'sse' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Nusxalandi</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Nusxalash</span>
                </>
              )}
            </button>
          </div>
        </div>

        {policy.requireBearerAuth && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2 border-t border-slate-200">
            <div className="flex-1">
              <label
                htmlFor="quick-bearer-token"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Maxfiy Bearer Token (Claude klient sarlavhasiga qo‘shiladi)
              </label>
              <input
                id="quick-bearer-token"
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveToken}
              disabled={savingAuth}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Tokenni yangilash
            </button>
          </div>
        )}
      </section>

      {/* Client Configuration Generator */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Claude Klient Konfiguratsiyasi
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{generated.note}</p>
          </div>

          <div
            role="tablist"
            aria-label="Klient turini tanlash"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start"
          >
            {CLIENT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={clientTab === tab.id}
                onClick={() => setClientTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  clientTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900 text-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
            <span className="font-mono text-xs text-slate-300">{generated.filename}</span>
            <button
              type="button"
              onClick={() => copyText('config', generated.content)}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              {copiedKey === 'config' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Nusxalandi</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Kodni nusxalash</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-slate-100">
            <code>{generated.content}</code>
          </pre>
        </div>
      </section>

      {/* Exposed MCP Tools Catalog + Standalone Script Preview */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              MCP Server Vositalari ({MCP_TOOLS.length} ta)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Claude AI ushbu vositalarni avtomatik aniqlaydi va internetdan ma&apos;lumot olishda
              ishlatadi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowScriptPreview((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {showScriptPreview
                ? 'Stdio skript kodini yashirish'
                : "Mustaqil stdio skript kodini ko'rish"}
            </span>
          </button>
        </div>

        <div className="divide-y divide-slate-200 border-t border-slate-200">
          {MCP_TOOLS.map((tool) => (
            <div
              key={tool.name}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2.5">
                  <code className="font-mono text-xs font-semibold text-blue-700">
                    {tool.name}
                  </code>
                  <span className="text-xs text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-sm font-medium text-slate-900">{tool.title}</span>
                </div>
                <p className="text-xs text-slate-600">{tool.description}</p>
              </div>
              <span className="font-mono text-xs text-slate-500 whitespace-nowrap shrink-0">
                Majburiy: {(tool.inputSchema.required || []).join(', ')}
              </span>
            </div>
          ))}
        </div>

        {showScriptPreview && (
          <div className="rounded-lg bg-slate-900 text-slate-100 overflow-hidden mt-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
              <span className="font-mono text-xs text-slate-300">
                mcp-web-bridge.mjs (Node 18+ · Zero Dependencies)
              </span>
              <button
                type="button"
                onClick={() => copyText('script', standaloneScript)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                {copiedKey === 'script' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Nusxalandi</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Skriptni nusxalash</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 max-h-80 overflow-auto font-mono text-xs leading-relaxed text-slate-200">
              <code>{standaloneScript}</code>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
