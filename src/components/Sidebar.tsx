import {
  Terminal,
  Play,
  ShieldCheck,
  ScrollText,
  Database,
  X,
  Globe,
} from 'lucide-react';

export type NavTab = 'setup' | 'playground' | 'database' | 'policy' | 'logs';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  logCount: number;
  blockedCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  description: string;
  icon: typeof Terminal;
}> = [
  {
    id: 'setup',
    label: 'Ulanish va Sozlash',
    description: 'Claude config va stdio skript',
    icon: Terminal,
  },
  {
    id: 'playground',
    label: 'Jonli Sinov',
    description: 'MCP vositalarini tekshirish',
    icon: Play,
  },
  {
    id: 'database',
    label: "Ma'lumotlar Bazasi",
    description: 'SQLite va Multi-AI tarixi',
    icon: Database,
  },
  {
    id: 'policy',
    label: 'Xavfsizlik Siyosati',
    description: 'SSRF va domen cheklovlari',
    icon: ShieldCheck,
  },
  {
    id: 'logs',
    label: "So'rovlar Jurnali",
    description: 'Haqiqiy MCP chaqiruvlar tarixi',
    icon: ScrollText,
  },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  logCount,
  blockedCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Globe className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap truncate">
            MCP Web Bridge
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Menyuni yopish"
          className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Asosiy navigatsiya" className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  isActive ? 'text-blue-600' : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium whitespace-nowrap truncate">
                    {item.label}
                  </span>
                  {item.id === 'logs' && logCount > 0 && (
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {logCount}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-slate-500 truncate mt-0.5">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4 space-y-2 text-xs text-slate-600">
        <div className="flex items-center justify-between">
          <span>Protokol</span>
          <span className="font-mono text-slate-900">MCP 2025-03-26</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Transport</span>
          <span className="font-mono text-slate-900">HTTP · SSE · Stdio</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Jami / Bloklangan</span>
          <span className="font-mono tabular-nums text-slate-900">
            {logCount} / {blockedCount}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[264px] shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[280px] max-w-[85vw] h-full">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
