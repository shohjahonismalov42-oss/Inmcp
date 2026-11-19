import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Database,
  RefreshCw,
  Search,
  Trash2,
  Plus,
  Cpu,
  KeyRound,
  FileText,
} from 'lucide-react';
import type { AiRunRecord, CollectionRecord, KvRecord } from '../server/mcpDatabase';

interface DbStats {
  kvCount: number;
  recordCount: number;
  aiRunCount: number;
  collections: string[];
  dbPath: string;
}

type DbSubTab = 'records' | 'kv' | 'runs';

export function DatabaseView() {
  const [subTab, setSubTab] = useState<DbSubTab>('records');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [kvItems, setKvItems] = useState<KvRecord[]>([]);
  const [runs, setRuns] = useState<AiRunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Quick add record state
  const [collection, setCollection] = useState('notes');
  const [title, setTitle] = useState('');
  const [dataText, setDataText] = useState('');
  const [tags, setTags] = useState('');

  // Quick add KV state
  const [namespace, setNamespace] = useState('default');
  const [kvKey, setKvKey] = useState('');
  const [kvValue, setKvValue] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDb = useCallback(async (searchQuery = '') => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchQuery.trim()
        ? `?search=${encodeURIComponent(searchQuery.trim())}`
        : '';
      const res = await fetch(`/api/db${qs}`);
      if (!res.ok) {
        throw new Error(`Baza ma'lumotlarini yuklashda xato (${res.status})`);
      }
      const json = await res.json();
      setStats(json.stats || null);
      setRecords(Array.isArray(json.records) ? json.records : []);
      setKvItems(Array.isArray(json.kv) ? json.kv : []);
      setRuns(Array.isArray(json.runs) ? json.runs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDb(search);
  }, [loadDb]);

  async function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    await loadDb(search);
  }

  async function handleAddRecord(e: FormEvent) {
    e.preventDefault();
    if (!dataText.trim() && !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/db/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: collection.trim() || 'notes',
          title: title.trim(),
          data: dataText,
          tags: tags.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Saqlashda xatolik');
      setTitle('');
      setDataText('');
      setTags('');
      await loadDb(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddKv(e: FormEvent) {
    e.preventDefault();
    if (!kvKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/db/kv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace: namespace.trim() || 'default',
          key: kvKey.trim(),
          value: kvValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Saqlashda xatolik');
      setKvKey('');
      setKvValue('');
      await loadDb(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecord(id: number) {
    await fetch(`/api/db/records/${id}`, { method: 'DELETE' });
    await loadDb(search);
  }

  async function handleDeleteKv(ns: string, key: string) {
    await fetch(
      `/api/db/kv?namespace=${encodeURIComponent(ns)}&key=${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    );
    await loadDb(search);
  }

  return (
    <div className="space-y-6">
      {/* Header + Stats */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              MCP Doimiy Ma&apos;lumotlar Bazasi (SQLite)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Claude AI <code className="font-mono text-slate-700">db_save</code>,{' '}
              <code className="font-mono text-slate-700">db_get</code>,{' '}
              <code className="font-mono text-slate-700">db_delete</code> va{' '}
              <code className="font-mono text-slate-700">db_sql</code> orqali saqlagan barcha
              yozuvlar shu yerda saqlanadi.
            </p>
            {stats?.dbPath && (
              <p className="font-mono text-xs text-slate-500 mt-1 truncate">
                Fayl: {stats.dbPath}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadDb(search)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 self-start"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Yangilash</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Kolleksiya yozuvlari</span>
              <FileText className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold tabular-nums text-slate-900 mt-1">
              {stats?.recordCount ?? 0}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Kalit-Qiymat (KV)</span>
              <KeyRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold tabular-nums text-slate-900 mt-1">
              {stats?.kvCount ?? 0}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Multi-AI chaqiruvlar</span>
              <Cpu className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold tabular-nums text-slate-900 mt-1">
              {stats?.aiRunCount ?? 0}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* Filter & Tabs */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 border-b border-slate-200">
          <div
            role="tablist"
            aria-label="Baza bo'limlari"
            className="inline-flex max-w-full overflow-x-auto items-center gap-1 rounded-lg bg-slate-100 p-1 self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'records'}
              onClick={() => setSubTab('records')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'records'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yozuvlar ({records.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'kv'}
              onClick={() => setSubTab('kv')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'kv'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kalit-Qiymat ({kvItems.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'runs'}
              onClick={() => setSubTab('runs')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                subTab === 'runs'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Multi-AI Tarixi ({runs.length})
            </button>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-72">
            <div className="relative flex-1">
              <Search
                className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bazadan qidirish..."
                aria-label="Bazadan qidirish"
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Qidirish
            </button>
          </form>
        </div>

        {/* SubTab 1: Records */}
        {subTab === 'records' && (
          <div className="divide-y divide-slate-200">
            <form onSubmit={handleAddRecord} className="p-5 bg-slate-50 grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  placeholder="Kolleksiya (notes)"
                  aria-label="Kolleksiya nomi"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sarlavha"
                  aria-label="Yozuv sarlavhasi"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-4">
                <input
                  type="text"
                  value={dataText}
                  onChange={(e) => setDataText(e.target.value)}
                  placeholder="Ma'lumot yoki JSON tarkibi"
                  aria-label="Yozuv tarkibi"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Teglar"
                  aria-label="Teglar"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-1 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Qo&apos;shish</span>
                </button>
              </div>
            </form>

            {records.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                <Database className="h-6 w-6 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                Hozircha kolleksiya yozuvlari yo&apos;q. Claude <code className="font-mono">db_save</code>{' '}
                orqali yoki yuqoridagi forma bilan saqlashingiz mumkin.
              </div>
            ) : (
              records.map((rec) => (
                <div key={rec.id} className="p-5 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-blue-700">#{rec.id}</span>
                      <span className="font-mono text-slate-600">{rec.collection}</span>
                      {rec.title && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-medium text-slate-900">{rec.title}</span>
                        </>
                      )}
                      {rec.tags && (
                        <span className="font-mono text-slate-500">[{rec.tags}]</span>
                      )}
                    </div>
                    <pre className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                      {rec.data}
                    </pre>
                    <p className="font-mono text-xs text-slate-400">
                      {new Date(rec.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteRecord(rec.id)}
                    aria-label={`Yozuv #${rec.id} ni o'chirish`}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* SubTab 2: Key-Value Store */}
        {subTab === 'kv' && (
          <div className="divide-y divide-slate-200">
            <form onSubmit={handleAddKv} className="p-5 bg-slate-50 grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="Bo'lim (default)"
                  aria-label="Namespace"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-3">
                <input
                  type="text"
                  value={kvKey}
                  onChange={(e) => setKvKey(e.target.value)}
                  placeholder="Kalit (key)"
                  aria-label="Kalit nomi"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-6">
                <input
                  type="text"
                  value={kvValue}
                  onChange={(e) => setKvValue(e.target.value)}
                  placeholder="Qiymat (matn yoki JSON)"
                  aria-label="Qiymat"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="md:col-span-1 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Saqlash</span>
                </button>
              </div>
            </form>

            {kvItems.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Kalit-qiymat juftliklari hali saqlanmagan.
              </div>
            ) : (
              kvItems.map((item) => (
                <div
                  key={`${item.namespace}:${item.key}`}
                  className="p-5 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-slate-500">{item.namespace}</span>
                      <span className="text-slate-300">/</span>
                      <span className="font-mono font-semibold text-blue-700">{item.key}</span>
                    </div>
                    <pre className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                      {item.value}
                    </pre>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteKv(item.namespace, item.key)}
                    aria-label={`${item.namespace}/${item.key} kalitini o'chirish`}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* SubTab 3: Multi-AI Runs */}
        {subTab === 'runs' && (
          <div className="overflow-x-auto">
            {runs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Hali <code className="font-mono">ai_delegate</code> orqali Multi-AI so&apos;rovlari
                bajarilmagan.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                    <th className="py-3 px-4">Daraja</th>
                    <th className="py-3 px-4">Provayder / Model</th>
                    <th className="py-3 px-4">Vazifa</th>
                    <th className="py-3 px-4">Holat</th>
                    <th className="py-3 px-4 text-right">Vaqt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono uppercase text-slate-700">{r.tier}</td>
                      <td className="py-3 px-4 font-mono text-slate-900">
                        <span className="font-semibold">{r.provider}</span> · {r.model}
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-md truncate">
                        {r.prompt_preview}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className={r.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600">
                        {r.duration_ms} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
