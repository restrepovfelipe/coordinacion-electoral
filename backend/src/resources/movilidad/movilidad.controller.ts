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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScopeType } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { MovilidadService } from './movilidad.service.js';
import { CreateMovilidadDto } from './dto/create-movilidad.dto.js';
import { UpdateMovilidadDto } from './dto/update-movilidad.dto.js';

@ApiTags('movilidad')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('movilidad')
export class MovilidadController {
  constructor(private readonly movilidadService: MovilidadService) {}

  @Get()
  findByScope(
    @Query('scopeType') scopeType: ScopeType,
    @Query('scopeId', ParseIntPipe) scopeId: number,
  ) {
    return this.movilidadService.findByScope(scopeType, scopeId);
  }

  @Post()
  create(
    @Body() dto: CreateMovilidadDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.movilidadService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMovilidadDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.movilidadService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.movilidadService.remove(id, user);
  }
}
