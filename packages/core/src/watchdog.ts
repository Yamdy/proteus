export type WatchdogState = "healthy" | "warning" | "critical";

export interface HealthFetchResult {
  status: string;
  uptime: number;
  activeChains: number;
  turnCount: number;
  lastTurnDuration: number;
  lastTurnStatus: string | null;
  consecutiveErrors: number;
  lastTurnTimestamp: number | null;
}

export interface WatchdogThresholds {
  maxConsecutiveErrors: number;
  maxTurnDurationMs: number;
  maxInactiveMs: number;
}

export interface AnomalyEvent {
  reason: "consecutive_errors" | "turn_duration" | "inactive" | "fetch_error";
  metrics: HealthFetchResult;
  timestamp: number;
}

export type ExecFileFn = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
export type HealthFetchFn = (url: string) => Promise<HealthFetchResult>;

export interface WatchdogConfig {
  port: number;
  interval: number;
  thresholds: WatchdogThresholds;
  dryRun?: boolean;
  httpFetch?: HealthFetchFn;
  execFile?: ExecFileFn;
  onAnomaly?: (event: AnomalyEvent) => void;
}

export class Watchdog {
  private readonly config: Required<Omit<WatchdogConfig, "onAnomaly">> & { onAnomaly?: (event: AnomalyEvent) => void };
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: WatchdogState = "healthy";

  constructor(config: WatchdogConfig) {
    this.config = {
      port: config.port,
      interval: config.interval,
      thresholds: config.thresholds,
      dryRun: config.dryRun ?? false,
      httpFetch: config.httpFetch ?? (async (url: string) => {
        const res = await globalThis.fetch(url);
        return res.json() as Promise<HealthFetchResult>;
      }),
      execFile: config.execFile ?? (async (cmd: string, args: string[]) => {
        const { execFile: nodeExecFile } = await import("node:child_process");
        return new Promise((resolve, reject) => {
          nodeExecFile(cmd, args, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout, stderr });
          });
        });
      }),
      onAnomaly: config.onAnomaly,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.poll(); }, this.config.interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  getState(): WatchdogState {
    return this.state;
  }

  private async poll(): Promise<void> {
    let metrics: HealthFetchResult;
    try {
      const url = `http://127.0.0.1:${this.config.port}/health`;
      metrics = await this.config.httpFetch(url);
    } catch {
      this.handleAnomaly({
        reason: "fetch_error",
        metrics: {
          status: "unreachable",
          uptime: 0,
          activeChains: 0,
          turnCount: 0,
          lastTurnDuration: 0,
          lastTurnStatus: null,
          consecutiveErrors: 0,
          lastTurnTimestamp: null,
        },
      });
      return;
    }

    const anomaly = this.detectAnomaly(metrics);
    if (anomaly) {
      this.handleAnomaly(anomaly);
    } else {
      this.state = "healthy";
    }
  }

  private detectAnomaly(metrics: HealthFetchResult): Omit<AnomalyEvent, "timestamp"> | null {
    if (metrics.consecutiveErrors >= this.config.thresholds.maxConsecutiveErrors) {
      return { reason: "consecutive_errors", metrics };
    }
    if (metrics.lastTurnDuration > this.config.thresholds.maxTurnDurationMs) {
      return { reason: "turn_duration", metrics };
    }
    if (
      metrics.lastTurnTimestamp !== null &&
      metrics.turnCount > 0 &&
      Date.now() - metrics.lastTurnTimestamp > this.config.thresholds.maxInactiveMs
    ) {
      return { reason: "inactive", metrics };
    }
    return null;
  }

  private handleAnomaly(anomaly: Omit<AnomalyEvent, "timestamp">): void {
    if (anomaly.reason === "fetch_error") {
      this.state = "critical";
    } else if (anomaly.reason === "consecutive_errors" && anomaly.metrics.consecutiveErrors > this.config.thresholds.maxConsecutiveErrors) {
      this.state = "critical";
    } else {
      this.state = "warning";
    }

    const event: AnomalyEvent = { reason: anomaly.reason, metrics: anomaly.metrics, timestamp: Date.now() };
    this.config.onAnomaly?.(event);

    if (!this.config.dryRun) {
      void this.revert();
    }
  }

  private async revert(): Promise<void> {
    try {
      await this.config.execFile("git", ["revert", "HEAD", "--no-edit"]);
    } catch {
      // git revert may fail (no commits, conflict) — watchdog must not crash
    }
  }
}
