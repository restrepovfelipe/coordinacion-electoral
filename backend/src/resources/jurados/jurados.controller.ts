import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { JuradosService } from './jurados.service.js';

@ApiTags('jurados')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('jurados')
export class JuradosController {
  constructor(private readonly juradosService: JuradosService) {}

  @Get()
  list(
    @Query('municipioId') municipioId?: string,
    @Query('puestoId') puestoId?: string,
    @Query('search') search?: string,
  ) {
    return this.juradosService.list(
      municipioId ? Number(municipioId) : undefined,
      puestoId   ? Number(puestoId)   : undefined,
      search,
    );
  }

  @Get('stats')
  stats() {
    return this.juradosService.stats();
  }

  @Get('puesto/:puestoId')
  findByPuesto(@Param('puestoId', ParseIntPipe) puestoId: number) {
    return this.juradosService.findByPuesto(puestoId);
  }
}
