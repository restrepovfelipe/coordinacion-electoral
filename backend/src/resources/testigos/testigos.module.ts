import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { AsignacionModule } from '../../asignacion/asignacion.module.js';
import { TestigosController, TestigosStandaloneController } from './testigos.controller.js';
import { TestigosService } from './testigos.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule, RealtimeModule, AsignacionModule],
  controllers: [TestigosController, TestigosStandaloneController],
  providers: [TestigosService],
})
export class TestigosModule {}
