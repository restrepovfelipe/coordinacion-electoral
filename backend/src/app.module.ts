import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ResourcesModule } from './resources/resources.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AsignacionModule } from './asignacion/asignacion.module';
import { CoordinadorModule } from './coordinador/coordinador.module.js';
import { ConfirmModule } from './confirm/confirm.module.js';
import { MetricsModule } from './metrics/metrics.module';
import { MustChangePasswordInterceptor } from './common/interceptors/must-change-password.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.local', isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    MetricsModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    PermissionsModule,
    UsersModule,
    AuditModule,
    RealtimeModule,
    ResourcesModule,
    DashboardModule,
    AsignacionModule,
    CoordinadorModule,
    ConfirmModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: MustChangePasswordInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
