import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';
import { ARIPComingSoon } from '@/components/arip/ARIPComingSoon';

export const metadata: Metadata = { title: 'Fleet' };

export default function FleetPage() {
  return (
    <ARIPPageShell
      title="Fleet Manager"
      description="Organize devices into fleets and coordinate missions"
    >
      <ARIPComingSoon
        module="Fleet Manager"
        description="Group drones, robots, and AGVs into fleets. Assign missions, track battery, health, and workflow status per fleet."
      />
    </ARIPPageShell>
  );
}
