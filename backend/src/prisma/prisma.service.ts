import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper over PrismaClient, injectable across the app via the @Global
 * PrismaModule.
 *
 * Connection is left lazy on purpose — Prisma opens the pool on the first
 * query. Eager `$connect()` in onModuleInit is deliberately omitted so the
 * backend boots before Cloud SQL exists (the instance is provisioned at T09).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
