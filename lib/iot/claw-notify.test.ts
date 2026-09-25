import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const iotSend = vi.fn();
vi.mock("@aws-sdk/client-iot-data-plane", () => ({
  IoTDataPlaneClient: vi.fn(function (this: { send: typeof iotSend }, opts: unknown) {
    this.send = iotSend;
    iotClientOpts.push(opts);
  }),
  PublishCommand: vi.fn(function (this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));
const iotClientOpts: unknown[] = [];

const mqttPublish = vi.fn();
const mqttEnd = vi.fn();
const connectAsync = vi.fn();
vi.mock("mqtt", () => ({ connectAsync: (...args: unknown[]) => connectAsync(...args) }));

import { boardBrokerUri, clawNotifyMode, notifyClawConfig } from "./claw-notify";

const ENV_KEYS = ["CLAW_CONFIG_NOTIFY", "IOT_DATA_ENDPOINT", "AWS_REGION", "CLAW_MQTT_URL", "CLAW_MQTT_DEVICE_URL"];
const saved: Record<string, string | undefined> = {};
const targets = [
  { machineId: "m1", sha: "00000000000aaa", rev: 3 },
  { machineId: "m2", sha: "00000000000bbb", rev: 1 },
];

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  iotSend.mockReset().mockResolvedValue({});
  iotClientOpts.length = 0;
  mqttPublish.mockReset().mockResolvedValue(undefined);
  mqttEnd.mockReset().mockResolvedValue(undefined);
  connectAsync.mockReset().mockResolvedValue({ publishAsync: mqttPublish, endAsync: mqttEnd });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("mode", () => {
  it("is off unless set to iot or mqtt", async () => {
    expect(clawNotifyMode()).toBe("off");
    process.env.CLAW_CONFIG_NOTIFY = "yes";
    expect(clawNotifyMode()).toBe("off");
    expect(await notifyClawConfig(targets)).toEqual({ mode: "off", sent: 0, failed: 0 });
    expect(iotSend).not.toHaveBeenCalled();
    expect(connectAsync).not.toHaveBeenCalled();
  });

  it("tells boards where to connect", () => {
    expect(boardBrokerUri()).toBeNull();
    process.env.CLAW_CONFIG_NOTIFY = "iot";
    process.env.IOT_DATA_ENDPOINT = "https://abc-ats.iot.ap-northeast-1.amazonaws.com";
    expect(boardBrokerUri()).toBe("mqtts://abc-ats.iot.ap-northeast-1.amazonaws.com:8883");
    process.env.CLAW_CONFIG_NOTIFY = "mqtt";
    process.env.CLAW_MQTT_URL = "mqtt://localhost:1883";
    expect(boardBrokerUri()).toBe("mqtt://localhost:1883");
    process.env.CLAW_MQTT_DEVICE_URL = "mqtt://192.168.1.20:1883";
    expect(boardBrokerUri()).toBe("mqtt://192.168.1.20:1883");
  });
});

describe("iot", () => {
  beforeEach(() => {
    process.env.CLAW_CONFIG_NOTIFY = "iot";
    process.env.IOT_DATA_ENDPOINT = "abc-ats.iot.ap-northeast-1.amazonaws.com";
  });

  it("publishes a QoS 1 notice per machine on its own topic", async () => {
    expect(await notifyClawConfig(targets)).toEqual({ mode: "iot", sent: 2, failed: 0 });
    const inputs = iotSend.mock.calls.map(([cmd]) => (cmd as { input: { topic: string; qos: number; payload: Buffer } }).input);
    expect(inputs.map((i) => i.topic)).toEqual(["claw/m1/config", "claw/m2/config"]);
    expect(inputs.every((i) => i.qos === 1)).toBe(true);
    expect(JSON.parse(inputs[0].payload.toString())).toEqual({ v: 1, sha: "00000000000aaa", rev: 3 });
    expect(iotClientOpts[0]).toMatchObject({ endpoint: "https://abc-ats.iot.ap-northeast-1.amazonaws.com" });
  });

  it("counts failures instead of throwing", async () => {
    iotSend.mockRejectedValueOnce(new Error("AccessDenied"));
    expect(await notifyClawConfig(targets)).toEqual({ mode: "iot", sent: 1, failed: 1 });
  });

  it("sends nothing without an endpoint", async () => {
    delete process.env.IOT_DATA_ENDPOINT;
    expect(await notifyClawConfig(targets)).toEqual({ mode: "iot", sent: 0, failed: 2 });
    expect(iotSend).not.toHaveBeenCalled();
  });
});

describe("mqtt", () => {
  beforeEach(() => {
    process.env.CLAW_CONFIG_NOTIFY = "mqtt";
    process.env.CLAW_MQTT_URL = "mqtt://localhost:1883";
  });

  it("uses one connection for every notice and closes it", async () => {
    expect(await notifyClawConfig(targets)).toEqual({ mode: "mqtt", sent: 2, failed: 0 });
    expect(connectAsync).toHaveBeenCalledTimes(1);
    expect(connectAsync.mock.calls[0][0]).toBe("mqtt://localhost:1883");
    expect(mqttPublish.mock.calls.map((c) => c[0])).toEqual(["claw/m1/config", "claw/m2/config"]);
    expect(mqttPublish.mock.calls[0][2]).toEqual({ qos: 1 });
    expect(mqttEnd).toHaveBeenCalledTimes(1);
  });

  it("survives a broker that refuses the connection", async () => {
    connectAsync.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await notifyClawConfig(targets)).toEqual({ mode: "mqtt", sent: 0, failed: 2 });
  });

  it("still closes the connection when a publish fails", async () => {
    mqttPublish.mockRejectedValueOnce(new Error("broker gone"));
    expect(await notifyClawConfig(targets)).toEqual({ mode: "mqtt", sent: 1, failed: 1 });
    expect(mqttEnd).toHaveBeenCalledTimes(1);
  });

  it("gives up on a broker that never answers", async () => {
    vi.useFakeTimers();
    connectAsync.mockReturnValueOnce(new Promise(() => undefined));
    const pending = notifyClawConfig(targets);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toEqual({ mode: "mqtt", sent: 0, failed: 2 });
    vi.useRealTimers();
  });
});
