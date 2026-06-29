export function resolveRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = forwardedProto || (isLocalhost ? "http" : "https");
    return `${proto}://${host}`;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return "https://localhost:3000";
  }
}
