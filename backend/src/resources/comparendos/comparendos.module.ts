import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { ComparendosController } from './comparendos.controller.js';
import { ComparendosService } from './comparendos.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule],
  controllers: [ComparendosController],
  providers: [ComparendosService],
})
export class ComparendosModule {}
