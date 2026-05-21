import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [CommonModule, PermissionsModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
