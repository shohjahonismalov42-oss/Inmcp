import { useCallback, useEffect, useState } from 'react';
import { Menu, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import { DEFAULT_POLICY, SandboxPolicy } from './lib/mcpPolicy';
import { AuditLogEntry } from './server/mcpExecutor';
import { NavTab, Sidebar } from './components/Sidebar';
import { ProviderReadinessMap, SetupConfigView } from './components/SetupConfigView';
import { PlaygroundView } from './components/PlaygroundView';
import { DatabaseView } from './components/DatabaseView';
import { PolicyView } from './components/PolicyView';
import { AuditLogView } from './components/AuditLogView';

const TAB_TITLES: Record<NavTab, string> = {
  setup: 'Ulanish va Sozlash',
  playground: 'Jonli Sinov',
  database: "Ma'lumotlar Bazasi",
  policy: 'Xavfsizlik Siyosati',
  logs: "So'rovlar Jurnali",
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('setup');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [policy, setPolicy] = useState<SandboxPolicy>(DEFAULT_POLICY);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [pingMessage, setPingMessage] = useState<string>('');
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadinessMap | undefined>(
    undefined
  );

  const originUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const fetchState = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const [statusRes, logsRes, aiRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/logs'),
        fetch('/api/ai/status'),
      ]);
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        if (statusJson.policy) setPolicy(statusJson.policy);
      }
      if (logsRes.ok) {
        const logsJson = await logsRes.json();
        if (Array.isArray(logsJson.logs)) setLogs(logsJson.logs);
      }
      if (aiRes.ok) {
        const aiJson = await aiRes.json();
        if (aiJson.providers) setProviderReadiness(aiJson.providers);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  async function handleSavePolicy(nextPolicy: SandboxPolicy) {
    const res = await fetch('/api/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPolicy),
    });
    if (res.ok) {
      const updated = await res.json();
      setPolicy(updated);
    }
  }

  async function handleUpdateAuth(requireAuth: boolean, token: string) {
    await handleSavePolicy({
      ...policy,
      requireBearerAuth: requireAuth,
      bearerToken: token,
    });
  }

  async function handleClearLogs() {
    await fetch('/api/logs', { method: 'DELETE' });
    setLogs([]);
  }

  async function handleCheckHandshake() {
    setPingStatus('checking');
    setPingMessage('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (policy.requireBearerAuth && policy.bearerToken) {
        headers.Authorization = `Bearer ${policy.bearerToken}`;
      }
      const res = await fetch('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'console-check', version: '1.0.0' },
          },
        }),
      });
      const json = await res.json();
      if (json?.result?.protocolVersion) {
        setPingStatus('ok');
        setPingMessage(`MCP ${json.result.protocolVersion} tayyor`);
        fetchState();
      } else {
        setPingStatus('error');
        setPingMessage(json?.error?.message || 'Handshake xatosi');
      }
    } catch (err) {
      setPingStatus('error');
      setPingMessage(err instanceof Error ? err.message : 'Ulanish xatosi');
    }
  }

  const blockedCount = logs.filter((l) => l.status === 'blocked').length;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        logCount={logs.length}
        blockedCount={blockedCount}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Navigatsiya menyusini ochish"
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 whitespace-nowrap hidden sm:inline">
                MCP Web Bridge
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-display font-semibold text-slate-900 whitespace-nowrap truncate">
                {TAB_TITLES[activeTab]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {pingStatus === 'ok' && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pingMessage}</span>
              </span>
            )}
            {pingStatus === 'error' && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pingMessage}</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleCheckHandshake}
              disabled={pingStatus === 'checking'}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {pingStatus === 'checking' ? (
                  'Tekshirilmoqda...'
                ) : (
                  <>
                    <span className="sm:hidden">Tekshirish</span>
                    <span className="hidden sm:inline">MCP Handshake Tekshirish</span>
                  </>
                )}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1200px] w-full mx-auto">
          {activeTab === 'setup' && (
            <SetupConfigView
              originUrl={originUrl}
              policy={policy}
              providerReadiness={providerReadiness}
              onUpdateAuth={handleUpdateAuth}
              onGoToPlayground={() => setActiveTab('playground')}
            />
          )}

          {activeTab === 'playground' && (
            <PlaygroundView policy={policy} onToolExecuted={fetchState} />
          )}

          {activeTab === 'database' && <DatabaseView />}

          {activeTab === 'policy' && (
            <PolicyView policy={policy} onSavePolicy={handleSavePolicy} />
          )}

          {activeTab === 'logs' && (
            <AuditLogView
              logs={logs}
              loading={loadingLogs}
              onRefresh={fetchState}
              onClear={handleClearLogs}
              onGoToPlayground={() => setActiveTab('playground')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
