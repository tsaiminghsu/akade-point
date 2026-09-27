/**
 * Minimal WHEP (WebRTC-HTTP Egress Protocol) player, which is what MediaMTX
 * serves at http(s)://host:8889/<path>/whep. One POST of the SDP offer, the
 * SDP answer back, then plain WebRTC. Non-trickle: we wait (briefly) for ICE
 * gathering so the offer carries its candidates, which keeps the server side
 * to a single request. Browser-only.
 */

export type WhepStatus = "idle" | "connecting" | "playing" | "error";

export interface WhepSession {
  stop: () => void;
}

/** Explains why a page could not play a URL before trying, or null. */
export function videoUrlProblem(url: string, pageProtocol: string): "badUrl" | "mixedContent" | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "badUrl";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "badUrl";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (pageProtocol === "https:" && u.protocol === "http:" && !loopback) return "mixedContent";
  return null;
}

/** MediaMTX takes the path's page URL or its /whep endpoint; accept either. */
export function whepEndpoint(url: string): string {
  const u = new URL(url);
  if (!u.pathname.endsWith("/whep")) u.pathname = `${u.pathname.replace(/\/+$/, "")}/whep`;
  return u.toString();
}

function waitForIce(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, ms);
  });
}

export async function playWhep(
  url: string,
  video: HTMLVideoElement,
  onStatus: (s: WhepStatus, detail?: string) => void
): Promise<WhepSession> {
  const endpoint = whepEndpoint(url);
  const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
  let resource: string | null = null;
  let stopped = false;

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = (ev) => {
    if (video.srcObject !== ev.streams[0]) video.srcObject = ev.streams[0];
  };
  pc.onconnectionstatechange = () => {
    if (stopped) return;
    if (pc.connectionState === "connected") onStatus("playing");
    else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") onStatus("error", pc.connectionState);
  };

  const stop = () => {
    stopped = true;
    pc.close();
    video.srcObject = null;
    // Tell the server to drop the session (best effort).
    if (resource) void fetch(resource, { method: "DELETE" }).catch(() => undefined);
  };

  onStatus("connecting");
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc, 1500);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? offer.sdp,
    });
    if (res.status !== 201 && res.status !== 200) {
      onStatus("error", `HTTP ${res.status}`);
      pc.close();
      return { stop };
    }
    const location = res.headers.get("Location");
    if (location) resource = new URL(location, endpoint).toString();
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  } catch (err) {
    onStatus("error", err instanceof Error ? err.message : "failed");
    pc.close();
  }
  return { stop };
}
