import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';
import { ARIPComingSoon } from '@/components/arip/ARIPComingSoon';

export const metadata: Metadata = { title: 'Workflows' };

export default function WorkflowsPage() {
  return (
    <ARIPPageShell
      title="Workflow Manager"
      description="Create and execute automation workflows via connected providers"
    >
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 px-4 py-2.5">
        <span className="text-sm text-orange-400">Provider:</span>
        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300">
          Node-RED (active)
        </span>
        <a
          href="http://localhost:1880"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-gray-500 underline hover:text-gray-300"
        >
          Open Node-RED Editor ↗
        </a>
      </div>
      <ARIPComingSoon
        module="Workflow List"
        description="List, create, and trigger workflows from any registered provider (Node-RED, n8n, Kestra, Flowise…)."
      />
    </ARIPPageShell>
  );
}
