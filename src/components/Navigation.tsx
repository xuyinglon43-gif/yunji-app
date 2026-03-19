'use client';

import { useAuth } from '@/lib/auth';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
  { id: 'home', label: '首页', icon: '☶' },
  { id: 'schedule', label: '档期', icon: '☷' },
  { id: 'orders', label: '订单', icon: '☰' },
  { id: 'finance', label: '财务', icon: '◆' },
  { id: 'members', label: '会员', icon: '●' },
  { id: 'business', label: '商务', icon: '★' },
  { id: 'dashboard', label: '总览', icon: '◼' },
];

export default function Navigation({ currentPage, onNavigate }: NavigationProps) {
  const { role, roleLabel, logout, canSeePage } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => canSeePage(item.id));

  return (
    <>
      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] flex z-50">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex-1 flex flex-col items-center py-2 text-[10px] transition
              ${currentPage === item.id
                ? 'text-[var(--green)] border-t-2 border-[var(--green)]'
                : 'text-[var(--ink3)]'
              }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[200px] bg-white border-r border-[var(--border)] flex-shrink-0">
        <div className="p-4 border-b border-[var(--border)]">
          <h1 className="text-base font-bold">云吉合院</h1>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium
              ${role === 'approve'
                ? 'bg-[var(--green-bg)] text-[var(--green)] border border-[var(--green-border)]'
                : role === 'finance'
                ? 'bg-[var(--blue-bg)] text-[var(--blue)] border border-[var(--blue-border)]'
                : role === 'service'
                ? 'bg-[var(--purple-bg)] text-[var(--purple)] border border-[var(--purple-border)]'
                : 'bg-[var(--amber-bg)] text-[var(--amber)] border border-[var(--amber-border)]'
              }`}
            >
              {roleLabel}
            </span>
            <button
              onClick={logout}
              className="text-[11px] text-[var(--ink3)] hover:text-[var(--red)]"
            >
              退出
            </button>
          </div>
        </div>
        <div className="flex-1 py-2">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center gap-2
                ${currentPage === item.id
                  ? 'text-[var(--green)] bg-[var(--green-bg)] border-l-3 border-[var(--green)] font-medium'
                  : 'text-[var(--ink2)] hover:bg-[var(--bg)]'
                }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
