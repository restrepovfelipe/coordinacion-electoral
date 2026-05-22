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
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../common/types/request-with-user.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateSelfDto } from './dto/update-self.dto.js';
import { AddScopeDto } from './dto/add-scope.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Self-profile: available to any authenticated user (no role guard needed at method level)
  @Patch('me')
  @Roles(
    Role.SUPER_ADMIN,
    Role.REGIONAL_COORDINATOR,
    Role.MUNICIPAL_COORDINATOR,
    Role.ZONE_COORDINATOR,
    Role.COMUNA_COORDINATOR,
    Role.PUESTO_COORDINATOR,
  )
  async updateSelf(
    @Body() dto: UpdateSelfDto,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<Omit<UserWithScopes, 'cipUid'>> {
    return this.usersService.updateSelf(actor, dto);
  }

  // List: SUPER_ADMIN and REGIONAL can list users
  @Get()
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<{ data: Array<Omit<UserWithScopes, 'cipUid'>>; total: number; page: number; limit: number }> {
    return this.usersService.list(query, actor);
  }

  // Get single user: SUPER_ADMIN and REGIONAL
  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Omit<UserWithScopes, 'cipUid'>> {
    return this.usersService.findOne(id);
  }

  // Create: SUPER_ADMIN and REGIONAL (service enforces REGIONAL cannot assign SUPER_ADMIN role)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<Omit<UserWithScopes, 'cipUid'>> {
    return this.usersService.create(dto, actor);
  }

  // Edit: SUPER_ADMIN edits anyone; REGIONAL edits non-SUPER_ADMINs (enforced in service)
  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<Omit<UserWithScopes, 'cipUid'>> {
    return this.usersService.update(id, dto, actor);
  }

  // Delete: SUPER_ADMIN only
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SUPER_ADMIN)
  async hardDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<void> {
    await this.usersService.hardDelete(id, actor);
  }

  // Scope management: SUPER_ADMIN and REGIONAL
  @Post(':id/scopes')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async addScope(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddScopeDto,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<void> {
    await this.usersService.addScope(id, dto, actor);
  }

  @Delete(':id/scopes/:scopeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async removeScope(
    @Param('id', ParseIntPipe) id: number,
    @Param('scopeId', ParseIntPipe) scopeId: number,
    @CurrentUser() actor: UserWithScopes,
  ): Promise<void> {
    await this.usersService.removeScope(id, scopeId, actor);
  }
}
