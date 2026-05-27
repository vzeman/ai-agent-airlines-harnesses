import http from "node:http";
import { config } from "./core/config.js";
import { ManualInterventionRequired } from "./core/errors.js";
import { SessionManager } from "./core/session-manager.js";
import { UnsupportedRouteError } from "./core/unsupported-route.js";
import type { TaskResult } from "./core/types.js";
import { getAdapter, listAirlines } from "./airlines/index.js";
import { capturePricingScreenshot } from "./airlines/rendered-browser.js";
import { pricingScreenshotUrl } from "./airlines/screenshot-url.js";
import { assertRouteSupported, getAirlineSupport, listAirlineSupport } from "./airlines/support.js";
import { flightSearchSchema, resolveSessionSchema } from "./validation.js";

const sessions = new SessionManager();

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, 500, {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    } satisfies TaskResult<never>);
  }
});

server.listen(config.port, () => {
  console.log(`airline harness listening on :${config.port}`);
});

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", airlines: listAirlines() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/airlines") {
    sendJson(res, 200, { status: "ok", airlines: listAirlineSupport() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/airlines/") && url.pathname.endsWith("/support")) {
    const airline = decodeURIComponent(url.pathname.slice("/airlines/".length, -"/support".length));
    if (!listAirlines().includes(airline as never)) {
      sendJson(res, 404, { status: "error", message: "unknown airline" });
      return;
    }
    sendJson(res, 200, { status: "ok", support: getAirlineSupport(airline as never) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/sessions") {
    sendJson(res, 200, { status: "ok", sessions: await sessions.list() });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.slice("/sessions/".length));
    await sessions.destroy(sessionId);
    sendJson(res, 200, { status: "ok", destroyed: sessionId });
    return;
  }

  if (req.method === "POST" && url.pathname === "/session/resolve") {
    const body = resolveSessionSchema.parse(await readJson(req));
    const session = await sessions.resolve(getAdapter(body.airline), body.proxy);
    sendJson(res, 200, {
      status: "ok",
      sessionId: session.id,
      data: {
        airline: session.airline,
        cookieCount: session.cookies.length,
        userAgent: session.userAgent
      }
    } satisfies TaskResult<unknown>);
    return;
  }

  if (req.method === "POST" && url.pathname === "/task/find-flights") {
    const input = flightSearchSchema.parse(await readJson(req));
    const adapter = getAdapter(input.airline);
    try {
      assertRouteSupported(input);
      const result = await sessions.withResolvedSession(adapter, input, async (session) => {
        const flights = await adapter.findFlights(input, session);
        const screenshot = input.includeScreenshot
          ? await capturePricingScreenshot({
              airline: adapter.code,
              url: pricingScreenshotUrl(adapter.code, input),
              input,
              session,
              description: `Pricing evidence page for ${adapter.code} ${input.origin.toUpperCase()}-${input.destination.toUpperCase()} ${input.dateOut}`
            })
          : undefined;
        return { flights, screenshot };
      });
      sendJson(res, 200, {
        status: "ok",
        sessionId: result.sessionId,
        data: {
          count: result.data.flights.length,
          flights: result.data.flights,
          screenshot: result.data.screenshot
        }
      } satisfies TaskResult<unknown>);
    } catch (error) {
      if (error instanceof ManualInterventionRequired) {
        sendJson(res, 200, {
          status: "manual_intervention_required",
          message: error.message,
          diagnostics: error.diagnostics
        } satisfies TaskResult<unknown>);
        return;
      }
      if (error instanceof UnsupportedRouteError) {
        sendJson(res, 200, {
          status: "unsupported_route",
          message: error.message,
          diagnostics: error.diagnostics
        } satisfies TaskResult<unknown>);
        return;
      }
      throw error;
    }
    return;
  }

  sendJson(res, 404, { status: "error", message: "not found" });
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}
