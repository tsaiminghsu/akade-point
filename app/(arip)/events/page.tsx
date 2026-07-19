import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';
import { ARIPComingSoon } from '@/components/arip/ARIPComingSoon';

export const metadata: Metadata = { title: 'Event Log' };

export default function EventsPage() {
  return (
    <ARIPPageShell
      title="Event Log"
      description="Real-time event stream from all connected modules"
    >
      <ARIPComingSoon
        module="Event Bus Monitor"
        description="Live event feed from the ARIP Event Bus. Displays device telemetry, workflow state changes, AI inference results, and vision detections in real time via Server-Sent Events."
      />
    </ARIPPageShell>
  );
}
