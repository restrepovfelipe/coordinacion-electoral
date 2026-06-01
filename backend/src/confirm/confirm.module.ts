import { Module } from '@nestjs/common';
import { ConfirmController } from './confirm.controller.js';
import { ConfirmService } from './confirm.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [ConfirmController],
  providers: [ConfirmService],
})
export class ConfirmModule {}
