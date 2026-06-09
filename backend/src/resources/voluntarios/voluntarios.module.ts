import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { VoluntariosController } from './voluntarios.controller.js';
import { VoluntariosService } from './voluntarios.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule],
  controllers: [VoluntariosController],
  providers: [VoluntariosService],
})
export class VoluntariosModule {}
