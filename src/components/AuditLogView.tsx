import { useState } from 'react';
import { RefreshCw, Trash2, CheckCircle2, ShieldAlert, AlertCircle, Play } from 'lucide-react';
import { AuditLogEntry } from '../server/mcpExecutor';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
  loading: boolean;
  onRefresh: () => void;
  onClear: () => void;
  onGoToPlayground: () => void;
}

type StatusFilter = 'all' | 'ok' | 'blocked' | 'error';

export function AuditLogView({
  logs,
  loading,
  onRefresh,
  onClear,
  onGoToPlayground,
}: AuditLogViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchText, setSearchText] = useState('');

  const filteredLogs = logs.filter((entry) => {
    if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      return (
        entry.target.toLowerCase().includes(q) ||
        (entry.toolName || '').toLowerCase().includes(q) ||
        entry.rpcMethod.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString('uz-UZ', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function renderStatus(status: AuditLogEntry['status']) {
    if (status === 'ok') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ruxsat</span>
        </span>
      );
    }
    if (status === 'blocked') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Bloklandi</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Xato</span>
      </span>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            MCP So&apos;rovlar Jurnali
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Claude klientlari va Sinov maydonidan kelgan haqiqiy JSON-RPC chaqiruvlar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Yangilash</span>
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Jurnalni tozalash</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 self-start">
          {(
            [
              { id: 'all', label: 'Barchasi' },
              { id: 'ok', label: 'Muvaffaqiyatli' },
              { id: 'blocked', label: 'Bloklangan' },
              { id: 'error', label: 'Xatolar' },
            ] as Array<{ id: StatusFilter; label: string }>
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                statusFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          aria-label="Jurnal bo‘yicha qidirish"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="URL yoki vosita bo‘yicha qidirish..."
          className="w-full sm:w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
        />
      </div>

      {filteredLogs.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-900">
            {logs.length === 0
              ? 'Hozircha MCP so‘rovlari qayd etilmagan'
              : 'Tanlangan filtr bo‘yicha yozuvlar topilmadi'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Jonli sinov maydonidan biror vositani ishga tushiring yoki Claude klientini{' '}
            <code className="font-mono">/mcp</code> manziliga ulang.
          </p>
          {logs.length === 0 && (
            <button
              type="button"
              onClick={onGoToPlayground}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Birinchi sinovni boshlash</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Vaqt</th>
                <th className="py-3 px-4">Holat</th>
                <th className="py-3 px-4">Vosita / Metod</th>
                <th className="py-3 px-4">Nishon (Target)</th>
                <th className="py-3 px-4 text-right">Davomiylik</th>
                <th className="py-3 px-6 text-right">Hajm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredLogs.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-6 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatTime(entry.timestamp)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{renderStatus(entry.status)}</td>
                  <td className="py-3 px-4 font-mono text-slate-900 whitespace-nowrap">
                    {entry.toolName || entry.rpcMethod}
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <div className="font-mono text-slate-800 truncate">{entry.target}</div>
                    <div className="text-slate-500 truncate mt-0.5">{entry.summary}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {entry.durationMs} ms
                  </td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {entry.bytes > 0 ? `${(entry.bytes / 1024).toFixed(1)} KB` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
