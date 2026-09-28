import type { CCVehicle } from "@/lib/dynamo/cc-vehicles";
import { linkStateOf } from "./linkState";
import type { Vehicle, VehicleState } from "./types";

/** Projects a stored vehicle row into the client shape, deriving linkState from
 *  lastSeenAt at read time. */
export function toVehicleView(v: CCVehicle, now: number = Date.now()): Vehicle {
  return {
    id: v.id,
    name: v.name,
    type: v.type,
    companionId: v.companionId,
    notes: v.notes,
    storeId: v.storeId || null,
    state: (v.state as VehicleState | null) ?? null,
    stateAt: v.stateAt,
    lastSeenAt: v.lastSeenAt,
    linkState: linkStateOf(v.lastSeenAt, now),
    directUrl: v.directUrl ?? "",
    videoUrl: v.videoUrl ?? "",
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}
