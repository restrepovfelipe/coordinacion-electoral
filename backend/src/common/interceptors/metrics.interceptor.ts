import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import type { Request, Response } from 'express';
import type { UserWithScopes } from '../types/request-with-user.js';
import { MetricsService } from '../../metrics/metrics.service.js';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

// Paths excluded from per-request tracking
const EXCLUDED_PREFIXES = ['/api/events', '/api/healthz', '/api/docs'];

function extractResource(url: string): string {
  // /api/testigos/123?foo=bar → testigos
  const match = /\/api\/([a-z]+)/i.exec(url);
  return match?.[1] ?? 'unknown';
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: UserWithScopes }>();
    const url: string = req.url ?? '';

    const isExcluded = EXCLUDED_PREFIXES.some((p) => url.startsWith(p));
    if (isExcluded) {
      return next.handle();
    }

    const method = req.method ?? '';
    const role: string = req.user?.role ?? 'anonymous';
    const endpoint = extractResource(url);

    this.metrics.incrementActiveRequests();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const status = String(res.statusCode ?? 200);
          this.metrics.recordRequest(role, endpoint, status);
          if (WRITE_METHODS.has(method)) {
            this.metrics.recordMutation(endpoint, role);
          }
        },
        error: (err: unknown) => {
          const status =
            typeof err === 'object' && err !== null && 'status' in err
              ? String((err as { status: unknown }).status)
              : '500';
          this.metrics.recordRequest(role, endpoint, status);
        },
      }),
      finalize(() => this.metrics.decrementActiveRequests()),
    );
  }
}
