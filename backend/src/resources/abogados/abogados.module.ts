import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AbogadosController, AbogadosStandaloneController } from './abogados.controller.js';
import { AbogadosService } from './abogados.service.js';

@Module({
  imports: [CommonModule, PrismaModule],
  controllers: [AbogadosController, AbogadosStandaloneController],
  providers: [AbogadosService],
})
export class AbogadosModule {}
