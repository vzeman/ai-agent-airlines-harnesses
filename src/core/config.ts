export const config = {
  port: numberFromEnv("PORT", 8787),
  flaresolverrUrl: process.env.FLARESOLVERR_URL ?? "http://localhost:8191/v1",
  browserWsEndpoint: process.env.BROWSER_WS_ENDPOINT,
  sessionTtlMinutes: numberFromEnv("SESSION_TTL_MINUTES", 10),
  defaultMaxTimeoutMs: numberFromEnv("DEFAULT_MAX_TIMEOUT_MS", 90_000),
  defaultWaitSeconds: numberFromEnv("DEFAULT_WAIT_SECONDS", 3),
  renderedFlowTimeoutMs: numberFromEnv("RENDERED_FLOW_TIMEOUT_MS", 45_000),
  renderedFlowSettleMs: numberFromEnv("RENDERED_FLOW_SETTLE_MS", 8_000)
};

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
