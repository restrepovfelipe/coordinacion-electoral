import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { ScopeGuard } from '../../common/guards/scope.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScope } from '../../common/decorators/require-scope.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { AbogadosService } from './abogados.service.js';
import { CreateAbogadoDto } from './dto/create-abogado.dto.js';
import { UpdateAbogadoDto } from './dto/update-abogado.dto.js';

@ApiTags('abogados')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('municipios')
export class AbogadosController {
  constructor(private readonly abogadosService: AbogadosService) {}

  @Get(':municipioId/abogados')
  @UseGuards(ScopeGuard)
  @RequireScope(ScopeType.MUNICIPIO, 'municipioId')
  findByMunicipio(
    @Param('municipioId', ParseIntPipe) municipioId: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.abogadosService.findByMunicipio(municipioId, user);
  }

  @Post(':municipioId/abogados')
  @UseGuards(ScopeGuard)
  @RequireScope(ScopeType.MUNICIPIO, 'municipioId')
  create(
    @Param('municipioId', ParseIntPipe) municipioId: number,
    @Body() dto: CreateAbogadoDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.abogadosService.create(municipioId, dto, user);
  }
}

@ApiTags('abogados')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('abogados')
export class AbogadosStandaloneController {
  constructor(private readonly abogadosService: AbogadosService) {}

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAbogadoDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.abogadosService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.abogadosService.remove(id, user);
  }
}
