#!/usr/bin/env node
/**
 * A throwaway MQTT broker for trying claw config notices locally (no AWS IoT,
 * no auth, nothing kept on disk). Logs who connects, subscribes and publishes.
 *
 *   npm run mqtt:dev                    # listens on 0.0.0.0:1883
 *   MQTT_PORT=1884 npm run mqtt:dev
 *
 * Then run the app with CLAW_CONFIG_NOTIFY=mqtt and
 * CLAW_MQTT_URL=mqtt://localhost:1883. A real ESP32 on the LAN connects to
 * mqtt://<this computer's IP>:1883 (set CLAW_MQTT_DEVICE_URL so the setup page
 * shows that address).
 */
import { createServer } from "node:net";
import { Aedes } from "aedes";

const port = Number(process.env.MQTT_PORT ?? 1883);
const stamp = () => new Date().toLocaleTimeString();

const broker = await Aedes.createBroker();
broker.on("client", (client) => console.log(`[${stamp()}] connect    ${client?.id}`));
broker.on("clientDisconnect", (client) => console.log(`[${stamp()}] disconnect ${client?.id}`));
broker.on("subscribe", (subs, client) =>
  console.log(`[${stamp()}] subscribe  ${client?.id} -> ${subs.map((s) => s.topic).join(", ")}`)
);
broker.on("publish", (packet, client) => {
  // Skip the broker's own $SYS heartbeats.
  if (!client) return;
  console.log(`[${stamp()}] publish    ${client.id} -> ${packet.topic} ${packet.payload.toString()}`);
});

const server = createServer(broker.handle);
server.listen(port, "0.0.0.0", () => console.log(`MQTT dev broker listening on 0.0.0.0:${port}`));

const stop = () => {
  server.close();
  broker.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
