import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { AsignacionController } from './asignacion.controller.js';
import { AsignacionService } from './asignacion.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule, RealtimeModule],
  controllers: [AsignacionController],
  providers: [AsignacionService],
  exports: [AsignacionService],
})
export class AsignacionModule {}
