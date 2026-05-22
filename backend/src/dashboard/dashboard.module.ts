import { Module } from '@nestjs/common';
import { DashboardController, AdminPrioridadController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { CommonModule } from '../common/common.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

@Module({
  imports: [CommonModule, PrismaModule, RealtimeModule],
  controllers: [DashboardController, AdminPrioridadController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
