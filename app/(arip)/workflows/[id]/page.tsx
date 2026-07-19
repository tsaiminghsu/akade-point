import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';

export const metadata: Metadata = { title: 'Workflow Detail' };

export default function WorkflowDetailPage({ params }: { params: { id: string } }) {
  return (
    <ARIPPageShell
      title={`Workflow: ${params.id}`}
      description="View and manage workflow execution"
    >
      <div className="h-[calc(100vh-10rem)] overflow-hidden rounded-xl border border-white/10">
        <iframe
          src={`http://localhost:1880/#flow/${params.id}`}
          className="h-full w-full border-0"
          title="Node-RED Editor"
        />
      </div>
    </ARIPPageShell>
  );
}
