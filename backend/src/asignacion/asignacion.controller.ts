import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role, ScopeType } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ScopeGuard } from '../common/guards/scope.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequireScope } from '../common/decorators/require-scope.decorator.js';
import { AsignacionService } from './asignacion.service.js';

@ApiTags('asignacion')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('asignacion')
export class AsignacionController {
  constructor(private readonly asignacionService: AsignacionService) {}

  @Post('recalcular/:puestoId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, ScopeGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
    Role.PUESTO_COORDINATOR,
  )
  @RequireScope(ScopeType.PUESTO, 'puestoId')
  recalcular(@Param('puestoId', ParseIntPipe) puestoId: number) {
    return this.asignacionService.recalcularPuesto(puestoId);
  }

  @Get('puesto/:puestoId/pdf')
  @UseGuards(RolesGuard, ScopeGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
    Role.PUESTO_COORDINATOR,
  )
  @RequireScope(ScopeType.PUESTO, 'puestoId')
  async pdf(
    @Param('puestoId', ParseIntPipe) puestoId: number,
    @Res() res: Response,
  ) {
    const stream = await this.asignacionService.generarPdfPuesto(puestoId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="asignacion-puesto-${puestoId}.pdf"`);
    stream.pipe(res);
  }
}
