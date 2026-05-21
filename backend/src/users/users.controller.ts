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
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../common/types/request-with-user.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AddScopeDto } from './dto/add-scope.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() actor: UserWithScopes,
  ) {
    return this.usersService.list(query, actor);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: UserWithScopes,
  ) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: UserWithScopes,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: UserWithScopes,
  ) {
    return this.usersService.deactivate(id, actor);
  }

  @Post(':id/scopes')
  @HttpCode(HttpStatus.CREATED)
  addScope(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddScopeDto,
    @CurrentUser() actor: UserWithScopes,
  ) {
    return this.usersService.addScope(id, dto, actor);
  }

  @Delete(':id/scopes/:scopeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeScope(
    @Param('id', ParseIntPipe) id: number,
    @Param('scopeId', ParseIntPipe) scopeId: number,
    @CurrentUser() actor: UserWithScopes,
  ) {
    return this.usersService.removeScope(id, scopeId, actor);
  }
}
