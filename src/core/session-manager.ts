import { randomUUID } from "node:crypto";
import type { AirlineAdapter, BookingDetailInput, BookingListInput, FlightSearchInput, HarnessSession, LoginInput, PortalInput, ProxyConfig } from "./types.js";
import { FlareSolverrClient } from "./flaresolverr.js";

type SessionInput = FlightSearchInput | LoginInput | BookingListInput | BookingDetailInput | PortalInput;

interface ReusableSessionLease {
  session: HarnessSession;
  expiresAt: number;
  timeout: NodeJS.Timeout;
}

export class SessionManager {
  private readonly reusableSessions = new Map<string, ReusableSessionLease>();

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

  async createReusable(
    adapter: AirlineAdapter,
    options: { proxy?: ProxyConfig; ttlMinutes?: number } = {}
  ): Promise<{ session: HarnessSession; expiresAt: string }> {
    const session = await this.resolve(adapter, options.proxy);
    const ttlMinutes = Math.max(1, Math.min(options.ttlMinutes ?? 30, 240));
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    const timeout = setTimeout(() => {
      this.reusableSessions.delete(session.id);
      void this.destroyQuietly(session.id);
    }, ttlMinutes * 60 * 1000);
    this.reusableSessions.set(session.id, { session, expiresAt, timeout });
    return { session, expiresAt: new Date(expiresAt).toISOString() };
  }

  async withResolvedSession<T>(
    adapter: AirlineAdapter,
    input: SessionInput,
    fn: (session: HarnessSession) => Promise<T>
  ): Promise<{ sessionId: string; data: T }> {
    if (input.taskSessionId) {
      const session = this.getReusable(input.taskSessionId);
      const data = await fn(session);
      return { sessionId: session.id, data };
    }

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

  listReusable(): Array<{ sessionId: string; airline: string; expiresAt: string }> {
    this.cleanupExpiredReusableSessions();
    return [...this.reusableSessions.values()].map((lease) => ({
      sessionId: lease.session.id,
      airline: lease.session.airline,
      expiresAt: new Date(lease.expiresAt).toISOString()
    }));
  }

  async destroy(sessionId: string): Promise<void> {
    const lease = this.reusableSessions.get(sessionId);
    if (lease) {
      clearTimeout(lease.timeout);
      this.reusableSessions.delete(sessionId);
    }
    await this.flaresolverr.destroySession(sessionId);
  }

  private getReusable(sessionId: string): HarnessSession {
    this.cleanupExpiredReusableSessions();
    const lease = this.reusableSessions.get(sessionId);
    if (!lease) {
      throw new Error(`Reusable task session was not found or has expired: ${sessionId}`);
    }
    return lease.session;
  }

  private cleanupExpiredReusableSessions(): void {
    const now = Date.now();
    for (const [sessionId, lease] of this.reusableSessions.entries()) {
      if (lease.expiresAt > now) continue;
      clearTimeout(lease.timeout);
      this.reusableSessions.delete(sessionId);
      void this.destroyQuietly(sessionId);
    }
  }

  private async destroyQuietly(sessionId: string): Promise<void> {
    try {
      await this.destroy(sessionId);
    } catch {
      // Best effort cleanup; caller should receive the original task error.
    }
  }
}
