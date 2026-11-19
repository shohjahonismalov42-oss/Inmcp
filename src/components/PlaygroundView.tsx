import { useState, FormEvent, ChangeEvent } from 'react';
import {
  Play,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Volume2,
} from 'lucide-react';
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
    label: 'JSON Fayl Yuklash',
    tool: 'download_file',
    args: {
      url: 'https://api.github.com/repos/modelcontextprotocol/servers',
      encoding: 'auto',
    },
  },
  {
    label: 'Gemini TTS (Ovoz)',
    tool: 'tts_generate',
    args: {
      text: 'Assalomu alaykum! MCP Web Bridge serveri Gemini ovoz tizimi bilan muvaffaqiyatli ishlayapti.',
      voice_name: 'Kore',
      expressive: false,
    },
  },
  {
    label: 'SQLite Bazaga Saqlash',
    tool: 'db_save',
    args: {
      collection: 'research',
      title: 'MCP Bridge Sinovi',
      data: 'Claude sandbox ichidan SQLite bazaga yozuv saqladi.',
      tags: 'mcp,sqlite',
    },
  },
  {
    label: 'Multi-AI (Auto)',
    tool: 'ai_delegate',
    args: {
      task: 'O‘zbekistonda sunʼiy intellekt rivojlanishi haqida 3 bandlik qisqa tahlil yozing.',
      difficulty: 'auto',
      provider: 'auto',
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
  // Web tools state
  const [url, setUrl] = useState('https://example.com');
  const [query, setQuery] = useState('Model Context Protocol');
  const [maxResults, setMaxResults] = useState(5);
  const [maxChars, setMaxChars] = useState(8000);
  const [includeLinks, setIncludeLinks] = useState(true);
  const [httpMethod, setHttpMethod] = useState('GET');
  const [httpBody, setHttpBody] = useState('');
  const [linkFilter, setLinkFilter] = useState('all');
  const [downloadEncoding, setDownloadEncoding] = useState('auto');
  const [includeBase64, setIncludeBase64] = useState(false);

  // TTS state
  const [ttsText, setTtsText] = useState(
    'Salom! Men MCP Web Bridge orqali yaratilgan Gemini ovoziman.'
  );
  const [ttsVoice, setTtsVoice] = useState('Kore');
  const [ttsStyle, setTtsStyle] = useState('');
  const [ttsExpressive, setTtsExpressive] = useState(false);

  // STT state
  const [sttAudioUrl, setSttAudioUrl] = useState('');
  const [sttBase64, setSttBase64] = useState('');
  const [sttMimeType, setSttMimeType] = useState('audio/wav');
  const [sttFilename, setSttFilename] = useState('');
  const [sttPrompt, setSttPrompt] = useState('Transcribe accurately in original language.');

  // DB state
  const [dbSaveMode, setDbSaveMode] = useState<'record' | 'kv'>('record');
  const [dbNamespace, setDbNamespace] = useState('default');
  const [dbKey, setDbKey] = useState('');
  const [dbValue, setDbValue] = useState('');
  const [dbCollection, setDbCollection] = useState('notes');
  const [dbTitle, setDbTitle] = useState('');
  const [dbData, setDbData] = useState('');
  const [dbTags, setDbTags] = useState('');
  const [dbSearch, setDbSearch] = useState('');
  const [dbRecordId, setDbRecordId] = useState('');
  const [dbSql, setDbSql] = useState(
    'SELECT id, collection, title, tags, created_at FROM records ORDER BY id DESC LIMIT 10'
  );

  // Multi-AI state
  const [aiTask, setAiTask] = useState(
    'Model Context Protocol (MCP) ning asosiy vazifasini 2 jumlada tushuntiring.'
  );
  const [aiDifficulty, setAiDifficulty] = useState('auto');
  const [aiProvider, setAiProvider] = useState('auto');
  const [aiContext, setAiContext] = useState('');
  const [aiJsonMode, setAiJsonMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resultTab, setResultTab] = useState<'rendered' | 'raw'>('rendered');
  const [copied, setCopied] = useState(false);
  const [outcome, setOutcome] = useState<{
    isError: boolean;
    text: string;
    downloadPath: string | null;
    audioUrl: string | null;
    imageDataUrl: string | null;
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
    if (preset.args.encoding) setDownloadEncoding(String(preset.args.encoding));
    if (preset.args.text) setTtsText(String(preset.args.text));
    if (preset.args.voice_name) setTtsVoice(String(preset.args.voice_name));
    if (typeof preset.args.expressive === 'boolean') setTtsExpressive(preset.args.expressive);
    if (preset.args.collection) {
      setDbSaveMode('record');
      setDbCollection(String(preset.args.collection));
    }
    if (preset.args.title) setDbTitle(String(preset.args.title));
    if (preset.args.data) setDbData(String(preset.args.data));
    if (preset.args.tags) setDbTags(String(preset.args.tags));
    if (preset.args.task) setAiTask(String(preset.args.task));
    if (preset.args.difficulty) setAiDifficulty(String(preset.args.difficulty));
    if (preset.args.provider) setAiProvider(String(preset.args.provider));
  }

  function handleAudioFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSttFilename(file.name);
    setSttMimeType(file.type || 'audio/wav');
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      setSttBase64(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
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
    if (selectedTool === 'download_file') {
      return {
        url: url.trim(),
        encoding: downloadEncoding,
        include_base64: includeBase64,
      };
    }
    if (selectedTool === 'tts_generate') {
      return {
        text: ttsText.trim(),
        voice_name: ttsVoice,
        ...(ttsStyle.trim() ? { style: ttsStyle.trim() } : {}),
        expressive: ttsExpressive,
      };
    }
    if (selectedTool === 'stt_transcribe') {
      return {
        ...(sttAudioUrl.trim() ? { audio_url: sttAudioUrl.trim() } : {}),
        ...(!sttAudioUrl.trim() && sttBase64 ? { audio_base64: sttBase64, mime_type: sttMimeType } : {}),
        ...(sttPrompt.trim() ? { prompt: sttPrompt.trim() } : {}),
      };
    }
    if (selectedTool === 'db_save') {
      if (dbSaveMode === 'kv') {
        return {
          namespace: dbNamespace.trim() || 'default',
          key: dbKey.trim(),
          value: dbValue,
        };
      }
      return {
        collection: dbCollection.trim() || 'notes',
        title: dbTitle.trim(),
        data: dbData,
        tags: dbTags.trim(),
      };
    }
    if (selectedTool === 'db_get') {
      return {
        ...(dbCollection.trim() ? { collection: dbCollection.trim() } : {}),
        ...(dbNamespace.trim() && !dbCollection.trim() && dbKey.trim()
          ? { namespace: dbNamespace.trim(), key: dbKey.trim() }
          : {}),
        ...(dbSearch.trim() ? { search: dbSearch.trim() } : {}),
        limit: 25,
      };
    }
    if (selectedTool === 'db_delete') {
      if (dbRecordId.trim()) {
        return { record_id: Number(dbRecordId.trim()) };
      }
      return {
        namespace: dbNamespace.trim() || 'default',
        key: dbKey.trim(),
      };
    }
    if (selectedTool === 'db_sql') {
      return { sql: dbSql.trim() };
    }
    if (selectedTool === 'ai_delegate') {
      return {
        task: aiTask.trim(),
        difficulty: aiDifficulty,
        provider: aiProvider,
        ...(aiContext.trim() ? { context: aiContext.trim() } : {}),
        json_mode: aiJsonMode,
      };
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

      const contentItems = Array.isArray(json?.result?.content)
        ? json.result.content
        : [];
      const textItem = contentItems.find(
        (c: { type?: string; text?: string }) => c.type === 'text'
      );
      const imageItem = contentItems.find(
        (c: { type?: string; data?: string; mimeType?: string }) =>
          c.type === 'image' && c.data
      );
      const audioResource = contentItems.find(
        (c: { type?: string; resource?: { uri?: string; mimeType?: string } }) =>
          c.type === 'resource' && c.resource?.mimeType?.startsWith('audio/')
      );

      const contentText =
        textItem?.text || json?.error?.message || JSON.stringify(json, null, 2);
      const isError = Boolean(json?.result?.isError || json?.error);

      const pathMatch = String(contentText).match(
        /Server yuklash havolasi:\s*(\/api\/downloads\/[^\s\n]+)/
      );
      const downloadPath = pathMatch ? pathMatch[1] : null;
      const audioUrl =
        audioResource?.resource?.uri ||
        (downloadPath && downloadPath.toLowerCase().endsWith('.wav') ? downloadPath : null);

      setOutcome({
        isError,
        text: contentText,
        downloadPath,
        audioUrl,
        imageDataUrl: imageItem
          ? `data:${imageItem.mimeType || 'image/png'};base64,${imageItem.data}`
          : null,
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
        downloadPath: null,
        audioUrl: null,
        imageDataUrl: null,
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

  const isUrlTool =
    selectedTool === 'web_fetch' ||
    selectedTool === 'http_request' ||
    selectedTool === 'extract_links' ||
    selectedTool === 'check_url_health' ||
    selectedTool === 'download_file';

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

          {selectedTool === 'web_search' && (
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
          )}

          {isUrlTool && (
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
                  max={50000}
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

          {selectedTool === 'download_file' && (
            <div className="flex flex-wrap items-center gap-6">
              <div className="w-64">
                <label
                  htmlFor="mcp-download-encoding"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Qaytarish formati
                </label>
                <select
                  id="mcp-download-encoding"
                  value={downloadEncoding}
                  onChange={(e) => setDownloadEncoding(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="auto">Avtomatik (Matn / Rasm / Binar)</option>
                  <option value="utf8">UTF-8 Matn</option>
                  <option value="base64">Base64 Resource</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBase64}
                  onChange={(e) => setIncludeBase64(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Katta fayllar uchun ham Base64 qo‘shish</span>
              </label>
            </div>
          )}

          {selectedTool === 'extract_links' && (
            <div className="w-56">
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

          {/* Gemini TTS Inputs */}
          {selectedTool === 'tts_generate' && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="mcp-tts-text"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Ovozga aylantiriladigan matn
                </label>
                <textarea
                  id="mcp-tts-text"
                  rows={3}
                  required
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label
                    htmlFor="mcp-tts-voice"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Ovoz tembri
                  </label>
                  <select
                    id="mcp-tts-voice"
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Kore">Kore (Neytral / Aniq)</option>
                    <option value="Puck">Puck (Jonli / Iliq)</option>
                    <option value="Charon">Charon (Chuqur / Vazmin)</option>
                    <option value="Fenrir">Fenrir (Energetik)</option>
                    <option value="Zephyr">Zephyr (Yumshoq)</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="mcp-tts-style"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Ohang ko&apos;rsatmasi (ixtiyoriy)
                  </label>
                  <input
                    id="mcp-tts-style"
                    type="text"
                    value={ttsStyle}
                    onChange={(e) => setTtsStyle(e.target.value)}
                    placeholder="Warm, calm narrator"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ttsExpressive}
                    onChange={(e) => setTtsExpressive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Expressive model (gemini-3.8-flash-tts)</span>
                </label>
              </div>
            </div>
          )}

          {/* Gemini STT Inputs */}
          {selectedTool === 'stt_transcribe' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="mcp-stt-url"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Audio URL manzili (yoki fayl yuklang)
                  </label>
                  <input
                    id="mcp-stt-url"
                    type="text"
                    value={sttAudioUrl}
                    onChange={(e) => setSttAudioUrl(e.target.value)}
                    placeholder="https://example.com/audio.mp3"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mcp-stt-file"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Lokal audio fayl yuklash (.wav, .mp3, .webm)
                  </label>
                  <input
                    id="mcp-stt-file"
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioFileChange}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                  />
                  {sttFilename && (
                    <p className="font-mono text-xs text-emerald-700 mt-1">
                      Tanlandi: {sttFilename} ({sttMimeType})
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label
                  htmlFor="mcp-stt-prompt"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Transkripsiya yo&apos;riqnomasi
                </label>
                <input
                  id="mcp-stt-prompt"
                  type="text"
                  value={sttPrompt}
                  onChange={(e) => setSttPrompt(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* SQLite db_save Inputs */}
          {selectedTool === 'db_save' && (
            <div className="space-y-4">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setDbSaveMode('record')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    dbSaveMode === 'record'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kolleksiya Yozuvi
                </button>
                <button
                  type="button"
                  onClick={() => setDbSaveMode('kv')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    dbSaveMode === 'kv'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kalit-Qiymat (KV)
                </button>
              </div>

              {dbSaveMode === 'record' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="mcp-db-col"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Kolleksiya
                    </label>
                    <input
                      id="mcp-db-col"
                      type="text"
                      value={dbCollection}
                      onChange={(e) => setDbCollection(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="mcp-db-title"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Sarlavha
                    </label>
                    <input
                      id="mcp-db-title"
                      type="text"
                      value={dbTitle}
                      onChange={(e) => setDbTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="mcp-db-tags"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Teglar
                    </label>
                    <input
                      id="mcp-db-tags"
                      type="text"
                      value={dbTags}
                      onChange={(e) => setDbTags(e.target.value)}
                      placeholder="ai,notes"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label
                      htmlFor="mcp-db-data"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Ma&apos;lumot / JSON tarkibi
                    </label>
                    <textarea
                      id="mcp-db-data"
                      rows={3}
                      value={dbData}
                      onChange={(e) => setDbData(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="mcp-kv-ns"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Namespace
                    </label>
                    <input
                      id="mcp-kv-ns"
                      type="text"
                      value={dbNamespace}
                      onChange={(e) => setDbNamespace(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="mcp-kv-key"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Kalit (key)
                    </label>
                    <input
                      id="mcp-kv-key"
                      type="text"
                      required
                      value={dbKey}
                      onChange={(e) => setDbKey(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="mcp-kv-val"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Qiymat (value)
                    </label>
                    <input
                      id="mcp-kv-val"
                      type="text"
                      value={dbValue}
                      onChange={(e) => setDbValue(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SQLite db_get Inputs */}
          {selectedTool === 'db_get' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="mcp-get-col"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Kolleksiya (ixtiyoriy)
                </label>
                <input
                  id="mcp-get-col"
                  type="text"
                  value={dbCollection}
                  onChange={(e) => setDbCollection(e.target.value)}
                  placeholder="Bo'sh qolsa barchasi"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="mcp-get-key"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  KV Kalit (ixtiyoriy)
                </label>
                <input
                  id="mcp-get-key"
                  type="text"
                  value={dbKey}
                  onChange={(e) => setDbKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="mcp-get-search"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Qidiruv filtri
                </label>
                <input
                  id="mcp-get-search"
                  type="text"
                  value={dbSearch}
                  onChange={(e) => setDbSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* SQLite db_delete Inputs */}
          {selectedTool === 'db_delete' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="mcp-del-id"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Yozuv ID si (record_id)
                </label>
                <input
                  id="mcp-del-id"
                  type="number"
                  value={dbRecordId}
                  onChange={(e) => setDbRecordId(e.target.value)}
                  placeholder="Masalan: 1"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="mcp-del-ns"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Yoki KV Namespace
                </label>
                <input
                  id="mcp-del-ns"
                  type="text"
                  value={dbNamespace}
                  onChange={(e) => setDbNamespace(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="mcp-del-key"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  KV Kalit (key)
                </label>
                <input
                  id="mcp-del-key"
                  type="text"
                  value={dbKey}
                  onChange={(e) => setDbKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* SQLite db_sql Inputs */}
          {selectedTool === 'db_sql' && (
            <div>
              <label
                htmlFor="mcp-db-sql"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Read-Only SQL (SELECT / WITH / PRAGMA)
              </label>
              <textarea
                id="mcp-db-sql"
                rows={3}
                required
                value={dbSql}
                onChange={(e) => setDbSql(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          {/* Multi-AI ai_delegate Inputs */}
          {selectedTool === 'ai_delegate' && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="mcp-ai-task"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  AI ga topshiriladigan vazifa
                </label>
                <textarea
                  id="mcp-ai-task"
                  rows={3}
                  required
                  value={aiTask}
                  onChange={(e) => setAiTask(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label
                    htmlFor="mcp-ai-difficulty"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Murakkablik darajasi
                  </label>
                  <select
                    id="mcp-ai-difficulty"
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="auto">Avtomatik (Auto Router)</option>
                    <option value="easy">Oson (Easy → Groq)</option>
                    <option value="medium">O‘rtacha (Medium → Gemini)</option>
                    <option value="hard">Qiyin (Hard → OpenRouter)</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="mcp-ai-provider"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Provayderni tanlash
                  </label>
                  <select
                    id="mcp-ai-provider"
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="auto">Avtomatik (Darajaga qarab)</option>
                    <option value="groq">Groq API</option>
                    <option value="gemini">Gemini API</option>
                    <option value="openrouter">OpenRouter API</option>
                  </select>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiJsonMode}
                    onChange={(e) => setAiJsonMode(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Qat&apos;iy JSON javob</span>
                </label>
              </div>
              <div>
                <label
                  htmlFor="mcp-ai-context"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Qo&apos;shimcha kontekst (ixtiyoriy)
                </label>
                <textarea
                  id="mcp-ai-context"
                  rows={2}
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  placeholder="Veb-sahifa yoki bazadan olingan matn..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
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

            <div className="flex flex-wrap items-center gap-2">
              {outcome.downloadPath && (
                <a
                  href={outcome.downloadPath}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Faylni yuklab olish</span>
                </a>
              )}

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

          {outcome.audioUrl && resultTab === 'rendered' && (
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              <Volume2 className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
              <audio controls src={outcome.audioUrl} className="w-full max-w-md h-9" />
            </div>
          )}

          {outcome.imageDataUrl && resultTab === 'rendered' && (
            <div className="p-6 bg-slate-100 border-b border-slate-200 flex justify-center">
              <img
                src={outcome.imageDataUrl}
                alt="Yuklab olingan rasm"
                referrerPolicy="no-referrer"
                className="max-h-72 rounded-lg border border-slate-200 bg-white object-contain"
              />
            </div>
          )}

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
