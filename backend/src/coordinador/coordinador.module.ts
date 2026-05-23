import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CoordinadorController } from './coordinador.controller.js';
import { CoordinadorService } from './coordinador.service.js';

@Module({
  imports: [CommonModule, PrismaModule, RealtimeModule],
  controllers: [CoordinadorController],
  providers: [CoordinadorService],
  exports: [CoordinadorService],
})
export class CoordinadorModule {}
