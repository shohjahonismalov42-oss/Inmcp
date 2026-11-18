import { useState, useEffect, FormEvent } from 'react';
import {
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  SearchCheck,
} from 'lucide-react';
import { PolicyMode, SandboxPolicy } from '../lib/mcpPolicy';

interface PolicyViewProps {
  policy: SandboxPolicy;
  onSavePolicy: (nextPolicy: SandboxPolicy) => Promise<void>;
}

const MODE_OPTIONS: Array<{ id: PolicyMode; label: string; desc: string }> = [
  {
    id: 'blocklist',
    label: 'Blocklist (Standart)',
    desc: "Ko'rsatilgan domenlardan tashqari barcha ommaviy saytlarga ruxsat beriladi.",
  },
  {
    id: 'allowlist',
    label: 'Allowlist (Qat’iy)',
    desc: "Faqat ro'yxatdagi ishonchli domenlarga chiqishga ruxsat beriladi.",
  },
  {
    id: 'allow_all',
    label: 'Cheklovsiz (Faqat SSRF himoya)',
    desc: "Domen ro'yxati tekshirilmaydi, faqat ichki tarmoq himoyasi amal qiladi.",
  },
];

export function PolicyView({ policy, onSavePolicy }: PolicyViewProps) {
  const [draft, setDraft] = useState<SandboxPolicy>(policy);
  const [domainInput, setDomainInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [testUrl, setTestUrl] = useState('https://docs.anthropic.com');
  const [testMethod, setTestMethod] = useState('GET');
  const [testResult, setTestResult] = useState<{
    allowed: boolean;
    reason: string;
  } | null>(null);
  const [checkingUrl, setCheckingUrl] = useState(false);

  useEffect(() => {
    setDraft(policy);
  }, [policy]);

  function addDomain() {
    const cleaned = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!cleaned) return;
    if (!draft.domains.includes(cleaned)) {
      setDraft((prev) => ({ ...prev, domains: [...prev.domains, cleaned] }));
    }
    setDomainInput('');
  }

  function removeDomain(domain: string) {
    setDraft((prev) => ({
      ...prev,
      domains: prev.domains.filter((d) => d !== domain),
    }));
  }

  function toggleMethod(method: string) {
    setDraft((prev) => {
      const exists = prev.allowHttpMethods.includes(method);
      const next = exists
        ? prev.allowHttpMethods.filter((m) => m !== method)
        : [...prev.allowHttpMethods, method];
      return {
        ...prev,
        allowHttpMethods: next.length > 0 ? next : ['GET'],
      };
    });
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSavePolicy(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2400);
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckUrl(e: FormEvent) {
    e.preventDefault();
    setCheckingUrl(true);
    try {
      const res = await fetch('/api/policy/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl, method: testMethod }),
      });
      const json = await res.json();
      setTestResult({ allowed: Boolean(json.allowed), reason: String(json.reason || '') });
    } finally {
      setCheckingUrl(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              Sandbox Xavfsizlik Siyosati
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Claude AI tashqi internetga chiqishda amal qilishi shart bo‘lgan tarmoq cheklovlari.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Siyosat saqlandi</span>
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{saving ? 'Saqlanmoqda...' : 'Siyosatni saqlash'}</span>
            </button>
          </div>
        </div>

        {/* Mode selection */}
        <div className="border-t border-slate-200 pt-5 space-y-3">
          <span className="block text-xs font-semibold text-slate-700">
            Domen filtrlash rejimi
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODE_OPTIONS.map((opt) => {
              const active = draft.mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, mode: opt.id }))}
                  aria-pressed={active}
                  className={`rounded-lg border p-3.5 text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Domain List Management */}
        {draft.mode !== 'allow_all' && (
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <label
              htmlFor="policy-domain-input"
              className="block text-xs font-semibold text-slate-700"
            >
              {draft.mode === 'allowlist'
                ? 'Ruxsat etilgan domenlar (Allowlist)'
                : 'Taqiqlangan domenlar (Blocklist)'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="policy-domain-input"
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                placeholder="Masalan: github.com yoki *.anthropic.com"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={addDomain}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Domen qo‘shish</span>
              </button>
            </div>

            {draft.domains.length === 0 ? (
              <p className="text-xs text-slate-500">
                Hozircha domenlar ro‘yxati bo‘sh.
                {draft.mode === 'allowlist'
                  ? ' Allowlist rejimida kamida bitta domen qo‘shing.'
                  : ' Ommaviy domenlar ochiq.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {draft.domains.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between px-3.5 py-2 text-xs"
                  >
                    <code className="font-mono text-slate-900">{domain}</code>
                    <button
                      type="button"
                      onClick={() => removeDomain(domain)}
                      aria-label={`${domain} domenini olib tashlash`}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>O‘chirish</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SSRF & Transport Limits */}
        <div className="border-t border-slate-200 pt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              SSRF Himoyasi
            </span>
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.blockPrivateNetworks}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    blockPrivateNetworks: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>
                Lokal/ichki IP manzillarni bloklash (127.0.0.1, 10.x, 192.168.x, 169.254.169.254)
              </span>
            </label>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Ruxsat etilgan HTTP metodlar
            </span>
            <div className="flex items-center gap-4">
              {['GET', 'POST', 'HEAD'].map((m) => (
                <label
                  key={m}
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={draft.allowHttpMethods.includes(m)}
                    onChange={() => toggleMethod(m)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="policy-timeout"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Timeout (ms)
              </label>
              <input
                id="policy-timeout"
                type="number"
                min={1000}
                max={30000}
                step={1000}
                value={draft.timeoutMs}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="policy-max-kb"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Maks hajm (KB)
              </label>
              <input
                id="policy-max-kb"
                type="number"
                min={16}
                max={4096}
                step={32}
                value={Math.round(draft.maxResponseBytes / 1024)}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    maxResponseBytes: Number(e.target.value) * 1024,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </form>

      {/* Live URL Policy Simulator */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            URL Siyosat Tekshirgichi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Saqlangan joriy siyosat berilgan URL manzilga ruxsat berishini yoki bloklashini
            tarmoqqa chiqmasdan tekshiring.
          </p>
        </div>

        <form onSubmit={handleCheckUrl} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            aria-label="Tekshiriladigan URL"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://example.com yoki http://169.254.169.254/latest/meta-data"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <select
            aria-label="Tekshiriladigan HTTP metodi"
            value={testMethod}
            onChange={(e) => setTestMethod(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="HEAD">HEAD</option>
            <option value="DELETE">DELETE</option>
          </select>
          <button
            type="submit"
            disabled={checkingUrl}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <SearchCheck className="h-4 w-4" aria-hidden="true" />
            <span>Tekshirish</span>
          </button>
        </form>

        {testResult && (
          <div
            role="status"
            className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${
              testResult.allowed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {testResult.allowed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <span>{testResult.reason}</span>
          </div>
        )}
      </section>
    </div>
  );
}
