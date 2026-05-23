import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../common/types/request-with-user.js';
import { CoordinadorService } from './coordinador.service.js';
import { PatchAdhocDto } from './dto/patch-adhoc.dto.js';

@ApiTags('coordinador')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('coordinador')
export class CoordinadorController {
  constructor(private readonly coordinadorService: CoordinadorService) {}

  @Get(':scopeType/:id/display')
  display(
    @Param('scopeType') scopeType: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coordinadorService.display(scopeType, id);
  }

  @Patch(':scopeType/:id/adhoc')
  @UseGuards(RolesGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
  )
  patchAdhoc(
    @Param('scopeType') scopeType: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchAdhocDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.coordinadorService.patchAdhoc(scopeType, id, dto, user);
  }
}
