import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { JuradosController } from './jurados.controller.js';
import { JuradosService } from './jurados.service.js';

@Module({
  imports: [CommonModule, PrismaModule],
  controllers: [JuradosController],
  providers: [JuradosService],
  exports: [JuradosService],
})
export class JuradosModule {}
