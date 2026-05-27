import { randomUUID } from "node:crypto";
import type { AirlineAdapter, BookingDetailInput, BookingListInput, FlightSearchInput, HarnessSession, LoginInput, PortalInput, ProxyConfig } from "./types.js";
import { FlareSolverrClient } from "./flaresolverr.js";

export class SessionManager {
  constructor(private readonly flaresolverr = new FlareSolverrClient()) {}

  async resolve(adapter: AirlineAdapter, proxy?: ProxyConfig): Promise<HarnessSession> {
    const sessionId = `${adapter.code}-${randomUUID()}`;
    await this.flaresolverr.createSession(sessionId, proxy);
    try {
      return await adapter.resolveSession(sessionId, { proxy });
    } catch (error) {
      await this.destroyQuietly(sessionId);
      throw error;
    }
  }

  async withResolvedSession<T>(
    adapter: AirlineAdapter,
    input: FlightSearchInput | LoginInput | BookingListInput | BookingDetailInput | PortalInput,
    fn: (session: HarnessSession) => Promise<T>
  ): Promise<{ sessionId: string; data: T }> {
    const session = await this.resolve(adapter, input.proxy);
    try {
      const data = await fn(session);
      return { sessionId: session.id, data };
    } finally {
      await this.destroyQuietly(session.id);
    }
  }

  async list(): Promise<string[]> {
    return this.flaresolverr.listSessions();
  }

  async destroy(sessionId: string): Promise<void> {
    await this.flaresolverr.destroySession(sessionId);
  }

  private async destroyQuietly(sessionId: string): Promise<void> {
    try {
      await this.destroy(sessionId);
    } catch {
      // Best effort cleanup; caller should receive the original task error.
    }
  }
}
