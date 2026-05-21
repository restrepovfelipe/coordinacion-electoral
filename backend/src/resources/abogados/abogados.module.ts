import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { AbogadosController, AbogadosStandaloneController } from './abogados.controller.js';
import { AbogadosService } from './abogados.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule, RealtimeModule],
  controllers: [AbogadosController, AbogadosStandaloneController],
  providers: [AbogadosService],
})
export class AbogadosModule {}
