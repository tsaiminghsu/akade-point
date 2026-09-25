import type { VehicleCommandMsg } from "@/lib/control-center/vehicles/types";

/**
 * Publishes a command to a companion over AWS IoT Core MQTT. Server-only —
 * must never be imported into a client bundle.
 *
 * The command row is written first and delivery is best-effort: this function
 * never throws. When it returns { published: false } the row stays `pending`
 * and the companion picks the command up from its next telemetry-POST response
 * instead. That fallback is also the entire delivery mechanism when
 * VEHICLE_TRANSPORT !== "iot" (local dev, no IoT Core), so the two environments
 * share one code path.
 */
export async function publishVehicleCommand(
  companionId: string,
  msg: VehicleCommandMsg
): Promise<{ published: boolean; error?: string }> {
  if (process.env.VEHICLE_TRANSPORT !== "iot") return { published: false };

  const endpoint = process.env.IOT_DATA_ENDPOINT;
  if (!endpoint) return { published: false, error: "IOT_DATA_ENDPOINT not set" };

  try {
    // Imported lazily so the SDK is only pulled in when IoT transport is on,
    // and never into a client bundle.
    const { IoTDataPlaneClient, PublishCommand } = await import("@aws-sdk/client-iot-data-plane");
    const client = new IoTDataPlaneClient({
      endpoint,
      region: process.env.AWS_REGION ?? "ap-northeast-1",
    });
    await client.send(
      new PublishCommand({
        topic: `vehicles/${companionId}/cmd`,
        qos: 1,
        payload: Buffer.from(JSON.stringify(msg)),
      })
    );
    return { published: true };
  } catch (err) {
    console.error("publishVehicleCommand failed:", err);
    return { published: false, error: err instanceof Error ? err.message : "publish failed" };
  }
}
