import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PermissionsModule } from '../../permissions/permissions.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { RefrigeriosController } from './refrigerios.controller.js';
import { RefrigeriosService } from './refrigerios.service.js';

@Module({
  imports: [CommonModule, PrismaModule, PermissionsModule, RealtimeModule],
  controllers: [RefrigeriosController],
  providers: [RefrigeriosService],
})
export class RefrigeriosModule {}
