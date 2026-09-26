"use client";

import dynamic from "next/dynamic";

const GcsPageContent = dynamic(() => import("@/components/control-center/vehicles/gcs/GcsPageContent"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full gap-3 p-4 lg:grid-cols-[400px_1fr]">
      <div className="aspect-[4/3] rounded-md bg-muted/60" />
      <div className="min-h-[360px] rounded-md bg-muted/40" />
    </div>
  ),
});

/** The ground station for one vehicle (Leaflet and the HUD need the browser). */
export default function VehicleGcsPage({ params }: { params: { id: string } }) {
  return <GcsPageContent vehicleId={params.id} />;
}
