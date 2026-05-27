import { SessionManager } from "./core/session-manager.js";
import { getAdapter } from "./airlines/index.js";
import { flightSearchSchema, resolveSessionSchema } from "./validation.js";

const [command, rawJson = "{}"] = process.argv.slice(2);
const sessions = new SessionManager();

try {
  if (command === "resolve-session") {
    const input = resolveSessionSchema.parse(JSON.parse(rawJson));
    const session = await sessions.resolve(getAdapter(input.airline), input.proxy);
    console.log(
      JSON.stringify(
        {
          status: "ok",
          sessionId: session.id,
          cookieCount: session.cookies.length,
          userAgent: session.userAgent
        },
        null,
        2
      )
    );
  } else if (command === "find-flights") {
    const input = flightSearchSchema.parse(JSON.parse(rawJson));
    const adapter = getAdapter(input.airline);
    const result = await sessions.withResolvedSession(adapter, input, (session) => adapter.findFlights(input, session));
    console.log(JSON.stringify({ status: "ok", sessionId: result.sessionId, flights: result.data }, null, 2));
  } else {
    console.error("Usage:");
    console.error("  npm run cli -- resolve-session '{\"airline\":\"ryanair\"}'");
    console.error("  npm run cli -- find-flights '{\"airline\":\"ryanair\",\"origin\":\"BTS\",\"destination\":\"STN\",\"dateOut\":\"2026-06-15\"}'");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
