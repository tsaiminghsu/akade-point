import { describe, expect, it } from "vitest";

import { videoUrlProblem, whepEndpoint } from "./whep";

describe("WHEP helpers", () => {
  it("accepts a MediaMTX path URL or its /whep endpoint", () => {
    expect(whepEndpoint("https://drone.ts.net:8889/cam")).toBe("https://drone.ts.net:8889/cam/whep");
    expect(whepEndpoint("https://drone.ts.net:8889/cam/")).toBe("https://drone.ts.net:8889/cam/whep");
    expect(whepEndpoint("https://drone.ts.net:8889/cam/whep")).toBe("https://drone.ts.net:8889/cam/whep");
  });

  it("spots URLs the page cannot use", () => {
    expect(videoUrlProblem("http://192.168.1.20:8889/cam", "https:")).toBe("mixedContent");
    expect(videoUrlProblem("http://localhost:8889/cam", "https:")).toBeNull();
    expect(videoUrlProblem("http://192.168.1.20:8889/cam", "http:")).toBeNull();
    expect(videoUrlProblem("rtsp://x/cam", "http:")).toBe("badUrl");
    expect(videoUrlProblem("nope", "http:")).toBe("badUrl");
  });
});
