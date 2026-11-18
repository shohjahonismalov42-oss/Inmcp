import { useState, FormEvent } from 'react';
import { Play, AlertTriangle, CheckCircle2, Copy, Check } from 'lucide-react';
import { MCP_TOOLS } from '../lib/mcpProtocol';
import { SandboxPolicy } from '../lib/mcpPolicy';

interface PlaygroundViewProps {
  policy: SandboxPolicy;
  onToolExecuted: () => void;
}

interface PresetItem {
  label: string;
  tool: string;
  args: Record<string, string | number | boolean>;
}

const PRESETS: PresetItem[] = [
  {
    label: 'Example.com o‘qish',
    tool: 'web_fetch',
    args: { url: 'https://example.com', max_chars: 6000, include_links: true },
  },
  {
    label: 'MCP Qidiruv',
    tool: 'web_search',
    args: { query: 'Model Context Protocol', max_results: 5 },
  },
  {
    label: 'GitHub JSON API',
    tool: 'http_request',
    args: {
      url: 'https://api.github.com/repos/modelcontextprotocol/specification',
      method: 'GET',
    },
  },
  {
    label: 'SSRF Test (127.0.0.1)',
    tool: 'web_fetch',
    args: { url: 'http://127.0.0.1:3000/api/status', max_chars: 4000, include_links: false },
  },
];

export function PlaygroundView({ policy, onToolExecuted }: PlaygroundViewProps) {
  const [selectedTool, setSelectedTool] = useState<string>('web_fetch');
  const [url, setUrl] = useState('https://example.com');
  const [query, setQuery] = useState('Model Context Protocol');
  const [maxResults, setMaxResults] = useState(5);
  const [maxChars, setMaxChars] = useState(8000);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [httpMethod, setHttpMethod] = useState('GET');
  const [httpBody, setHttpBody] = useState('');
  const [linkFilter, setLinkFilter] = useState('all');

  const [loading, setLoading] = useState(false);
  const [resultTab, setResultTab] = useState<'rendered' | 'raw'>('rendered');
  const [copied, setCopied] = useState(false);
  const [outcome, setOutcome] = useState<{
    isError: boolean;
    text: string;
    durationMs: number;
    rawRequest: unknown;
    rawResponse: unknown;
  } | null>(null);

  const currentToolDef = MCP_TOOLS.find((t) => t.name === selectedTool) || MCP_TOOLS[0];

  function applyPreset(preset: PresetItem) {
    setSelectedTool(preset.tool);
    if (preset.args.url) setUrl(String(preset.args.url));
    if (preset.args.query) setQuery(String(preset.args.query));
    if (preset.args.max_results) setMaxResults(Number(preset.args.max_results));
    if (preset.args.max_chars) setMaxChars(Number(preset.args.max_chars));
    if (typeof preset.args.include_links === 'boolean') {
      setIncludeLinks(preset.args.include_links);
    }
    if (preset.args.method) setHttpMethod(String(preset.args.method));
  }

  function buildArguments(): Record<string, unknown> {
    if (selectedTool === 'web_search') {
      return { query: query.trim(), max_results: maxResults };
    }
    if (selectedTool === 'web_fetch') {
      return { url: url.trim(), max_chars: maxChars, include_links: includeLinks };
    }
    if (selectedTool === 'http_request') {
      return {
        url: url.trim(),
        method: httpMethod,
        ...(httpMethod === 'POST' && httpBody.trim() ? { body: httpBody } : {}),
      };
    }
    if (selectedTool === 'extract_links') {
      return { url: url.trim(), filter: linkFilter, limit: 25 };
    }
    return { url: url.trim() };
  }

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const rpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: selectedTool,
        arguments: buildArguments(),
      },
    };

    const start = performance.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (policy.requireBearerAuth && policy.bearerToken) {
        headers.Authorization = `Bearer ${policy.bearerToken}`;
      }

      const res = await fetch('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(rpcPayload),
      });
      const json = await res.json();
      const durationMs = Math.round(performance.now() - start);

      const contentText =
        json?.result?.content?.[0]?.text ||
        json?.error?.message ||
        JSON.stringify(json, null, 2);
      const isError = Boolean(json?.result?.isError || json?.error);

      setOutcome({
        isError,
        text: contentText,
        durationMs,
        rawRequest: rpcPayload,
        rawResponse: json,
      });
      onToolExecuted();
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : String(err);
      setOutcome({
        isError: true,
        text: `Tarmoq xatosi: ${msg}`,
        durationMs,
        rawRequest: rpcPayload,
        rawResponse: { error: msg },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!outcome) return;
    try {
      const content =
        resultTab === 'rendered'
          ? outcome.text
          : JSON.stringify(outcome.rawResponse, null, 2);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              Jonli MCP Sinov Maydoni
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              So‘rovlar to‘g‘ridan-to‘g‘ri{' '}
              <code className="font-mono text-slate-700">POST /mcp</code> endpointiga JSON-RPC 2.0
              orqali yuboriladi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tool selector tabs */}
        <div
          role="tablist"
          aria-label="MCP vositasini tanlash"
          className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-4"
        >
          {MCP_TOOLS.map((t) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={selectedTool === t.name}
              onClick={() => setSelectedTool(t.name)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedTool === t.name
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="font-mono">{t.name}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleRun} className="space-y-4 border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-600">{currentToolDef.description}</div>

          {selectedTool === 'web_search' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3">
                <label
                  htmlFor="mcp-search-query"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Qidiruv so‘rovi (query)
                </label>
                <input
                  id="mcp-search-query"
                  type="text"
                  required
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Masalan: Anthropic Model Context Protocol"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="mcp-max-results"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Natijalar soni
                </label>
                <input
                  id="mcp-max-results"
                  type="number"
                  min={1}
                  max={12}
                  value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={selectedTool === 'http_request' ? 'md:col-span-3' : 'md:col-span-4'}>
                <label
                  htmlFor="mcp-target-url"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nishon URL manzili
                </label>
                <input
                  id="mcp-target-url"
                  type="text"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {selectedTool === 'http_request' && (
                <div>
                  <label
                    htmlFor="mcp-http-method"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    HTTP Metodi
                  </label>
                  <select
                    id="mcp-http-method"
                    value={httpMethod}
                    onChange={(e) => setHttpMethod(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {selectedTool === 'web_fetch' && (
            <div className="flex flex-wrap items-center gap-6">
              <div className="w-40">
                <label
                  htmlFor="mcp-max-chars"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Maksimal belgilar
                </label>
                <input
                  id="mcp-max-chars"
                  type="number"
                  min={500}
                  max={40000}
                  step={500}
                  value={maxChars}
                  onChange={(e) => setMaxChars(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLinks}
                  onChange={(e) => setIncludeLinks(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Sahifadagi havolalarni ham qo‘shish</span>
              </label>
            </div>
          )}

          {selectedTool === 'extract_links' && (
            <div className="w-48">
              <label
                htmlFor="mcp-link-filter"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Havolalar filtri
              </label>
              <select
                id="mcp-link-filter"
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="all">Barchasi</option>
                <option value="external">Faqat tashqi havolalar</option>
                <option value="internal">Faqat ichki havolalar</option>
              </select>
            </div>
          )}

          {selectedTool === 'http_request' && httpMethod === 'POST' && (
            <div>
              <label
                htmlFor="mcp-http-body"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                POST Body (JSON yoki matn)
              </label>
              <textarea
                id="mcp-http-body"
                rows={3}
                value={httpBody}
                onChange={(e) => setHttpBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>{loading ? 'Bajarilmoqda...' : 'Ishga tushirish'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Output Inspector */}
      {loading && (
        <section
          aria-live="polite"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
        >
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
        </section>
      )}

      {!loading && outcome && (
        <section
          aria-live="polite"
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              {outcome.isError ? (
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
              )}
              <span
                className={`text-sm font-semibold ${
                  outcome.isError ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {outcome.isError ? 'Bloklandi yoki xatolik' : 'Muvaffaqiyatli bajarildi'}
              </span>
              <span className="text-xs text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-xs tabular-nums text-slate-600">
                {outcome.durationMs} ms
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setResultTab('rendered')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                    resultTab === 'rendered'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Natija (Matn)
                </button>
                <button
                  type="button"
                  onClick={() => setResultTab('raw')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                    resultTab === 'raw'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  JSON-RPC 2.0
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {copied ? (
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

          <pre className="p-6 max-h-[480px] overflow-auto bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
            {resultTab === 'rendered'
              ? outcome.text
              : JSON.stringify(
                  { request: outcome.rawRequest, response: outcome.rawResponse },
                  null,
                  2
                )}
          </pre>
        </section>
      )}
    </div>
  );
}
