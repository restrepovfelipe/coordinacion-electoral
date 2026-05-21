import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Client } from 'pg';
import {
  EMPTY,
  from,
  interval,
  merge,
  Observable,
  Subject,
  mergeMap,
  map,
  of,
} from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ScopeType } from '@prisma/client';
import { PermissionsService } from '../permissions/permissions.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';
import { AppEvent } from './types/app-event.interface.js';

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private pgClient!: Client;
  private readonly subject = new Subject<AppEvent>();

  constructor(
    private readonly permissions: PermissionsService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.pgClient = new Client({ connectionString: process.env['DATABASE_URL'] });
    await this.pgClient.connect();
    await this.pgClient.query('LISTEN app_events');
    this.pgClient.on('notification', (msg) => {
      if (msg.channel === 'app_events' && msg.payload) {
        try {
          const event = JSON.parse(msg.payload) as AppEvent;
          this.subject.next(event);
        } catch {
          // ignore malformed payloads
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pgClient.end();
  }

  async notify(event: AppEvent): Promise<void> {
    await this.pgClient.query(
      `SELECT pg_notify('app_events', $1)`,
      [JSON.stringify(event)],
    );
  }

  subscribeUser(user: UserWithScopes): Observable<MessageEvent> {
    this.metrics.incrementSse();

    const events$ = this.subject.asObservable().pipe(
      mergeMap((event: AppEvent) =>
        from(this.canUserSeeEvent(user, event)).pipe(
          mergeMap((allowed) =>
            allowed
              ? of({ data: JSON.stringify(event) } as MessageEvent)
              : EMPTY,
          ),
        ),
      ),
    );

    const heartbeat$ = interval(25000).pipe(
      map(() => ({ data: 'heartbeat' } as MessageEvent)),
    );

    return merge(events$, heartbeat$).pipe(
      finalize(() => this.metrics.decrementSse()),
    );
  }

  private async canUserSeeEvent(
    user: UserWithScopes,
    event: AppEvent,
  ): Promise<boolean> {
    if (event.puestoId !== undefined) {
      return this.permissions.canAccess(user, ScopeType.PUESTO, event.puestoId);
    }
    if (event.municipioId !== undefined) {
      return this.permissions.canAccess(user, ScopeType.MUNICIPIO, event.municipioId);
    }
    if (event.scopeType !== undefined && event.scopeId !== undefined) {
      return this.permissions.canAccess(
        user,
        event.scopeType as ScopeType,
        event.scopeId,
      );
    }
    return true;
  }
}
