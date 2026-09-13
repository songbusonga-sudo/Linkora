const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function allowedRequestOrigin(req: Request, configuredOrigin?: string) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(req.url);
    const expected = new URL(configuredOrigin || target.origin);
    if (origin !== source.origin) return false;
    if (origin === expected.origin) return true;
    // Local host aliases share this app, but other ports, schemes and hosts do not.
    return [source, target, expected].every((url) =>
      loopbackHosts.has(url.hostname) &&
      url.protocol === expected.protocol && url.port === expected.port,
    );
  } catch {
    return false;
  }
}
