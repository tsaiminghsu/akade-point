import type { Metadata } from 'next';
import { ARIPSidebar } from '@/components/arip/ARIPSidebar';

export const metadata: Metadata = {
  title: { template: '%s | ARIP', default: 'ARIP Dashboard' },
  description: 'AI Robotics Integration Platform',
};

export default function ARIPLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-white">
      <ARIPSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
