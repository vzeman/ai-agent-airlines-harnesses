import { config } from "./config.js";
import type { BrowserCookie, ProxyConfig } from "./types.js";

export interface FlareSolverrSolution {
  url: string;
  status: number;
  response?: string;
  cookies?: BrowserCookie[];
  userAgent?: string;
  headers?: Record<string, string>;
}

interface FlareSolverrResponse {
  status: "ok" | "error";
  message: string;
  solution?: FlareSolverrSolution;
  sessions?: string[];
}

export class FlareSolverrClient {
  constructor(private readonly endpoint = config.flaresolverrUrl) {}

  async createSession(session: string, proxy?: ProxyConfig): Promise<void> {
    await this.command({ cmd: "sessions.create", session, proxy });
  }

  async listSessions(): Promise<string[]> {
    const response = await this.command({ cmd: "sessions.list" });
    return response.sessions ?? [];
  }

  async destroySession(session: string): Promise<void> {
    await this.command({ cmd: "sessions.destroy", session });
  }

  async get(params: {
    url: string;
    session?: string;
    maxTimeout?: number;
    waitInSeconds?: number;
    returnOnlyCookies?: boolean;
    returnScreenshot?: boolean;
    disableMedia?: boolean;
    proxy?: ProxyConfig;
  }): Promise<FlareSolverrSolution> {
    const response = await this.command({
      cmd: "request.get",
      maxTimeout: config.defaultMaxTimeoutMs,
      waitInSeconds: config.defaultWaitSeconds,
      ...params
    });
    if (!response.solution) {
      throw new Error("FlareSolverr returned no solution");
    }
    return response.solution;
  }

  async post(params: {
    url: string;
    postData: string;
    session?: string;
    maxTimeout?: number;
    waitInSeconds?: number;
    proxy?: ProxyConfig;
  }): Promise<FlareSolverrSolution> {
    const response = await this.command({
      cmd: "request.post",
      maxTimeout: config.defaultMaxTimeoutMs,
      waitInSeconds: config.defaultWaitSeconds,
      ...params
    });
    if (!response.solution) {
      throw new Error("FlareSolverr returned no solution");
    }
    return response.solution;
  }

  private async command(payload: Record<string, unknown>): Promise<FlareSolverrResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`FlareSolverr HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as FlareSolverrResponse;
    if (data.status !== "ok") {
      throw new Error(data.message || "FlareSolverr command failed");
    }
    return data;
  }
}

export function cookieHeader(cookies: BrowserCookie[], domainHint?: string): string {
  return cookies
    .filter((cookie) => !domainHint || !cookie.domain || domainHint.endsWith(cookie.domain.replace(/^\./, "")))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}
