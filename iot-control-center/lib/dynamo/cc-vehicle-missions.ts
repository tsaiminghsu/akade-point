import { createHash } from "node:crypto";

import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createId } from "@paralleldrive/cuid2";

import type { MissionItem, MissionKind, MissionSource, VehicleMission } from "@/lib/control-center/vehicles/types";
import { buildUpdateExpression, ddb, TABLES } from "./client";

export type CCVehicleMission = VehicleMission;

/** A short content hash of the ordered items, sent in the mission_upload
 *  command so the companion can confirm it fetched the right revision. */
export function missionChecksum(items: MissionItem[]): string {
  const canonical = JSON.stringify(items);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 8);
}

export async function listMissionsByVehicle(vehicleId: string): Promise<CCVehicleMission[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.CC_VEHICLE_MISSIONS,
      IndexName: "vehicle-index",
      KeyConditionExpression: "vehicleId = :vid",
      ExpressionAttributeValues: { ":vid": vehicleId },
      ScanIndexForward: false,
    })
  );
  return (res.Items ?? []) as CCVehicleMission[];
}

export async function getMission(id: string): Promise<CCVehicleMission | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.CC_VEHICLE_MISSIONS, Key: { id } }));
  return (res.Item as CCVehicleMission) ?? null;
}

export async function createMission(input: {
  vehicleId: string;
  name: string;
  items: MissionItem[];
  source: MissionSource;
  kind?: MissionKind;
}): Promise<CCVehicleMission> {
  const now = Date.now();
  const mission: CCVehicleMission = {
    id: createId(),
    vehicleId: input.vehicleId,
    name: input.name,
    items: input.items,
    source: input.source,
    kind: input.kind ?? "mission",
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: TABLES.CC_VEHICLE_MISSIONS, Item: mission }));
  return mission;
}

export async function updateMission(
  id: string,
  patch: Partial<Pick<CCVehicleMission, "name" | "items">>
): Promise<void> {
  const update = buildUpdateExpression({ ...patch, updatedAt: Date.now() });
  if (!update) return;
  await ddb.send(new UpdateCommand({ TableName: TABLES.CC_VEHICLE_MISSIONS, Key: { id }, ...update }));
}

export async function deleteMission(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.CC_VEHICLE_MISSIONS, Key: { id } }));
}

export async function deleteAllForVehicle(vehicleId: string): Promise<void> {
  const missions = await listMissionsByVehicle(vehicleId);
  await Promise.all(missions.map((m) => deleteMission(m.id)));
}
