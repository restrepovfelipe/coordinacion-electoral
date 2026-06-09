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
import { Role, ScopeType } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { ScopeGuard } from '../../common/guards/scope.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScope } from '../../common/decorators/require-scope.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { VoluntariosService } from './voluntarios.service.js';
import { CreateVoluntarioDto } from './dto/create-voluntario.dto.js';
import { UpdateVoluntarioDto } from './dto/update-voluntario.dto.js';

@ApiTags('voluntarios')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('comunas')
export class VoluntariosController {
  constructor(private readonly voluntariosService: VoluntariosService) {}

  @Get(':comunaId/voluntarios')
  findByComuna(@Param('comunaId', ParseIntPipe) comunaId: number) {
    return this.voluntariosService.findByComuna(comunaId);
  }

  @Post(':comunaId/voluntarios')
  @UseGuards(RolesGuard, ScopeGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
  )
  @RequireScope(ScopeType.COMUNA, 'comunaId')
  create(
    @Param('comunaId', ParseIntPipe) comunaId: number,
    @Body() dto: CreateVoluntarioDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.voluntariosService.create(comunaId, dto, user);
  }

  @Patch(':comunaId/voluntarios/:voluntarioId')
  @UseGuards(RolesGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
  )
  update(
    @Param('voluntarioId', ParseIntPipe) voluntarioId: number,
    @Body() dto: UpdateVoluntarioDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.voluntariosService.update(voluntarioId, dto, user);
  }

  @Delete(':comunaId/voluntarios/:voluntarioId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
  )
  remove(
    @Param('voluntarioId', ParseIntPipe) voluntarioId: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.voluntariosService.remove(voluntarioId, user);
  }
}
