import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { RefrigeriosService } from './refrigerios.service.js';
import { CreateRefrigerioDto } from './dto/create-refrigerio.dto.js';
import { UpdateRefrigerioDto } from './dto/update-refrigerio.dto.js';

@ApiTags('refrigerios')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('refrigerios')
export class RefrigeriosController {
  constructor(private readonly refrigeriosService: RefrigeriosService) {}

  @Post()
  create(
    @Body() dto: CreateRefrigerioDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.refrigeriosService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRefrigerioDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.refrigeriosService.update(id, dto, user, ifMatch);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.refrigeriosService.remove(id, user);
  }
}
