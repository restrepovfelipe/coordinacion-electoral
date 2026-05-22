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
import { Role, ScopeType } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { ScopeGuard } from '../../common/guards/scope.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScope } from '../../common/decorators/require-scope.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { TestigosService } from './testigos.service.js';
import { CreateTestigoDto } from './dto/create-testigo.dto.js';
import { UpdateTestigoDto } from './dto/update-testigo.dto.js';
import { ListTestigosQueryDto } from './dto/list-testigos-query.dto.js';
import { BulkAssignDto } from './dto/bulk-assign.dto.js';

@ApiTags('testigos')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('puestos')
export class TestigosController {
  constructor(private readonly testigosService: TestigosService) {}

  @Get(':puestoId/testigos')
  findByPuesto(@Param('puestoId', ParseIntPipe) puestoId: number) {
    return this.testigosService.findByPuesto(puestoId);
  }

  @Post(':puestoId/testigos')
  @UseGuards(RolesGuard, ScopeGuard)
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
    // PUESTO_COORDINATOR excluded: canDo(PUESTO, testigos, CREATE) = false
  )
  @RequireScope(ScopeType.PUESTO, 'puestoId')
  create(
    @Param('puestoId', ParseIntPipe) puestoId: number,
    @Body() dto: CreateTestigoDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.create(puestoId, dto, user);
  }

  @Patch(':id/testigos/:testigoId')
  updateNested(
    @Param('testigoId', ParseIntPipe) testigoId: number,
    @Body() dto: UpdateTestigoDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.update(testigoId, dto, user);
  }

  @Delete(':id/testigos/:testigoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeNested(
    @Param('testigoId', ParseIntPipe) testigoId: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.remove(testigoId, user);
  }
}

@ApiTags('testigos')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('testigos')
export class TestigosStandaloneController {
  constructor(private readonly testigosService: TestigosService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  list(
    @Query() query: ListTestigosQueryDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.list(query, user);
  }

  @Patch('bulk-assign')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  bulkAssign(
    @Body() dto: BulkAssignDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.bulkAssign(dto.testigoIds, dto.puestoId, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestigoDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.testigosService.remove(id, user);
  }
}
