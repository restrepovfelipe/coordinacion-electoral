import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { MovilidadController } from './movilidad.controller.js';
import { MovilidadService } from './movilidad.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule, RealtimeModule],
  controllers: [MovilidadController],
  providers: [MovilidadService],
})
export class MovilidadModule {}
