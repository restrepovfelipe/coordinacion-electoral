import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MetricServiceClient, protos } from '@google-cloud/monitoring';

type ITimeSeries = protos.google.monitoring.v3.ITimeSeries;

const METRIC_PREFIX = 'custom.googleapis.com/electoral';
const PROJECT_ID = process.env['GCP_PROJECT_ID'] ?? 'coordinacion-electoral';

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private client?: MetricServiceClient;

  private sseConnections = 0;
  private activeRequests = 0;

  // Per-flush delta counters; cleared after each flush
  private requestBuffer = new Map<string, number>();
  private mutationBuffer = new Map<string, number>();

  private flushTimer?: NodeJS.Timeout;
  private lastFlushMs = Date.now();

  onModuleInit(): void {
    try {
      this.client = new MetricServiceClient();
      this.logger.log('Cloud Monitoring client initialised');
    } catch (err) {
      this.logger.warn(`Cloud Monitoring client init failed — metrics disabled: ${(err as Error).message}`);
    }
    this.flushTimer = setInterval(() => void this.flush(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  incrementSse(): void {
    this.sseConnections++;
  }

  decrementSse(): void {
    if (this.sseConnections > 0) this.sseConnections--;
  }

  incrementActiveRequests(): void {
    this.activeRequests++;
  }

  decrementActiveRequests(): void {
    if (this.activeRequests > 0) this.activeRequests--;
  }

  recordRequest(role: string, endpoint: string, status: string): void {
    const key = `${role}|${endpoint}|${status}`;
    this.requestBuffer.set(key, (this.requestBuffer.get(key) ?? 0) + 1);
  }

  recordMutation(resource: string, role: string): void {
    const key = `${resource}|${role}`;
    this.mutationBuffer.set(key, (this.mutationBuffer.get(key) ?? 0) + 1);
  }

  async flush(): Promise<void> {
    if (!this.client) return;

    const nowMs = Date.now();
    const intervalStartSecs = Math.floor(this.lastFlushMs / 1000);
    const intervalEndSecs = Math.floor(nowMs / 1000);
    this.lastFlushMs = nowMs;

    const series: ITimeSeries[] = [];

    // Gauges — always emitted
    series.push(
      buildGauge('sse_active_connections', {}, this.sseConnections, intervalEndSecs),
    );
    series.push(
      buildGauge('db_pool_size', {}, this.activeRequests, intervalEndSecs),
    );

    // Delta counters — only emitted when non-zero; buffer cleared after snapshot
    const reqSnap = new Map(this.requestBuffer);
    this.requestBuffer.clear();
    for (const [key, count] of reqSnap) {
      const [role, endpoint, status] = key.split('|');
      series.push(
        buildDelta(
          'api_requests_by_role',
          { role: role ?? '', endpoint: endpoint ?? '', status: status ?? '' },
          count,
          intervalStartSecs,
          intervalEndSecs,
        ),
      );
    }

    const mutSnap = new Map(this.mutationBuffer);
    this.mutationBuffer.clear();
    for (const [key, count] of mutSnap) {
      const [resource, role] = key.split('|');
      series.push(
        buildDelta(
          'mutation_count_by_resource',
          { resource: resource ?? '', role: role ?? '' },
          count,
          intervalStartSecs,
          intervalEndSecs,
        ),
      );
    }

    try {
      await this.client.createTimeSeries({
        name: `projects/${PROJECT_ID}`,
        timeSeries: series,
      });
      this.logger.debug(`Flushed ${series.length} metric series`);
    } catch (err) {
      // Log at warn — non-fatal; Cloud Monitoring may be unavailable in local dev
      this.logger.warn(`Metrics flush failed: ${(err as Error).message}`);
    }
  }
}

function buildGauge(
  name: string,
  labels: Record<string, string>,
  value: number,
  endSecs: number,
): ITimeSeries {
  return {
    metric: { type: `${METRIC_PREFIX}/${name}`, labels },
    resource: { type: 'global', labels: { project_id: PROJECT_ID } },
    points: [
      {
        interval: { endTime: { seconds: endSecs } },
        value: { int64Value: value },
      },
    ],
  };
}

function buildDelta(
  name: string,
  labels: Record<string, string>,
  value: number,
  startSecs: number,
  endSecs: number,
): ITimeSeries {
  return {
    metric: { type: `${METRIC_PREFIX}/${name}`, labels },
    resource: { type: 'global', labels: { project_id: PROJECT_ID } },
    points: [
      {
        interval: {
          startTime: { seconds: startSecs },
          endTime: { seconds: endSecs },
        },
        value: { int64Value: value },
      },
    ],
  };
}
