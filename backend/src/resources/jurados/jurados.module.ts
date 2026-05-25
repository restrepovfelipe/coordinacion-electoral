import { Module } from '@nestjs/common';
import { JuradosController } from './jurados.controller.js';
import { JuradosService } from './jurados.service.js';

@Module({
  controllers: [JuradosController],
  providers: [JuradosService],
  exports: [JuradosService],
})
export class JuradosModule {}
