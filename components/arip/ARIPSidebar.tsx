'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/arip/dashboard', label: 'Dashboard', icon: '⬛' },
  { href: '/arip/devices', label: 'Devices', icon: '📡' },
  { href: '/arip/fleet', label: 'Fleet', icon: '🚁' },
  { href: '/arip/workflows', label: 'Workflows', icon: '⚡' },
  { href: '/arip/ai', label: 'AI Agents', icon: '🤖' },
  { href: '/arip/vision', label: 'Vision', icon: '👁' },
  { href: '/arip/events', label: 'Event Log', icon: '📋' },
];

export function ARIPSidebar() {
  const pathname = usePathname() ?? '';

  return (
    <aside className="flex h-full w-56 flex-col border-r border-white/10 bg-gray-900">
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        <span className="text-sm font-semibold tracking-widest text-cyan-400">ARIP</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="text-xs text-gray-600">ARIP v0.1.0</p>
      </div>
    </aside>
  );
}
