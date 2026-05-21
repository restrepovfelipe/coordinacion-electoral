import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { TestigosController, TestigosStandaloneController } from './testigos.controller.js';
import { TestigosService } from './testigos.service.js';

@Module({
  imports: [CommonModule, PrismaModule],
  controllers: [TestigosController, TestigosStandaloneController],
  providers: [TestigosService],
})
export class TestigosModule {}
