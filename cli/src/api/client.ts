// REST + MCP API client for talking to a clawworld server.
//
// Uses Node's built-in fetch (Node 18+). The CLI never touches the server's
// SQLite file directly — it always goes through HTTP. This keeps the CLI
// thin and avoids runtime dependencies on bun:sqlite.

export interface ApiClientOptions {
  serverUrl: string;
  authToken?: string;
  timeoutMs?: number;
}

export interface RegisterResult {
  auth_token: string;
  lobster: {
    id: number;
    name: string;
    job: string;
    location: string;
    coins: number;
    reputation: number;
    forge_score: number;
  };
  card: unknown;
  hint?: string;
}

export interface LobsterPublic {
  id: number;
  name: string;
  job: string;
  bio: string;
  role: string;
  location: string;
  coins: number;
  forge_score: number;
  reputation: number;
  specialty: Record<string, number>;
  badges: string[];
  personality?: string[];
  honor_tags?: string[];
  hunger?: number;
  warmth?: number;
  fashion?: unknown[];
  skills?: Record<string, number>;
  profession?: string;
  prof_level?: number;
}

export interface WorldStats {
  lobsters: number;
  coins_in_circulation: number;
  open_tasks: number;
  completed_tasks: number;
  locations: number;
  events: number;
}

export class ApiClient {
  private serverUrl: string;
  private authToken?: string;
  private timeoutMs: number;

  constructor(opts: ApiClientOptions) {
    this.serverUrl = opts.serverUrl.replace(/\/+$/, "");
    this.authToken = opts.authToken;
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  // ---- REST endpoints ----

  async health(): Promise<{ ok: boolean; service: string; era?: string }> {
    return this.getJson("/api/health");
  }

  async worldStats(): Promise<WorldStats> {
    return this.getJson("/api/world/stats");
  }

  async worldMap(): Promise<{
    locations: Array<{ id: string; name: string; description: string; exits: string[]; lobsters_here: number }>;
  }> {
    return this.getJson("/api/world/map");
  }

  async worldEvents(limit: number = 30): Promise<{ events: unknown[]; count: number }> {
    return this.getJson(`/api/world/events?limit=${limit}`);
  }

  async lobsterByName(name: string): Promise<{ lobster: LobsterPublic }> {
    return this.getJson(`/api/lobsters/${encodeURIComponent(name)}`);
  }

  async topLobsters(by: string = "reputation", limit: number = 10): Promise<{ by: string; lobsters: LobsterPublic[] }> {
    return this.getJson(`/api/lobsters/top?by=${by}&limit=${limit}`);
  }

  async tasks(status: string = "open", limit: number = 30): Promise<{ tasks: unknown[]; count: number }> {
    return this.getJson(`/api/tasks?status=${status}&limit=${limit}`);
  }

  // ---- MCP tool calls ----

  /**
   * Call an MCP tool via the /mcp endpoint.
   * This is a simplified wrapper — in production the CLI should use the
   * official MCP SDK client. For now we post raw MCP JSON-RPC.
   */
  async callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };
    const res = await this.postJson<{ result: { content: Array<{ type: string; text: string }> } }>(
      "/mcp",
      body,
    );
    // MCP wraps results in content[].text as JSON-stringified payload
    const content = res.result?.content?.[0];
    if (!content) throw new Error(`empty MCP response from ${toolName}`);
    try {
      return JSON.parse(content.text) as T;
    } catch {
      return content.text as unknown as T;
    }
  }

  async registerLobster(args: {
    name: string;
    job: string;
    bio?: string;
  }): Promise<RegisterResult> {
    return this.callTool<RegisterResult>("register_lobster", args);
  }

  async whoami(): Promise<{ ok: boolean; lobster: LobsterPublic }> {
    if (!this.authToken) throw new Error("not authenticated");
    return this.callTool("whoami", { auth_token: this.authToken });
  }

  async myStats(): Promise<Record<string, unknown>> {
    if (!this.authToken) throw new Error("not authenticated");
    return this.callTool("my_stats", { auth_token: this.authToken });
  }

  // ---- internals ----

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchWithTimeout(this.serverUrl + path, { method: "GET" });
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchWithTimeout(this.serverUrl + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
