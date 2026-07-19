import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';
import { ARIPComingSoon } from '@/components/arip/ARIPComingSoon';

export const metadata: Metadata = { title: 'Devices' };

export default function DevicesPage() {
  return (
    <ARIPPageShell
      title="Device Manager"
      description="Register, monitor, and control IoT and robotics devices"
    >
      <ARIPComingSoon
        module="Device Manager"
        description="Manage ESP32, Raspberry Pi, Pixhawk, drones, robots, and more. Supports MQTT heartbeat, OTA, and real-time telemetry."
      />
    </ARIPPageShell>
  );
}
